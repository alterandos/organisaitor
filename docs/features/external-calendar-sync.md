# External calendar sync — Google, Phase 1

<!-- Moved out of CLAUDE.md on 2026-09-20 to keep that file to rules and patterns. Text elsewhere that says
     "CLAUDE.md's <section>" refers to the matching section in this file or in another docs/ file. -->

## External calendar sync (Google, Phase 1 — read-only ingest, unidirectional, this app becomes the source of truth once an event is pulled in)

Researched first (see "Original viability analysis" at the end of this file), then confirmed with the user before building: architecturally almost identical to the Strava integration already in this app (same nonce-in-`state`-param redirect-identity fix, same "client never sees tokens" boundary, same edge-function shape) — see "Strava integration — built" for the pattern this directly reuses. The one place it's genuinely more than "more of the same" is that a user can connect **multiple accounts of the same provider** (e.g. two Google accounts), which Strava's schema never had to support.

**Scope, as confirmed with the user:**
- **One-way only**: Google → this app. Nothing created or edited in this app ever pushes back to Google. No conflict resolution needed at all, which is most of why this is simpler than a "real" two-way sync would be.
- **Fully editable once imported, not read-only** — a synced event becomes a completely normal `CalendarEvent`. This app is the source of truth for it from that point on: **sync only ever creates new events, and never touches an already-imported one again**, in either direction. Deleting an imported event locally is permanent — a later sync pass will not resurrect it (see the dedup ledger below). Editing one locally is never overwritten by a future sync.
- **Calendar events only** — "reminders" in the request meant point-in-time Calendar events, not Google Tasks (a separate, deprecated-Reminders-replacement product with its own API) — Google Tasks integration is out of scope and not part of this feature.
- **Sync trigger**: runs while the app is open (on load/sign-in, then every 15 minutes — `App.tsx`), not a server-side cron. Confirmed with the user specifically to avoid needing a Supabase **service-role** credential, which this app has never needed anywhere else — every existing edge function (Strava's included) authenticates as the signed-in user via RLS, and this keeps that invariant intact. A real background cron (works even with the app fully closed) is a documented possible Phase 2, not built.
- **Recurring events**: Google's `events.list` is called with `singleEvents=true`, which asks Google to expand a recurring event into concrete individual instances server-side — sidesteps translating Google's `RRULE` into this app's own, deliberately simpler `RepeatConfig` (the same reasoning the Schedule feature's own RFC 5545 subset already used). Each instance becomes its own independent, standalone `CalendarEvent` — editing "this and all following" doesn't apply to imported events.
- **Sync window**: 1 month back / 6 months forward (`SYNC_WINDOW_PAST_DAYS`/`SYNC_WINDOW_FUTURE_DAYS`, `api/_lib/googleCalendar.ts`) — pulling in an account's entire history would be both pointless for a planning calendar and slow. A fixed constant, not user-configurable in this pass.
- **Calendar picker**: after connecting an account, the user chooses which of its calendars to sync (a Google account often has several — personal, holidays, shared ones) rather than everything syncing by default.

### Data model

`CalendarEvent` gained five provenance fields, all `null` for a native, in-app-created event (see `types/index.ts`):
```typescript
source:             string | null;   // 'google' (future: 'microsoft'); null = native
sourceConnectionId: string | null;   // which connected ACCOUNT — see CalendarConnection below
sourceCalendarId:   string | null;   // which calendar within that account
sourceEventId:      string | null;   // the provider's own event id
sourceRaw:          Record<string, unknown> | null;  // full provider payload, so surfacing more fields later isn't a re-sync
```
`(sourceConnectionId, sourceCalendarId, sourceEventId)` together are the dedup key — deliberately three separate fields rather than a single `source: 'google'` string, specifically to support multiple connected accounts of the same provider without collisions (a real requirement the user raised, not a hypothetical). `calendarStore` bumped to **v5**, migration backfills all five to `null`. Supabase: `018_calendar_sync.sql` adds the matching five columns to `calendar_events` (applied to live — see "Live migration status") — `source_connection_id` stays plain `text`, no foreign key, matching this schema's established convention for cross-entity id columns (`collection_id`, `list_id`, etc.).

A new client-side-only type, `CalendarConnection` (`{ id, provider, accountEmail, calendars: { id, name, color, enabled }[], createdAt }`), represents one connected account — never carries tokens (those stay server-side; see `api/google-calendar-status.ts`). Multiple `CalendarConnection`s can share the same `provider`.

**The "don't resurrect a locally-deleted import" ledger**: since sync never touches an already-imported event again, the natural failure mode is a *deleted* one reappearing on the next sync pass (nothing about a live `events` record indicates "this was deleted, not just never seen"). `calendarStore.importedSourceKeys: string[]` — a flat list of every `${connectionId}::${calendarId}::${eventId}` composite key ever imported, kept even after the resulting `CalendarEvent` is deleted — is checked (alongside a live-`events` scan, which separately guards against creating a duplicate if the same Google event is somehow synced twice) before `upsertSyncedEvent()` creates anything. Deliberately **local-only, not part of the Supabase-synced entity rows** — a known, accepted limitation: a narrow multi-device race is possible if two devices both poll independently within the same sync-latency window before either's creation has propagated (this app's cross-device sync has no stronger guarantee anywhere else either, so this isn't a new category of risk). The existing `calendar_events.deleted_at` soft-delete tombstone (migration `013_soft_delete.sql`) already handles *other* devices correctly learning about a deletion — this ledger only needs to stop the *same* device from recreating what it just deleted.

### Architecture — directly reusing the Strava edge-function pattern

- `api/_lib/googleCalendar.ts` — token exchange/refresh (`exchangeGoogleCode`/`refreshGoogleToken`, mirrors `_lib/strava.ts`'s `exchangeStravaCode`/`refreshStravaToken`), `fetchGoogleAccountEmail` (for connection dedup by account, not just provider), `fetchGoogleCalendarList`, `fetchGoogleCalendarEvents` (the `singleEvents=true` + sync-window call), and `getValidAccessToken(supabase, connection)` — refreshes and persists a new access token if the current one is expired or expiring within 5 minutes, else returns it unchanged (same window `strava-sync.ts` already uses), shared by every endpoint below that needs a live token rather than duplicated per-endpoint.
- `api/google-calendar-oauth-callback.ts` — GET, Google's redirect target. Redeems the single-use `state` nonce (same flow as Strava — see "OAuth `state` nonces" in `implemented-features.md`; migration `032`), exchanges the code, fetches the account's email, and calls the security-definer **`save_calendar_connection`**, which upserts by `(user_id, provider, account_email)` — a real structural difference from Strava's callback, which upserts by `user_id` alone since only one connection per user was ever possible there. The SQL function falls back to preserving an existing stored `refresh_token` if Google's response doesn't include a new one (it normally does, since the client always requests `access_type=offline&prompt=consent`).
- `api/google-calendar-status.ts` — GET, Bearer-authenticated. Returns every connection's metadata (id, provider, account email, enabled-calendar ids, created-at) — never tokens.
- `api/google-calendar-list.ts` — GET (`?connectionId=`), Bearer-authenticated. Live calendar list for one connection (for the "which calendars to sync" picker) — not cached, so a calendar renamed/shared after connecting still shows up correctly.
- `api/google-calendar-set-enabled.ts` — POST `{ connectionId, calendarId, enabled }`. Reads the connection's current `calendars_enabled` array and adds/removes the one id, rather than requiring the client to send the whole array (avoids a race against a concurrent list-fetch).
- `api/google-calendar-disconnect.ts` — POST `{ connectionId }`. Deletes the connection row only — deliberately does **not** delete events already imported from it, consistent with "this app is the source of truth once imported."
- `api/google-calendar-sync.ts` — POST, Bearer-authenticated. For every one of the user's connections, refreshes the token if needed, fetches events for every *enabled* calendar, skips cancelled instances of an expanded recurring event, and returns the raw events tagged with `{ connectionId, calendarId }` — this endpoint never writes to `calendarStore` itself (same client/server boundary `strava-sync.ts` already draws) and never does date/time extraction or timezone conversion, since the account's effective timezone (`settingsStore.timezone`) is a client-only setting the edge function has no way to know. One connection's failure (e.g. a revoked token) is caught per-connection and reported back as a tagged `calendarId: '__error__'` entry rather than failing the whole sync.
- `src/services/googleCalendar.ts` — the client half: `getGoogleCalendarConnectUrl()` (builds the authorize URL with the state-param trick, plus `access_type=offline&prompt=consent` so Google reliably re-issues a refresh_token even on a second connect of the same account), `fetchGoogleCalendarConnections()` (status + a per-connection calendar-list round-trip, combined into one `CalendarConnection[]`), `setGoogleCalendarEnabled`/`disconnectGoogleCalendar`, and `syncGoogleCalendars()` — calls the sync endpoint, then `mapGoogleEvent()` (all-day vs timed handling, including Google's `end.date` being *exclusive* per their API — a single-day all-day event needs no `endDate` at all, only a genuinely multi-day one does, shifted back one day via `addDaysToIso(-1)`; a timed event's `dateTime` is parsed as an absolute instant and re-expressed in the account's own effective zone via `utcToZonedTime()` — correct regardless of what zone the event was originally created in, the same principle the ICS importer and the account-timezone feature already established) for each, and calls `calendarStore.upsertSyncedEvent()` per mapped event.

### UI — `CalendarSidePane`'s "Imported calendars" section

The last of the pane's four sections (after Go to date, Layers, and Schedules — see "Calendar side pane" above, which reserved this extension point specifically for this feature). Signed-out users see a plain "Sign in to connect a Google Calendar" line instead of the connect button, since tokens are stored against a Supabase user. Per connected account: account email, a 🗑 disconnect button, and a checkbox per calendar (optimistically toggled in local state immediately, reverted via a full reload if the server call fails). A "+ Connect Google Calendar" button starts the OAuth flow; once at least one account is connected, a "Sync now" button appears alongside it for an immediate manual sync (the periodic background sync — see below — makes this a convenience, not the only way in, but useful right after enabling a new calendar or for reassurance that it's working).

`App.tsx` gained two effects: one mirroring Strava's existing "OAuth redirect lands on bare `/`, jump to the relevant section" pattern (`?googleCalendar=connected`/`=error` → `setActiveView('calendar')` + `openSchedules()`, landing directly on the side pane so the result is immediately visible), and the periodic sync loop itself (on load/sign-in + every 15 minutes while signed in, cleared on unmount/sign-out — a no-op if there are no connections, checked inside `syncGoogleCalendars()` itself so the interval doesn't need its own gating logic).

### External prerequisite (for the user — same category as the Strava setup guide)

Not usable until a Google Cloud project exists with the Calendar API enabled and an OAuth 2.0 Client ID configured (Authorized redirect URI: `<deployed-origin>/api/google-calendar-oauth-callback`), with `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set in Vercel + `.env.local` (see `.env.example`). Requested scope is `calendar.readonly` + `userinfo.email` only, matching the one-way/read-only decision. Not tested end-to-end for the same reason Strava's OAuth round-trip wasn't — Vercel Edge Functions only execute on an actual deployment, not the local Vite dev server.

### Not built (documented staged plan, see BACKLOG.md)

Microsoft/Outlook (Phase 2, same shape via Microsoft Graph); two-way sync (Phase 3 — real conflict resolution, push subscriptions); a server-side cron for true "even when the app is closed" sync; per-block/per-connection configurable sync window; CalDAV support for "other" providers.

---

## Original viability analysis (2026-09-16)

*Moved verbatim from BACKLOG.md on 2026-10-14. Its phase list is current as of the move except where marked built; the open phases are tracked in BACKLOG.md "Calendar" → "External calendar sync — next phases".*

Asked: how viable is syncing in Google Calendar, Microsoft/Outlook, or other external
calendars, and how would it be architected? Short answer: **viable, and this codebase
already has a working template for exactly this shape of integration** — the Strava
integration (see "Strava integration — built" in CLAUDE.md) is architecturally almost
identical to what a Google/Microsoft calendar sync would need. The honest cost estimate
is "about as much work as Strava was, plus recurrence-rule translation, plus — only if
two-way sync is wanted — webhook subscriptions." None of it is built yet; this is
analysis only, per the request.

**Feasibility.** Both Google Calendar API and Microsoft Graph (Outlook/Microsoft 365)
are mature, well-documented REST APIs with OAuth2 Authorization Code flows, and both
support reading events, writing events, and near-real-time push notifications of
changes. CalDAV is a vendor-neutral third option (iCloud and most self-hosted calendar
servers speak it) but is a lower-level, more awkward protocol than either vendor's own
REST API — worth supporting eventually for "other," but Google/Microsoft's native APIs
should come first since they cover the large majority of real users.

**Architecture — directly reusing the Strava pattern already in this repo:**
- OAuth2 per provider: public client id inlined via `VITE_GOOGLE_CLIENT_ID` /
  `VITE_MICROSOFT_CLIENT_ID`; the client secret stays server-only in Vercel env vars
  (never `VITE_`-prefixed), same reasoning as `STRAVA_CLIENT_SECRET`.
- Token storage: a new Supabase table per provider (`calendar_google_connection`,
  `calendar_microsoft_connection`), same shape as `fitness_strava_connection` —
  `user_id` (PK), `access_token`, `refresh_token`, `expires_at`, `scope`, RLS on
  `user_id`, never read client-side directly.
- The same "redirect-identity problem" Strava solved applies identically: the OAuth
  callback is a full browser navigation with no way to attach a Supabase auth header,
  so the same fix (a single-use nonce in the OAuth `state` param, redeemed
  server-side in the callback — originally the access token itself, replaced 2026-09-20) carries over unchanged.
- Edge functions mirroring `api/strava-oauth-callback.ts` / `strava-status.ts` /
  `strava-sync.ts`: `api/google-calendar-oauth-callback.ts` / `-status.ts` / `-sync.ts`,
  same three-endpoint shape, same "secrets never reach the client" boundary.

**Where it's genuinely harder than Strava, not just "more of the same":**
- **Read-only ingest vs. two-way sync is the real fork.** Strava is read-only by nature
  (activities are logged externally, pulled in). A calendar integration could stay
  read-only too (pull Google/Outlook events into the calendar view as a new
  non-editable layer, "open in Google Calendar" instead of an edit pane) — this is the
  cheap, low-risk option and should be Phase 1. Full two-way sync (app-created events
  pushed out, edits reconciled both directions) is a much bigger undertaking: it needs
  conflict resolution (same class of problem `mergeRecords()`/soft-delete tombstones
  solve for cross-device sync in this app, but now against a third party's own
  optimistic-concurrency model instead of Supabase), and near-real-time updates need
  push subscriptions (Google Calendar "watch" channels, Microsoft Graph
  subscriptions) — both expire and need periodic renewal, which is genuinely new
  machinery this app doesn't have anywhere yet (Strava is manual "Sync now" only, no
  webhook).
- **`CalendarEvent` needs the same extensibility fields `Activity` already has for
  exactly this reason.** `Activity.source`/`sourceId`/`sourceRaw` (added ahead of the
  Strava sync actually being built) is precisely the shape a synced `CalendarEvent`
  would need too — `source: 'default' | 'google' | 'microsoft'`, `sourceId` (the
  provider's event id, for upsert-by-source so re-syncing never duplicates), and
  `sourceRaw` (the full provider payload, so surfacing more fields later isn't a
  re-sync). None of this exists on `CalendarEvent` today; adding it is a small, safe,
  additive migration (same category as `009_task_scheduled.sql`), best done right
  before this feature actually starts, not speculatively now.
- **Recurrence model mismatch.** Google/Microsoft both use full RFC 5545 `RRULE`
  recurrence, which is considerably more expressive than this app's `RepeatConfig`
  (`freq`/`interval`/`endKind`/`count`/`until`/`daysOfWeek` — deliberately scoped down,
  see the Schedule feature's own note on cribbing a subset of RFC 5545 for the same
  reason). A read-only Phase 1 can sidestep this by having the provider expand
  recurring events into concrete instances server-side (both APIs support this) rather
  than importing the rule itself. Two-way sync can't avoid it — translating between the
  two recurrence models losslessly in both directions is real, non-trivial work.
- **Free/busy-only vs. full event detail** is a product decision, not just a technical
  one — a privacy-friendlier "just show blocked time" overlay is easy with either API's
  free/busy endpoint and avoids pulling full titles/notes/attendees at all.

**Recommended incremental path**, mirroring how Strava itself was scoped:
1. ~~Phase 1 — Google Calendar, read-only, manual sync.~~ **Built — see CLAUDE.md
   "External calendar sync."** Ended up slightly different from this original sketch in
   two ways, both confirmed with the user before building: synced events are **fully
   editable real `CalendarEvent` rows** (this app becomes the source of truth once one is
   imported), not a read-only overlay layer — and sync runs **automatically while the app
   is open** (on load + every 15 minutes), not only on a manual "Sync now" click, though
   the manual button still exists as a fallback/reassurance. `CalendarEvent.source`/
   `sourceId` became four fields (`source`/`sourceConnectionId`/`sourceCalendarId`/
   `sourceEventId`) rather than two, specifically to support multiple connections of the
   same provider (two Google accounts), a real requirement that wasn't anticipated in this
   original analysis.
2. **Phase 2 — Microsoft/Outlook via Graph API**, same shape as Phase 1. Not started.
3. **Phase 2.5 — a real server-side cron for "syncs even when the app is fully closed."**
   Deliberately not built alongside Phase 1 — it needs a Supabase **service-role**
   credential, a category of secret this app has never needed anywhere else (every
   existing edge function, Strava included, authenticates as the signed-in user via RLS).
   Worth it only if the 15-minutes-while-open cadence proves too laggy in practice.
4. **Phase 3 (much bigger, only if Phase 1/2 usage justifies it) — two-way sync**:
   push subscriptions + renewal, conflict resolution (this app *not* being the source of
   truth anymore, unlike Phase 1's model), RRULE translation (Phase 1 sidesteps this by
   asking Google to expand recurring events server-side instead).
5. **Not built, no phase assigned yet**: CalDAV support for "other" providers (self-hosted
   calendar servers, iCloud); a "mark as attended" / attendance concept (this is sync
   provenance, not Schedule commitment mode — the two are unrelated); per-connection
   configurable sync window (currently a fixed 1-month-back/6-months-forward constant).
