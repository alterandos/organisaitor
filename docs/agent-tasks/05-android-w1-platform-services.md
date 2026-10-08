# 05 — Android W1: platform services (network, OAuth return, file export, keyboard)

Status: Done 2026-10-04 — built on branch `android/w1-platform-services` (not merged). Migration `041` written, **pending until the user runs it**. Real Google/Strava connect not verified end to end (see `docs/android/implementation-status.md` "W1 — platform services").

Makes the parts of the app that talk to the outside world work in the Android build: `/api/*` calls, Strava/Google sign-in coming back to the app, saving files, and the soft keyboard. Workstream **W1** in `docs/android/10-gap-analysis.md` (gaps A1, A2, A7, A9).

**Runs in parallel with W2** (`06-android-w2-mobile-primitives.md`). Each brief owns different files; see "Files you own" and stay inside them. Work in your own git worktree on branch `android/w1-platform-services`. Commit there; don't merge to `main` or push. The user merges.

## Read first
1. `CLAUDE.md`, in full.
2. `docs/android/11-design-and-coding-patterns.md`, especially §2 (platform branching), §11 (native capabilities) and §12 (platform services, which this brief implements).
3. `docs/android/10-gap-analysis.md` rows A1, A2, A7, A9 and decision D5.
4. `docs/android/implementation-status.md`: how the Android build is set up and verified (emulator, CDP method, JDK 21 / `local.properties` gotchas).

If you hit a genuine ambiguity this brief doesn't settle, stop and ask the user. Don't guess.

## Files you own
`src/utils/apiFetch.ts` (+ test), new `src/utils/saveFile.ts` (+ test), `src/utils/backupExport.ts`, `src/services/strava.ts`, `src/services/googleCalendar.ts`, `src/services/oauthState.ts`, new `src/services/android/deepLinks.ts`, `api/strava-oauth-callback.ts`, `api/google-calendar-oauth-callback.ts`, the OAuth-connect call sites (`FitnessSection.tsx`, `CalendarSidePane.tsx`: connect button handlers only), a new migration file, `capacitor.config.ts`, `android/app/src/main/AndroidManifest.xml`, `package.json` (plugin installs), `src/test/patterns.test.ts` (one new check).

In `src/App.tsx`, add **one new `useEffect`** for the deep-link listener and touch nothing else in that file. W2 is editing the `backButton` effect.

## Tasks

### T1. `/api/*` on Android (gap A1)
`apiFetch()` only special-cases Tauri; on Android the page origin is `https://localhost`, so every `/api/*` call fails (Google Calendar sync, Strava, Portfolio quotes, dictation).
- Add an Android branch that calls `PRODUCTION_API_ORIGIN + path` through `CapacitorHttp` (from `@capacitor/core`; native HTTP, no CORS) and adapts the result into a standard `Response`, so callers are unchanged.
- **Don't** enable `CapacitorHttp` globally in `capacitor.config.ts`: that patches every `fetch`, Supabase included.
- Check every `apiFetch` caller's request body (JSON strings; `speech-recognize` sends audio) and what it reads back (`ok`, `status`, `json()`). Make the adapter cover exactly those.
- Tests: `src/utils/apiFetch.test.ts` with `@capacitor/core` mocked: web uses plain fetch; Android hits the production origin; status, headers and JSON body survive the adapter.
- Pattern test: no `fetch('/api` / ``fetch(`/api`` outside `apiFetch.ts`.

### T2. OAuth return to the app (gap A2, decision D5)
Today the Strava and Google connect flows break in a packaged app in two ways:
1. `services/strava.ts` and `services/googleCalendar.ts` build `redirect_uri` from `window.location.origin`. That's `https://localhost` on Android (and likely `tauri://…` on desktop), so the provider redirects nowhere useful. Under native (Android and Tauri), use the production origin. Export a small helper beside `PRODUCTION_API_ORIGIN` rather than repeating the check.
2. The callbacks (`api/*-oauth-callback.ts`) finish by redirecting to `${origin}/?strava=connected`, which loads the *web* app inside the browser, not our app.

Decided design (D5):
- On Android, open the provider's authorise URL with `@capacitor/browser`.
- The callback, after saving the connection exactly as today, redirects to `organisaitor://oauth-done?provider=<strava|google-calendar>&status=<connected|error>&reason=…` **when the flow was started from the Android app**, and to today's web URL otherwise.
- The callback needs to know where the flow started. The recommended way: record it with the nonce. Add an optional `p_client text default 'web'` to `mint_oauth_state` (or a new overload) and make the save functions return it. See `supabase/migrations/032_oauth_state.sql`.
- Follow CLAUDE.md "Supabase sync → Migrations" exactly (the record is `docs/supabase/migrations.md`). Additive only (ADR-9). List it as **Pending — not yet run**, tell the user to run it, and never mark it Applied yourself.
- Use the next free migration number. `041`/`042` are reserved in planning docs for notifications work, so if you take 041, renumber those mentions in `docs/android/05-notifications.md` and BACKLOG.md.
- **Degrade gracefully** until the migration is applied: if the two-argument mint fails, fall back to the current call, so web and desktop never break.
- Register the `organisaitor` scheme in `AndroidManifest.xml` (intent-filter on `MainActivity`; see Capacitor's deep-link docs).
- New `src/services/android/deepLinks.ts`: **the one** `appUrlOpen` router, with `registerDeepLink(host, handler)`. Notifications (W9) will register `open` routes on it later. In `App.tsx`, one Android-gated effect starts it.
- The `oauth-done` handler: `Browser.close()`, refresh the provider's status (`checkStravaStatus` / `fetchGoogleCalendarConnections`, whatever the existing post-connect code does on web, which handles `?strava=connected`), and show a `showToast` with the result.

### T3. Saving files (gap A7)
`<a download>` (used by `downloadBackup()` and `downloadAutoBackupSnapshot()` in `utils/backupExport.ts`, and so by Account, Integrations, Auto-backup and the ErrorBoundary's "Export backup") does nothing in an Android WebView.
- Install `@capacitor/filesystem` and `@capacitor/share`; run `npx cap sync android`.
- New `utils/saveFile.ts`: `saveFile(filename: string, blob: Blob): Promise<void>`. On web and Tauri, today's anchor download (moved here). On Android, write the file to `Directory.Cache` and open the share sheet (`Share.share({ files: [uri] })`).
- Every export calls it. Grep for `.download =` and `createObjectURL` to be sure nothing else downloads.
- Check on the emulator that **restore/import** via `<input type="file">` (Account → Restore; Calendar ICS import) opens the file picker. Fix only if it doesn't.
- Test: `saveFile.test.ts` (web path uses an anchor; Android path calls Filesystem then Share, with plugins mocked).
- Add `utils/saveFile.ts` to CLAUDE.md's file structure.

### T4. Soft keyboard (gap A9)
`capacitor.config.ts` already has `Keyboard: { resize: 'body' }`. On the emulator, with the keyboard up, check:
- `MobileQuickAddBar` (Tasks);
- `MobileCalendarQuickAdd`;
- the bottom field of a full-screen modal (e.g. `AddTaskModal` notes).

Each must stay visible and usable above the keyboard. Fix only what's broken, scoped to `:global(.platform-android)`. Add `enterKeyHint` to the two quick-add title inputs (`"done"`). (Moving a broken bar is in scope even though the component isn't in your file list. Keep the change minimal and mention it in your report.)

## Out of scope
Everything in W2 (back button, sheets, long-press, swipe, toasts). The Notifications deep-link routes (W9). Any section UI.

## Verify
- `npm run check` passes at the eslint baseline (see CLAUDE.md Testing), with the new tests included.
- On the Play-Store API 35 emulator, via CDP (method in `implementation-status.md`):
  - Portfolio ticker search returns results.
  - Google Calendar connect: completes, returns to the app, toast shown, calendars listed, sync pulls events.
  - Strava connect: same (if credentials are available; otherwise say so).
  - Backup export opens the share sheet with a valid JSON file.
  - Restore picks a file.
  - The keyboard checks in T4.
- Web build: connect flows and backup download still behave exactly as before.
- Report plainly what was verified and what wasn't (e.g. Strava without test credentials; anything only checked on the emulator).

## When done
- Update `docs/android/implementation-status.md` with a new "W1 — platform services" section: what was built, file manifest, verified vs not.
- In `docs/android/10-gap-analysis.md`, mark A1, A2, A7, A9 done (with the date) and set W1's row to done.
- Add an entry to `docs/features/implemented-features.md`.
- In BACKLOG.md, rewrite the "Desktop (Tauri) API access … Android equivalent still open" section to say it's built.
- In CLAUDE.md, update the file structure and migration tables (plus the Tauri `redirect_uri` fix, if you made it).
- Set this brief's `Status:` line.
