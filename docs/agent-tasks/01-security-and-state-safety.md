# Agent brief 01 — OAuth token in URL, safe sign-out, error boundary, hook-lint debt

**Status:** Not started

## Bookkeeping — you do this yourself; the user will not

1. **Right now:** change the `Status:` line at the top of this file to `In progress (started YYYY-MM-DD)`.
2. **As you go:** when a task/item finishes, note it under the Status line (`- Task 1: done YYYY-MM-DD — <one line>`). If you skip, defer or only partly finish something, say so there with the reason — never leave a silent gap.
3. **When you finish everything:** set `Status: Done YYYY-MM-DD — <outcome, and anything left over>`.
4. **Log the work** in `docs/features/implemented-features.md` using the entry template in `docs/README.md` (what, why, files, decisions, bugs found, verified vs. not verified, not built) — one entry per task/item.
5. **Keep the other docs true** per CLAUDE.md "How to write and maintain the docs": update CLAUDE.md only where a rule/pattern/store/migration changed, update BACKLOG.md's "Pattern retrofit backlog" if a listed pattern's state changed, and fix any doc mention of code you removed or renamed.
6. Tell the user, in your final message, which migration (if any) they need to run and anything you couldn't verify.

**Priority: do now.** Self-contained: an agent can start from this file plus `CLAUDE.md`. Read `CLAUDE.md` first (especially "Pattern governance", "Component patterns", "Live migration status"), then this.

Work through the tasks in order. After each: `npx tsc -b`, `npm run build`, `npx eslint <files you touched>`, and verify behaviour (see each task's "Verify"). Don't commit unless asked. Log each finished task in `docs/features/implemented-features.md`, and update `CLAUDE.md` only where a rule/pattern/migration status changes.

---

## Task 1 — Stop putting the user's Supabase access token in the OAuth URL

### The problem

The Strava and Google Calendar connect flows leave the app for the provider's consent page and come back through a Vercel edge function (`api/strava-oauth-callback.ts`, `api/google-calendar-oauth-callback.ts`). A full-page redirect can't carry an `Authorization` header, so the client builds the authorize URL with **the user's live Supabase access token (a JWT) as the OAuth `state` parameter** (`src/services/strava.ts` → `getStravaConnectUrl`, `src/services/googleCalendar.ts` → `getGoogleCalendarConnectUrl`). The callback reads `state`, calls `getUserClient(state)` (`api/_lib/supabaseEdge.ts`), and writes the connection row as that user so RLS applies.

Why that's a problem: the token travels in a URL, so it lands in the provider's request logs (Google/Strava), Vercel's request logs, browser history, and any `Referer` header sent from the redirected page. While valid (~1 h) it is a full credential for the account — it can read every table (including encrypted note blobs and the vault's wrapped keys). It isn't exploitable by a random visitor, but it's the wrong place for a credential and it would be flagged in any security review.

### What "done" looks like

1. **No access token, refresh token or other credential appears in any URL** the app builds or receives (authorize URL, `state`, redirect URLs). Grep the repo for `state:` in both services and confirm.
2. The connect flow still works end to end for **Google Calendar and Strava**, on the PWA and in the Tauri desktop build. (Tauri loads static files and calls `/api/*` through `apiFetch` → `@tauri-apps/plugin-http`; the OAuth redirect itself lands in the browser at the Vercel origin — check how the current flow behaves there and don't make it worse.)
3. `state` is a **single-use, short-lived (≤10 min), unguessable value bound to the user and provider**, verified by the callback, and rejected if reused, expired, or for the wrong provider. Reject rather than silently proceed.
4. The invariant "**no Supabase service-role key anywhere**" (CLAUDE.md "Google Calendar sync": every edge function authenticates as the signed-in user via RLS) is either preserved or deliberately, explicitly changed and documented. Prefer preserving it.

### Design options (choose, justify in the docs entry)

The callback has no user session, so it needs *some* way to know who is connecting and to write the row.

- **A (recommended — keeps "no service role"): nonce table + security-definer functions.** New migration `032_oauth_state.sql` (next free number — `031` is `drop cross_app_links`): table `oauth_states(nonce text primary key, user_id uuid not null, provider text not null, expires_at timestamptz not null)`, **no grants to `authenticated` or `anon`** (only functions touch it). Function `mint_oauth_state(p_provider text) returns text` — `security definer`, uses `auth.uid()`, generates ≥128-bit random nonce, inserts, returns it; `grant execute … to authenticated`. Function `consume_oauth_state(p_nonce text, p_provider text) returns uuid` — `security definer`, deletes and returns `user_id` only if unexpired and matching provider, else null; `grant execute … to anon`. The client calls `mint_oauth_state` via `supabase.rpc` and uses the nonce as `state`. The callback needs to write the connection row *without* a user token, so add security-definer functions `save_strava_connection(p_nonce, …)` / `save_calendar_connection(p_nonce, …)` that consume the nonce and do the upsert for that user. Follow the repo's migration rules (own grants, listed in "Migration history" and "Live migration status" as **Pending — not yet run**; tell the user to run it; never mark it Applied yourself).
- **B: HMAC-signed state + service-role client in the two callbacks only.** Simpler SQL, but introduces `SUPABASE_SERVICE_ROLE_KEY` to Vercel — a real change to the security model (bypasses RLS). Only choose this with an explicit note in CLAUDE.md and scope the client to inserting exactly the verified user's row.
- **C: finish the OAuth in the SPA** (redirect lands on a client route, client POSTs `{code}` with its normal Bearer). No token in the URL and no service role — but it needs a signed-in session *at the redirect destination*, which the Tauri/Android webviews don't have when the redirect lands on the Vercel origin. Only viable if you also solve that.

Also consider **login-CSRF** (attacker starts a flow with their own state and tricks a victim into completing it, attaching the victim's calendar to the attacker's account). The current design resists it only because the state is the victim's own secret token. With option A/B, document how the state is bound to the browser that started the flow (e.g. also stash the nonce in `sessionStorage`/an HttpOnly cookie and compare on return) or explicitly record why the residual risk is accepted.

### Verify

You can't run edge functions on the Vite dev server — use `npx vercel dev --listen 3000` (see CLAUDE.md "`vercel dev` is the correct way to exercise `/api/*` locally", including the gotcha that env vars must exist in Vercel's **Development** scope). Test: connect → success redirect and connection row present; reuse the same state URL a second time → rejected; wait past expiry → rejected; state minted for Strava presented to the Google callback → rejected. Watch the browser network panel and the `vercel dev` output and confirm the string `eyJ` (the start of any JWT) appears in no URL. Unit-test the nonce logic if you add helpers.

---

## Task 2 — Make sign-out clear this device's data safely

### The problem

`src/store/authStore.ts` → `signOut()` wipes only tasks, collections, tags, purposes, calendar events/reminders and tracker entries, then removes three localStorage keys. It leaves **Notes, note tags, structured tag entries, Lists, Schedules, Portfolio** (and the decrypted-plaintext caches, Quick Access history, and remembered selection ids in `uiStore`) on the device. On a shared computer the next person to sign in sees the previous account's data until sync overwrites it; a *different* account signing in can also have that stale data uploaded into its cloud if the "remote looks empty → push local up" branch of `runInitSync` triggers. That was deferred earlier because clearing a store is only safe when its data is confirmed in the cloud. Notes and Portfolio sync are now live (migrations 020/021 applied), so the blocker is gone — but the constraint remains and this task must honour it.

### Constraints — read before coding

- **Never wipe data that only exists locally.** Not cloud-synced today: `fitnessStore` (activities, activity types), `routineStore` (routine instances), `portfolioStore.columnConfig`, `settingsStore`, `hotkeyOverridesStore`, `notificationStore`. Wiping these on sign-out would destroy the user's only copy. Leave them, and **tell the user** in the sign-out confirmation what stays on this device and why. (Fitness is barely built yet, so this costs little today. BACKLOG.md "Data that exists only on one device" tracks giving Fitness and routine instances cloud sync; when either gains sync it must be added to this wipe list in the same change.)
- **Stop sync before clearing anything** (`stopSync()` first) — already the rule in `signOut` and in CLAUDE.md "Sign-out no longer emits a cloud-wide soft-delete". A wipe with sync live is read as "user deleted everything".
- **Don't clear stores whose last sync failed.** `syncService` isolates failures per table (`SYNC_TABLES`, "Per-table failure isolation"). Before wiping, make sure everything is safely in the cloud: call `forceUpload(userId)` (it returns `UploadCounts` and throws/reports per-table errors). If any table failed to upload, **don't wipe silently** — use `confirmDialog({ title, message, destructive: true, confirmLabel: 'Sign out and discard' })` (`src/components/ConfirmDialog/dialogs.ts`; never `window.confirm`) naming what wasn't saved, and let the user cancel. If the device is offline, treat it as "can't confirm" and ask.
- Encrypted content: lock the vault (`lockVault()` in `src/services/vault.ts` — it flushes pending encryptions, wipes the plaintext caches and untrusts the device) *before* clearing note/list stores, so nothing in flight is lost and no decrypted text or trusted-device key stays behind.

### What "done" looks like

- Signing out clears (in memory **and** their localStorage keys) every **cloud-synced** store: task, calendar, tracker, schedule, note (including `structuredTagEntries`), list (including custom list types — but re-seed the built-in list types exactly as `listStore` does on load, don't leave `listTypes` empty), portfolio (watchlist items, portfolio tags, investment purposes — keep `columnConfig`), plus `recentItemsStore` and the account-specific selection ids in `uiStore` (`activeTrackerId`, `activeRoutineId`, `notesLastEditingNoteId`, `selectedNoteTagId`, `listsLast*`, `activeCollectionIdByView`, `activePurposeIds`).
- Signing out then signing in as a **different** account shows none of the previous account's data and uploads none of it.
- Signing out then back in as the **same** account restores everything from the cloud (nothing lost).
- The confirmation lists what stays on the device (Fitness, Routine history) and why.
- All persisted keys touched are the ones in `PERSISTED_STORAGE_KEYS` (`src/config/backup.ts`) — don't hard-code a second list.

### Verify

Script it (Playwright against `vite`, see docs/agent-tasks/02 for the harness; seed stores via `import('/src/store/…')` as earlier sessions did): seed data in every store → sign out → assert synced stores empty, local-only stores intact; simulate a failing table and assert the warning appears and cancelling keeps the user signed in with data intact.

---

## Task 3 — Add error boundaries *(recommended addition — strike it if you don't want it)*

### The problem

There is no React error boundary anywhere. Any exception thrown during render (a malformed persisted record, an unexpected `null`) unmounts the whole tree and leaves a blank white page — the user can't reach Settings, can't export a backup, and reloading re-crashes on the same data.

### What "done" looks like

- A top-level `ErrorBoundary` (class component with `getDerivedStateFromError` / `componentDidCatch`) around `<App />` in `src/main.tsx`, with a themed fallback: what happened in one line, **Reload**, and **Export backup** (reuse the raw-localStorage export logic behind `PERSISTED_STORAGE_KEYS`, which works without the app rendering), plus the error message in a collapsed "Details".
- A **per-section** boundary around each section in `App.tsx` so a crash in Notes doesn't take down Tasks; the fallback offers "Reload this section" (reset the boundary) and leaves navigation working.
- Errors are logged with `console.error` including the component stack. No new dependency.
- Copy for the fallback goes in `config/labels.ts`.

### Verify

Temporarily throw in one section's render and confirm: that section shows the fallback, the nav still works and other sections are fine; a top-level throw shows the full-page fallback with a working backup download. Remove the throw.

---

## Task 4 — Clear the `react-hooks` lint debt (35 × `set-state-in-effect`, plus refs/immutability)

### What the rule means

`react-hooks/set-state-in-effect` flags calling `setState` directly in the body of a `useEffect`. React's guidance: an effect is for syncing with something *outside* React; if you're only resetting state because a prop changed, that costs an extra render (the component renders with stale state, the effect fires, it renders again) and is easy to get subtly wrong. It isn't a bug today, but the codebase uses one pattern almost everywhere: *"when the modal opens / the edited item changes, copy its fields into local state"* — e.g. `AddScheduleModal`:

```tsx
useEffect(() => {
  if (editingSchedule) { setName(editingSchedule.name); … } else { setName(''); … }
}, [editingSchedule?.id, isVisible]);
```

`npx eslint .` currently reports **82 errors and 10 warnings** (after the clean-up on 2026-09-20 removed build-output noise): 35 `set-state-in-effect`, 6 `immutability`, 9 `refs`, 13 `no-explicit-any`, 7 `no-unused-vars`, 4 `ban-ts-comment`, 3 `no-empty`, 10 `exhaustive-deps` warnings, and a few others. The 35 are in: `AddActivityModal`, `AddCollectionModal`, `AddEntryModal`, `AddListItemModal`, `AddListModal`, `AddNoteModal`, `AddPurposeModal`, `AddScheduleModal`, `AddTagModal`, `AddTaskModal`, `AddWatchlistItemModal`, `CalendarEventPane`, `CalendarReminderPane`, `CalendarSidePane`, `CalendarView`, `EditActivityTypeModal`, `EditNoteMetaModal`, `EditNoteTagModal`, `EditRoutinePane`, `EditTrackerPane`, `FitnessSection`, `ItemActions/useItemActions`, `ListsSection` (×2), `MobileCalendarQuickAdd`, `MobileMoreSheet`, `NoteEditorPane`, `FloatingToolbar`, `NoteEditor`, `QuickAccessPane` (×2), `TaskList`, `TaskPane`, `TimeInput`, `TickerChart`. (Re-run eslint for exact lines.)

### How to fix — preferred patterns, in order

1. **Most of these forms are only mounted while open** (`App.tsx`: `{openModal === 'add-x' && <AddXModal />}`). Then compute initial state once with a lazy initializer — `useState(() => editing?.name ?? '')` — and delete the effect.
2. Where a component stays mounted and the *edited item* changes, remount it from the call site with a key (`<EditTrackerPane key={editingTrackerId} />`) and use lazy initializers inside.
3. Where state truly must follow a prop, derive it during render, or use the "adjust state while rendering" pattern (`if (prev !== next) { setPrev(next); setX(...) }` — already used in `CalendarSidePane`'s `MiniDatePicker`).
4. Only if none apply (a genuine external-system sync), keep the effect and add a one-line `// eslint-disable-next-line react-hooks/set-state-in-effect -- <why>`.

Also fix the `immutability` errors caused by an effect referencing a `const` handler declared below it (`AddNoteModal`, `AddNoteTagModal`, `BulkUploadWatchlistModal`, `ListsSection`, `NoteEditor` — 6 sites): move to `useCtrlEnterSubmit` (`src/hooks/useCtrlEnterSubmit.ts`) with a function-declaration handler, exactly as `EditTrackerPane` now does. Leave `react-hooks/refs` in `NoteEditor`/`ChronicleView` for docs/agent-tasks/02 (it needs a larger refactor) unless a fix falls out naturally.

### Guardrails — this is a refactor of ~35 forms; regressions are the risk

- **One file at a time**, `tsc` + a real check after each. For every modal touched, verify in a browser: *create mode opens blank; edit mode opens with the item's values; switching from editing item A directly to item B shows B's values (not A's); Escape and Ctrl+Enter still work; cancelling leaves the store untouched.* Use the Playwright approach from earlier sessions (isolated scratch project with `playwright-core` + system Edge, dev server on a spare port; seed via `import('/src/store/…')` in `page.evaluate`).
- Don't change what a form does — only how its initial state is produced. No visual or copy changes.
- If a file gets hairy, leave it with a documented disable rather than risk it, and list it in the docs entry.
- Aim for zero `set-state-in-effect` errors; `npx eslint . ` should end with no *new* errors elsewhere.

---

## When done

The **Bookkeeping** section at the top applies: set the Status line to Done with the outcome, and log every finished task/item. In addition:

1. Record each task in `docs/features/implemented-features.md` (what, why, files, how verified, what was left).
2. Update `CLAUDE.md`: "Live migration status" / "Migration history" if you added a migration (status **Pending** until the user confirms); remove or adjust anything this made untrue (e.g. the sign-out caveat in the cross-device-sync entry); note the ErrorBoundary in the file-structure map.
3. Update BACKLOG.md's "Pattern retrofit backlog" if you changed the state of any listed pattern.
4. Tell the user which migration (if any) to run.
