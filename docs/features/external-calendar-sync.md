# External calendar sync — Google, Outlook, and .ics import

<!-- Moved out of CLAUDE.md on 2026-09-20 to keep that file to rules and patterns. Text elsewhere that says
     "CLAUDE.md's <section>" refers to the matching section in this file or in another docs/ file. -->

## External calendar sync (Google) and .ics import

Phase 1 was built 2026-09-16 (one-way, create-only, every date of a series its own event). **Rebuilt 2026-10-18** with the user: Google changes and deletions follow through, repeating events are native series, birthdays and journeys are recognised, and nothing is ever imported twice. The .ics import goes through the same pipeline.

### What happens on import (the rules, agreed with the user 2026-10-18)

- **One way: Google → this app.** Nothing made or edited here goes back to Google. Scope `calendar.readonly` + `userinfo.email`.
- **Field by field, Google wins only where the event hasn't been edited here.** Each imported event keeps the fields as last imported (`sourceRaw.imported`, an `ImportedFields`); a field whose value still equals that base follows Google, one the person changed keeps theirs. The person's own additions (Endeavour, Important, links to notes) are never imported fields, so filing an event doesn't stop it following Google.
- **Deleted in Google** (status `cancelled`, fetched with `showDeleted=true`; a declined invitation counts too): an event never edited here goes to the Recycling Bin; an edited one stays, marked `sourceRaw.deleted`, and the event pane says "Deleted in Google · kept". The mark is set before the delete, so a copy restored from the bin isn't removed again.
- **Deleted here: never brought back.** `calendarStore.importedSourceKeys` holds every key imported on this device (kept after a delete); deletions made on another device arrive as the cloud's tombstones, whose keys `hydrateStores` adds (`syncService.ts`). Cleared on sign-out (`clearSyncedLocalData`), and for one account by "Disconnect and remove them".
- **Never a duplicate.** An event is found again by its key, `importKey()`: `google|<account email>|<calendar id>|<event id>` (the email, not the connection id, which changes on reconnecting) or `ics|<UID>`. Failing that, `findExisting` recognises the same event from elsewhere by iCalendar UID (`sourceUid`; one date of a series is `UID@date`: the same meeting in two accounts, or a later .ics export of a Google calendar) and the same person's birthday by name and day (`birthdayKey`).
- **The same id on every device** (`calendarImport/ids.ts`, `importedEventId(userId, key)`, a hash). Devices see each other's changes only on their next load, so two open devices would each import a new Google event; with the same id the sync merges them. The app account is part of the hash, keeping ids unique across accounts. This is an exception to CLAUDE.md's "use nanoid(), never a fixed id", **approved by the user 2026-10-18** (the alternative, merging duplicates after each load, was rejected as more code and less certain). .ics imports use ordinary new ids.
- **Waits for the cloud.** `syncGoogleCalendars()` waits for `waitForSyncLoad(userId)` (`syncService.ts`), so events already imported on another device are here before it decides what's new; one run at a time.
- **Sync trigger** unchanged: on load/sign-in and every 15 minutes while the app is open (`App.tsx`), plus "Sync now". No server-side cron (no service-role key).
- **Window**: 1 month back / 6 months forward (`syncWindow`, `api/_lib/googleCalendar.ts`). A series is returned when any of its dates falls in the window; its changed dates beyond the window arrive as the window reaches them.

### Repeating events

Fetched with `singleEvents=false`: a series comes once, with its `recurrence` lines, and each changed or deleted date as its own entry (`recurringEventId`, `originalStartTime`).
- **The rule** is read by `utils/rrule.ts` (`parseRecurrence`, shared with .ics) into `RepeatConfig`: every N days/weeks/months/years, a count or end date, **weekdays** (`daysOfWeek`: "Mon/Wed/Fri", "every weekday", Outlook's `FREQ=DAILY;BYDAY=…`) and **the nth weekday** (`monthWeekday`: "the 2nd Tuesday", "the last Friday", Thanksgiving's `YEARLY;BYMONTH=11;BYDAY=4TH`). EXDATEs become `repeat.exceptions`.
- **A changed date** becomes a linked copy (`seriesId`/`seriesDate`, as "Edit only this one" makes) and its date is taken out of the series; **a deleted date** is just taken out. A date the person already changed here themselves stands.
- **What can't be a native series** comes as single dates instead (`kind: 'instances'` from `mapGoogleEvent`; `api/google-calendar-instances.ts` asks Google for them): rules `parseRRule` refuses (several month days, BYSETPOS lists, hourly, RDATE, EXRULE), a series over several days (the calendar can't repeat those), and a timed series kept in another zone's clock (it would drift across daylight saving here) or landing on another day here.
- **.ics**: one VEVENT per series (`parseICS` no longer expands), RECURRENCE-ID entries are changed dates, `STATUS:CANCELLED` ones deleted dates. A rule the app can't show imports only its first date, and the review says so (there's no Google to expand a file's rule).

### What kind of event (`calendarImport/classify.ts`, `google.ts`, `ics.ts`)

| Source says | Becomes |
|---|---|
| Google `eventType: birthday`, or an all-day title like "Jane's birthday" / "Birthday: Jane" / "bday" / 🎂 (Google or .ics) | A native birthday: no times, repeating yearly forever; one per person (name + day) |
| Google `fromGmail` reservation whose title names a mode ("Flight to London (BA 15)") | Travel with that mode (✈️ 🚆 🚌 🚗 ⛴️, `travelMode`) |
| Any title starting with a mode and where to ("Train to Paris", "Bus from …", "Drive to …") | Travel with that mode ("Train the new starter" stays an event) |
| Google `outOfOffice` over several days; an all-day event over several days marked Free (`transparency`, `TRANSP`) | Background |
| Google `focusTime`, `workingLocation` | Not imported |
| Tentative (event status, or your own reply) | Tentative |
| `colorId`, else the calendar's colour | The event's `color` (left border, or the bar's colour) |
| Popup reminders | "Notify before" (`deriveNotifyBefore`) |

Google's "Free" on a single event has no equivalent here; it's kept in `sourceRaw` only.

### Data model

`CalendarEvent` provenance (all null for an event made here): `source` (`'google'` | `'ics'`; Microsoft later), `sourceAccount` (the account's email, or the file name), `sourceConnectionId` (the connection row; changes on reconnecting, so never part of a key), `sourceCalendarId`, `sourceEventId`, `sourceUid`, `sourceRaw` (`{ event, imported, deleted? }`). Plus `travelMode`. `calendarStore` **v18**; migration `051_calendar_import_provenance.sql` adds `travel_mode`, `source_account`, `source_uid` (018 added the rest).

`CalendarConnection` (`{ id, provider, accountEmail, calendars, createdAt }`) is client-only and never carries tokens.

### Code

- `api/_lib/googleCalendar.ts`: token exchange/refresh, `getValidAccessToken`, `fetchGoogleCalendarList` (with each calendar's colour and time zone), `fetchGoogleCalendarEvents` (series, deleted events, **every page**; a failed page fails the calendar rather than returning part of it), `fetchGoogleEventInstances`.
- `api/google-calendar-oauth-callback.ts`, `-status.ts`, `-list.ts`, `-set-enabled.ts`, `-disconnect.ts`: unchanged (see "OAuth `state` nonces" for the callback). `-sync.ts` returns every event of every enabled calendar tagged with the connection, the **account email** and the calendar's details; one connection's failure is a `calendarId: '__error__'` entry. `-instances.ts` (new): the single dates of up to 50 series in one calendar.
- `services/googleCalendar.ts`: connect, connections, enable, disconnect, and `syncGoogleCalendars()` → `{ created, updated, removed, failed }`.
- `services/calendarImport/`: `draft.ts` (shapes and comparisons), `classify.ts`, `google.ts` (`mapGoogleEvent`, pure), `ics.ts` (`icsToDrafts`, `withEventType` for the review's type choice), `ids.ts`, `reconcile.ts` (`applyImport`, `findExisting`, `removeImportedEvents`, `untouched`).
- UI: `CalendarSidePane`'s "Imported calendars" (Disconnect asks "keep its events" (primary) or "remove them", to the Recycling Bin with a toast; Sync now reports new / updated / removed); the event pane's header shows a small muted "From Google · account" (or "From file.ics"), its tooltip saying Google changes follow unless edited here; the .ics review (`CalendarImportReviewModal`) shows each series' rule and marks rules imported as their first date only.
- Tests: `services/calendarImport/calendarImport.test.ts` (mapping, every reconcile rule, .ics end to end), `utils/rrule.test.ts`, `utils/recurrence.test.ts` (weekdays, nth weekday), `api/_lib/googleCalendar.test.ts` (paging), `api/google-calendar-instances.test.ts`, `api/google-calendar-sync.test.ts`.

### Outlook / Microsoft 365 (built 2026-10-18)

The same import rules (`reconcile.ts`), through Microsoft Graph. Decided with the user: personal **and** work/school accounts (the `common` endpoint), and Graph's **delta** listing for deletions.
- **Sign-in**: `getMicrosoftCalendarConnectUrl()` (`services/microsoftCalendar.ts`; scopes `offline_access User.Read Calendars.Read`, `prompt=select_account`) → `api/microsoft-calendar-oauth-callback.ts` → `save_microsoft_calendar_connection` (migration 052). A work account whose organisation hasn't allowed the app gets Microsoft's "Need admin approval" (publisher verification, which needs a Microsoft Partner Network account, would lift it; not done). Microsoft issues a new refresh token on every refresh; `getValidMicrosoftAccessToken` stores it.
- **What changed** (`api/microsoft-calendar-sync.ts`): Graph's `calendarView/delta` per enabled calendar, over the same 1-month-back / 6-months-ahead window, with times in UTC and text bodies (`Prefer`). It returns changed single events, removed ids (`@removed`), the series that changed (`seriesMasterId`) and the next cursor. **The cursor is kept on the device** (`todo-ms-delta:<userId>` in localStorage, per-device bookkeeping: not in `PERSISTED_STORAGE_KEYS`, cleared on sign-out by `clearSyncedLocalData`), and moves only once its changes are applied, so a sync cut short repeats rather than loses them, and each device follows its own. (The user had agreed to a server-side bookmark; this was changed while building, for that reason, and needs no column.) A cursor is bound to its window, so after a week it is drained and a new one started; one Graph no longer knows (410) starts again (`reset`).
- **Series** (`api/microsoft-calendar-series.ts`, up to 20 a call): the master's rule and its dates in the window. `seriesDrafts` (`calendarImport/microsoft.ts`) makes one native series; an `exception` is a linked copy; a date the rule gives that Outlook no longer has is taken out (the window's first and last day excepted). Outlook's patterns map onto `RepeatConfig` (`msRecurrenceToRepeat`): daily, weekly on days, absolute and relative monthly/yearly ("the 2nd Tuesday"), end date / count / no end. Not native, so imported date by date: several weekdays on a monthly rule, a day number other than the start's, every N weeks on several days with weeks starting on another day than Monday, a series over several days, or one whose zone doesn't keep the account zone's clock (`sameClock`, `utils/windowsZones.ts`: Outlook names zones the Windows way, mapped to IANA from CLDR's table).
- **Deletions**: a removed id we hold is a deletion (`removedDraft`); one we don't is probably a deleted date of a series (Graph gives only the id), so every series from that calendar is fetched again. A series that's gone (404) removes the master if never edited here.
- **Kinds** (`mapMsEvent`): a birthday is an all-day event with a birthday-like title or on a calendar named "Birthdays"; travel by title, as for any source; `showAs` out of office, or Free all day, over several days → Background; `tentative` or a tentative reply → Tentative; declined or `isCancelled` → deleted; all-day "Working elsewhere" → not imported. Colour: the calendar's `hexColor` (category colours not read). Reminder: `reminderMinutesBeforeStart` when `isReminderOn`. UID: `iCalUId`, the same as Google's for the same meeting, so one meeting in both is one event. All-day dates: Graph writes midnight; one moved off midnight by the UTC request is moved back into the event's zone.
- **Throttling**: `graphFetch` waits out 429/503 for `Retry-After` (at most 10 s, three times).
- **Shared plumbing**: `services/calendarConnections.ts` (`fetchCalendarConnections`, `setCalendarEnabled`, `disconnectCalendar`, `syncAllCalendars`; the status, enable and disconnect endpoints work for any provider by connection id, only the list and sync are per provider). `api/google-calendar-sync.ts` now reads Google connections only. OAuth returns: `?outlookCalendar=` on the web, `microsoft-calendar` on Android (`services/android/oauthReturn.ts`).
- **UI**: the side pane's Imported calendars lists both providers (a small provider tag after each account), "+ Connect Google Calendar" and "+ Connect Outlook"; the event pane shows "From Outlook · account".
- **Tests**: `calendarImport/microsoft.test.ts` (zones, every pattern, kinds, all-day dates, series with changed and deleted dates, removal, Google + Outlook as one event), `api/microsoft-calendar-sync.test.ts` (first sync, carrying on, the weekly restart, an expired cursor, one connection failing), `api/_lib/microsoftCalendar.test.ts` (paging to the delta link, `@removed`, 410, 429, series).
- **Setup** (for the user): register an app at entra.microsoft.com, "Accounts in any organizational directory and personal Microsoft accounts"; Web redirect URI `<origin>/api/microsoft-calendar-oauth-callback` (and `http://localhost:3000/…` for `vercel dev`); delegated permissions `offline_access`, `User.Read`, `Calendars.Read`; a client secret (it **expires**, 24 months at most); `VITE_MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in Vercel and `.env.local` (see `.env.example`); run migration 052.

### External prerequisite

A Google Cloud project with the Calendar API enabled and an OAuth client (redirect URI `<origin>/api/google-calendar-oauth-callback`), `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel and `.env.local`. **The OAuth round trip and a real sync have never been run** (edge functions only run on a deployment); everything else is covered by tests against Google's documented shapes.

### Not built

Two-way sync; a server-side cron; a configurable window; CalDAV. A changed date of a series beyond the window shows as the plain series date until the window reaches it. .ics rules the app can't show import only their first date. See BACKLOG.md "External calendar sync — next phases".

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
