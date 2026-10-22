# Fitness app, Strava, and the add-on architecture

<!-- Moved out of CLAUDE.md on 2026-09-20 to keep that file to rules and patterns. Text elsewhere that says
     "CLAUDE.md's <section>" refers to the matching section in this file or in another docs/ file. -->

## Fitness App (Phase 1 — manual entry + customisable activity types + Strava import)

Full original spec: "Original spec" at the end of this file. New suite app (nav hotkey `7`/`Ctrl+7`, "extras" group below the `<hr>` divider in NavSidebar, alongside Portfolio) — physical activity tracking, built to later import automatically from Strava without a data-model change. Also the first app built against the **add-on tier** (see "Add-on app architecture" below) — code-split and gated through `isAppEnabled()`, same as Portfolio now is.

**Separate-but-linkable, following the Lists/Portfolio precedent, not the aspirational one:** CLAUDE.md's suite architecture describes Purposes as a fully shared cross-app entity, but in practice neither Portfolio nor Notes actually reuse the Organizer's `Purpose`/`PurposeId` — each rolled its own (Portfolio has its own `InvestmentPurposeId`, Notes has none at all). Fitness deliberately breaks from that and **does** import the shared `PurposeId` type (one type-only import in `src/types/fitness.ts`, same lightweight-coupling pattern `notes.ts` already uses for `CollectionId`) — chosen because the user explicitly asked for suite-wide connections and cross-app Purpose tagging is the cheapest, least-coupled way to get it. Everything else about Fitness (its own store, own component tree, own config) follows the Lists/Portfolio pattern of zero further coupling: `src/types/fitness.ts` is **not** re-exported through `src/types/index.ts` (import it directly as `@/types/fitness`, same as `@/types/lists` / `@/types/portfolio`); ID generation is local `nanoid()` in `fitnessStore.ts`, not routed through the shared `utils/id.ts` helpers. `ColorPicker` is the one shared UI primitive Fitness reuses directly — it's a genuine design-system component (like the platform layer is meant to provide), not an Organizer domain concept, so reusing it doesn't compromise separation.

### Data model

`src/types/fitness.ts` — `ActivityId` and `ActivityTypeId` (both branded). `ActivitySource = 'manual' | 'strava'` is an extensible union (Garmin/Apple Health/Google Fit/CSV are future members, not new types).

**`ActivityType` is a user-customisable registry, not a closed union or static config** — promoted from a plain `'run' | 'hike'` string in the very first cut of this app to a full stored entity once customisation was requested, because "add/delete/update the data captured" needs somewhere to persist per-type field definitions:

```typescript
interface ActivityType {
  id: ActivityTypeId; name: string; icon: string; color: string | null;
  tracksDistance: boolean;             // shows/hides the Distance field for this type
  fieldSchema: ActivityFieldSchema[];  // local to Fitness — NOT Records' FieldSchema (see below)
  isBuiltIn: boolean;   // gates deletion only; name/icon/color/tracksDistance/fieldSchema stay editable regardless
  archivedAt: string | null; createdAt: string; updatedAt: string;
}
```

Built-in types (`src/config/activityTypes.ts`'s `BUILTIN_ACTIVITY_TYPE_SEEDS`, seeded into the store on first load / migration) use **fixed, well-known ids** (`'run'`, `'hike'`, `'walk'`, `'ride'`, `'swim'`, `'strength'`, `'yoga'`, `'other'`) rather than `nanoid()` specifically so a future Strava sync can map `sport_type` → our type directly (e.g. `'Run'` → `'run'`) with no lookup table. User-created custom types get a random id. `ActivityFieldSchema`/`ActivityFieldType` (`text|number|date|rating|select|boolean|url|duration` — same 8-value set as Records' `FieldType`, deliberately re-typed rather than imported, mirroring how `ListFieldSchema` is Lists' own independent copy, not a Records import) — the field-customisation UI is a close mirror of `EditTrackerPane`'s field editor (see UI below), reusing that exact interaction pattern.

**`tracksDistance` fixes a real bug from the first cut of this app**: every activity type showed the same Distance + Moving Time fields regardless of whether distance made sense (Yoga and Strength don't have one). Moving time stays universal — every activity has *some* session length — but Distance is now conditional per type. Built-in seed values: `true` for Run/Hike/Walk/Ride/Swim/Other, `false` for Strength/Yoga. User-editable via a checkbox in `EditActivityTypeModal` ("Has a distance"), same as everything else about a type.

The `Activity` interface itself:

- `type: ActivityTypeId` — references the registry above (was a plain string in the pre-customisation version of this app).
- Canonical units are always SI (`distanceMeters`, `movingTimeSeconds`, `elapsedTimeSeconds`, `averageSpeedMps`) regardless of display preference — unit conversion happens only in `src/utils/fitnessFormat.ts`, at render time. Phase 1 display is metric-only (km, km/h); an imperial toggle is a render-layer-only change whenever it's wanted.
- `data: Record<string, unknown>` — now genuinely driven by the selected `ActivityType.fieldSchema` (custom field values keyed by `ActivityFieldSchema.id`), in addition to still being the extensibility valve for future Strava-only fields not yet in any schema.
- `sourceRaw: Record<string, unknown> | null` — extensibility valve, never read by Phase-1 UI. Exists so a future Strava sync can store the *entire* raw API payload (elevation, heart rate, splits, GPS polyline, kudos…) on day one, so surfacing more fields later in the UI is not a re-sync.
- `source` + `sourceId` — `sourceId` is `null` for manual entries; for imported ones it's the external activity id and needs a `(source, sourceId)` uniqueness constraint so re-syncing never duplicates. `fitnessStore.upsertBySource()` already implements the upsert-by-(source, sourceId) logic Phase 2's Strava sync will call — built now, unused until then.
- `archivedAt: string | null` — same sunset pattern as `Collection`/`Purpose`; no archive/restore UI wired up for Activities yet (delete is the only sunset action right now — the field exists so adding Archive later doesn't need a migration). `ActivityType` also has `archivedAt`, same reasoning, also unused by any UI yet (deletion is immediate for non-built-in types today).
- `purposeIds: PurposeId[]` — see the cross-app note above.

**Cross-app linking to Records (futureproofed, not built):** when it is built, use the same embedded pattern the rest of the suite already uses — a `crossAppRefs: CrossAppRef[]` field on the linked entities (see "Cross-app linking" in implemented-features.md), not a join table. (An unused `cross_app_links` table was reserved for this early on; it was never used and migration 031 drops it.) `Activity` having a stable typed ID today is the only prerequisite, and it does.

### Store — `fitnessStore.ts`

Zustand, `persist` to `fitness-storage`, **v3**, localStorage, **and synced since 2026-10-22** (`fitness_activities`, `fitness_activity_types` (custom types only), migration `055`; a Strava activity's id is a per-account hash of its Strava id, `utils/fitnessIds.ts`; see "Fitness syncs" in implemented-features.md). It started local-only, the same "start local" choice made for `noteStore`/`listStore`. `v1 → v2` migration seeds `activityTypes` for anyone who already had v1 data (v1's `Activity.type` held plain `'run'`/`'hike'` strings, which already match the fixed built-in ids, so existing activities keep working with no further migration). `v2 → v3` backfills `ActivityType.tracksDistance` — built-ins get their correct per-type default by looking up `BUILTIN_ACTIVITY_TYPE_SEEDS` by id (Strength/Yoga → `false`, everything else → `true`); any custom type a user already created defaults to `true` (matches `addActivityType`'s default). Actions: `addActivity`, `updateActivity`, `deleteActivity`, `upsertBySource` (Phase 2 sync entry point); `addActivityType`, `updateActivityType`, `deleteActivityType` (blocked for `isBuiltIn` types — the store enforces this, not just the UI).

`src/utils/fitnessActivityTypes.ts` — `getActivityType(id, activityTypes)` (graceful fallback to a generic "Activity ⛰️" if a referenced type was deleted — never throws) and `getTopActivityTypes(activityTypes, activities, count)` (usage-ranked: counts how many activities reference each type, returns the top N; falls back to `DEFAULT_TOP_TYPE_IDS` = `['run','hike','ride']` to fill any remaining slots so a brand-new user never sees an empty pill row).

### UI

- `FitnessSection/` — activity list (type icon, title, date, **distance, moving time, average speed** — exactly the three stats the UI is scoped to show; everything else is stored but not rendered). Empty state prompts "Add activity". A `source === 'strava'` badge is wired into both the list row and the edit modal header, and now genuinely set by synced activities. `StravaConnect` subcomponent (in `FitnessSection.tsx`, not split out — small enough): "Connect Strava" / "Sync now" + status message, see "Strava integration — built" above for the full wiring.
- `AddActivityModal/` — unified create/edit (mirrors the `AddCollectionModal`/`AddPurposeModal` `isEditMode` pattern, **Escape-safe from the very first commit**). Type row: the top-3-by-usage types render as pills (`getTopActivityTypes`), a native `<select>` labelled "More…" lists every active type plus a trailing "+ New activity type…" option (selecting it opens `EditActivityTypeModal` in create mode), and a `⚙` **Customise** button opens the same pane in edit mode for whichever type is currently selected — this is the "customise button somewhere appropriate" the field-customisation ask wanted, placed directly on the row it affects rather than buried in a separate settings area. Below that: title (defaults to the type name if left blank), date, **distance in km (only rendered when the selected type's `tracksDistance` is true — hidden entirely for Strength/Yoga, not just left blank)**, moving time as h/m inputs (mirrors the existing duration-field h/m/s UX from `AddEntryModal`'s `'duration'` FieldType, always shown), a live-computed "Average speed" preview (naturally absent when distance is hidden, since it needs both), **the selected type's custom fields** (rendered by a local `ActivityFieldInput` — a Fitness-scoped copy of `AddEntryModal`'s `FieldInput` dispatch, same per-type rendering for boolean/rating/select/number/date/duration/url/text), notes, and Purpose chips. Delete lives in the edit-mode footer, left of Cancel/Save.
- `EditActivityTypeModal/` — slide-in pane, **directly modeled on `EditTrackerPane`'s field editor** (same field-row/expand-to-configure/add-field-form structure and CSS, adapted for `ActivityFieldSchema`) since that's the established "how customisation is done" pattern elsewhere in the suite. Edits name/icon/color (via the shared `ColorPicker`), a "Has a distance" checkbox (`tracksDistance`), and the field schema; built-in types show a hint that they're still fully editable but not deletable, and the store's `deleteActivityType` refuses to delete `isBuiltIn` types regardless of what the UI does. Deleting a type that activities still reference is allowed (with a confirm warning) — those activities fall back to `getActivityType`'s generic "Activity ⛰️" rendering rather than breaking.
  - **z-index note:** this pane can open *from inside* `AddActivityModal` (both mounted at once — clicking Customise does not close the parent modal). Its overlay/pane therefore use `z-index: 100/101` (the same "always on top" tier as `SettingsPane`/`TaskPane`), not the `28/29` tier `EditTrackerPane` uses — that pane only ever opens standalone from `RecordsView`, so the lower tier never conflicts there. Copy the tier from context, not just the component, if this pattern gets reused a third time.
- Speed-dial FAB (`AddTaskButton`): Fitness-aware branch, single "Activity" option (`FITNESS_OPTIONS`), same speed-dial shape as every other section even though there's only one thing to create — kept for visual/interaction consistency rather than special-casing a bare `+` button.
- Header: Fitness excluded from both `CollectionFilterPicker` and the `E`/`Ctrl+E` hotkey (Activities have no `collectionId`/Endeavour concept) — same exclusion list as Lists/Portfolio, extended by one.

### Add-on app architecture (readiness for a future paid/optional-app suite)

The user's stated future model: today's nav items 1–5 (Tasks/Calendar/Records/Lists/Notes — everything in `CORE_NAV_ITEMS`, above the divider) ship in every install; items below the divider (Portfolio, Fitness) become separately-installable "add-on" apps, possibly paid. Two concrete gaps existed before this was addressed: nothing was actually code-split (despite the suite architecture doc claiming it), and there was no single place that decided "is this app available to this user."

- **`src/config/apps.ts`** — `APP_TIERS: Record<AppView, 'core' | 'addon'>` and `isAppEnabled(view)`. Today `isAppEnabled` unconditionally returns `true` for everything — there's no purchase/entitlement backend yet. The point of this function is that it's the **one place** that will change when there is one (e.g. reading a Supabase `user_entitlements` table); every caller already treats availability as something that can say no.
- **Three call sites gate through it**, not through re-deriving "is this an addon" locally: `NavSidebar` (the Portfolio/Fitness nav buttons, and the `<hr>` divider itself, only render when enabled), `App.tsx`'s section routing (`{activeView === 'fitness' && isAppEnabled('fitness') && ...}`), and the `6`/`7` nav hotkeys (become no-ops if disabled, so a hotkey can't reach a section the nav hides).
- **Real code-splitting**: `PortfolioSection` and `FitnessSection` are now `React.lazy()` imports wrapped in `<Suspense fallback={<AppSectionFallback />}>` in `App.tsx`, instead of static top-level imports. Verified in the build output — `PortfolioSection` and `FitnessSection` now emit their own `.js`/`.css` chunks (Portfolio: ~200KB, Fitness: ~3KB) and the main bundle dropped by ~200KB. Tasks/Calendar/Records/Lists/Notes stay eagerly bundled (they're core, every user has them — splitting them would just add loading flicker for zero benefit).
- **Deliberately not built**: any actual entitlement/purchase backend, a settings UI for enabling/disabling add-ons, or per-app pricing — none of that has a real requirement yet. The seam is real; the business logic behind it isn't.

### Strava integration — built

OAuth2 Authorization Code flow, `activity:read` scope, manual "Sync now" trigger only (no webhook/push). All Strava-secret-touching logic lives server-side in Vercel Edge Functions — the client never sees `STRAVA_CLIENT_SECRET` or stored access/refresh tokens.

**Env vars** (Vercel + `.env.local`, see `.env.example`): `VITE_STRAVA_CLIENT_ID` (public, client-inlined) and `STRAVA_CLIENT_SECRET` (server-only — deliberately **not** `VITE_`-prefixed, so it's never bundled into client JS; see the `VITE_FMP_API_KEY` cautionary note elsewhere in this doc for why that prefix matters). Registered app: client id `270097`.

**The redirect-identity problem and its fix:** Strava's OAuth callback is a full browser navigation, not a `fetch` — so there's no way to attach a Supabase `Authorization` header to it. The callback therefore can't know who is connecting from a header. *(Superseded 2026-09-20 — the first version passed the user's live Supabase access token through the OAuth `state` parameter, which put a credential in provider/Vercel logs and browser history.)* Now `state` is a **single-use, 10-minute nonce** minted by the signed-in client (`mintOAuthState('strava')` in `src/services/oauthState.ts` → the `mint_oauth_state` SQL function, migration `032_oauth_state.sql`) and bound to the user and provider. `api/strava-oauth-callback.ts` exchanges the code, then calls the security-definer `save_strava_connection` with the anon key; that function deletes the nonce in the same statement that validates it and upserts the row for the user the nonce was minted for. A reused, expired or wrong-provider `state` is rejected (`?strava=error&reason=invalid_state`). No service-role key anywhere in the codebase. See "OAuth `state` nonces" in `implemented-features.md`.

**Supabase table** (`supabase/migrations/012_fitness_strava.sql`): `fitness_strava_connection` — `user_id` (PK, references `auth.users`), `athlete_id`, `access_token`, `refresh_token`, `expires_at` (unix seconds), `scope`, timestamps. RLS: select/insert/update/delete all gated on `auth.uid() = user_id`. This migration has been applied to the live Supabase project (see "Live migration status").

**Edge functions** (`api/`, following the existing `api/ticker-quote.ts` proxy pattern — `export const config = { runtime: 'edge' }`):
- `api/_lib/strava.ts` — `exchangeStravaCode(code)` / `refreshStravaToken(refreshToken)` (both POST to Strava's token endpoint with the client secret), and `mapSportType(sportType)` mapping Strava's `sport_type` to our 8 fixed built-in `ActivityTypeId`s (unrecognised → `'other'`, never dropped).
- `api/_lib/supabaseEdge.ts` — `getUserClient(accessToken)` (a Supabase client scoped to one user's token, `persistSession: false`) and `bearerToken(req)` (extracts `Authorization: Bearer …`).
- `api/strava-oauth-callback.ts` — GET, Strava's redirect target. Verifies the user via `state`, exchanges `code` for tokens, upserts `fitness_strava_connection`, redirects to `/?strava=connected` or `/?strava=error&reason=…`.
- `api/strava-status.ts` — GET, Bearer-authenticated. Returns `{ connected, athleteId?, connectedAt? }` — **never returns tokens**, so the client has no path to reading them even accidentally.
- `api/strava-sync.ts` — POST, Bearer-authenticated. Refreshes the access token if it's expired or expiring within 5 minutes (writing the refreshed pair back to the table), fetches the most recent 200 activities from `GET /athlete/activities`, maps each to `{ type, title, startedAt, distanceMeters, movingTimeSeconds, elapsedTimeSeconds, averageSpeedMps, sourceId, sourceRaw }` and returns them — it does **not** write to the Fitness store itself; the client does the upsert (with the activity's stable id), and the store's sync uploads it.

**Client wiring:**
- `src/services/strava.ts` — `getStravaConnectUrl()` (builds the authorize URL with the state-param trick, `null` if not signed in or `VITE_STRAVA_CLIENT_ID` unset), `checkStravaStatus()` (calls `strava-status`, fails soft to `{ connected: false }`), `syncStrava()` (calls `strava-sync`, then loops the results through `fitnessStore.upsertBySource('strava', sourceId, …)` — pre-existing upsert-by-source logic, unused until now, now exercised for real).
- `FitnessSection.tsx`'s `StravaConnect` subcomponent — renders "Connect Strava" (disconnected) or "Sync now" + a "Strava connected" badge (connected), fetched once on mount via `checkStravaStatus()`. Also reads `?strava=connected` / `?strava=error&reason=…` off `window.location.search` on mount, shows a one-line status message, and cleans the query string via `history.replaceState`.
- `App.tsx` — a mount-only effect checks for a bare `?strava=` query param and calls `setActiveView('fitness')` if present, **before** `StravaConnect` needs to render the message. Necessary because Strava's redirect lands on bare `/` — no section context survives a full page navigation, so without this the user would land on whatever section was default (Tasks) and never see the connected/error message unless they happened to click into Fitness themselves.

**Known limitation:** Vercel Edge Functions only execute on an actual Vercel deployment — they cannot be exercised by the local Vite dev server or Playwright in this environment. Everything client-side (button rendering, signed-out guard, query-param redirect handling, auto-navigation to Fitness) was verified in-browser via Playwright; the actual OAuth round-trip and token exchange have **not** been tested end-to-end and need verification against the real deployment once the migration has been run.

**Update (2026-09-18): `vercel dev` is the correct way to exercise `/api/*` locally** — it runs the real Edge Function runtime, not just the Vite dev server. Confirmed and used to test the Google Calendar sync integration end-to-end from `localhost:3000` (see "External calendar sync" below). Setup: `npx vercel link --project organisaitor` once, then `npx vercel dev --listen 3000`. Google's OAuth client needs `http://localhost:3000/api/google-calendar-oauth-callback` added as a second Authorized redirect URI (Cloud Console allows multiple) — Strava's callback setup is a single non-list "Authorization Callback Domain" field, so testing that one locally means temporarily overwriting it, which breaks production Strava OAuth while it's changed; skip unless specifically testing Strava.

**Gotcha that will bite again if not remembered: `vercel dev`'s Edge runtime only sees env vars registered for the *Development* environment on Vercel — it does *not* read them from `.env.local` the way Vite's own dev server does for client-side `VITE_*` vars.** Client-side code (the browser bundle) gets `.env.local` values directly from Vite, so this looked like everything was configured — but any edge function that reads `process.env.SOMETHING` (both `api/_lib/supabaseEdge.ts`'s `getUserClient()` and every server-only secret) would throw (`supabaseUrl is required`, etc.) until each var is *also* added to Vercel's Development scope: `vercel env add <NAME> development` (`--type config` for anything already client-exposed via a `VITE_` prefix — Vercel refuses `--sensitive`/Secret type for those, since the prefix means it's already public; plain `--sensitive` for real secrets). Needed this way for: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID` (read server-side too, for the OAuth token exchange — not just client-side), and `GOOGLE_CLIENT_SECRET`. The values can be piped in from the already-correct `.env.local` (`grep '^NAME=' .env.local | sed ... | vercel env add NAME development`) rather than re-entered by hand. `STRAVA_CLIENT_SECRET`/`VITE_STRAVA_CLIENT_ID` need the identical treatment whenever Strava is tested this way too — not done yet, since that pass only tested Google Calendar.

**Also found while testing this way: `GOOGLE_CLIENT_SECRET` in `.env.local` is easy to typo (`GOOGLE_CLIENT_SEECRET` was caught once) since nothing validates the key name — a silent `undefined` in the edge function, not an obvious error, if it's ever misspelled again.**

**Not yet done:** real end-to-end OAuth test on the Vercel deployment (Strava specifically — Google Calendar sync's *local* `vercel dev` round-trip has now been exercised, per the update above, but neither has been confirmed against the actual production deployment yet).

---

## Original spec

*Moved verbatim from BACKLOG.md on 2026-10-14. Some status lines are out of date: migration `012` has been applied (see `docs/supabase/migrations.md`). Open items are tracked in BACKLOG.md "Fitness — open items".*

**Status: Phase 1 built and extended** — manual entry, a customisable activity-type registry (8 built-in types, user-editable name/icon/color/custom fields, delete-guarded for built-ins), and add-on-app architecture (code-split + gated) are all live. See CLAUDE.md "Fitness App" for the full implementation writeup — this section stays as the spec/history record, CLAUDE.md is authoritative for current behaviour. **Strava import (the "Strava integration architecture" section below) is not built** — blocked on registering a Strava API application, a manual/external prerequisite; see the setup guide at the end of this section. Raised as a new suite app, analogous to Portfolio and Notes — lives in the "extras" nav group below the `<hr>` divider, not inside the Organizer, and is the first app built against the add-on tier (see "Add-on app architecture" below). Name "Fitness" shipped as-is (not just a placeholder anymore, but still just one line in `src/config/labels.ts` to rename).

#### Vision

A place to track physical activity (runs, hikes, and beyond), either logged manually or imported automatically from Strava. Started deliberately narrow — two activity types (Run, Hike), three visible fields (distance, moving time, average speed) — then extended once real usage showed the narrowness needed an escape hatch: activity types are now a user-customisable registry (8 built-ins, add/edit/delete custom types, per-type custom fields), not a closed union. Everything Strava provides beyond the three visible stats (elevation, heart rate, splits, GPS route, kudos...) is still captured and stored from day one so surfacing it later is a UI change, not a re-sync.

#### Terminology

Fits the existing Suite → App → Section → View → Tool → Entity hierarchy (see main CLAUDE.md):
- **App**: Fitness
- **Entity**: `Activity` — one logged workout (a run, a hike). Deliberately named to match Strava's own vocabulary, minimizing translation friction in the sync code.

#### Data model (Phase 1)

**As built:** not an actual separate npm package (the suite isn't a literal monorepo yet — that part of the architecture doc is aspirational; Notes/Lists/Portfolio aren't separate packages either). Followed the real established pattern instead: own type file (`src/types/fitness.ts`, not re-exported through `src/types/index.ts` — same as Lists/Portfolio), own store (`src/store/fitnessStore.ts`, localStorage via `persist`, no Supabase table yet — same "start local" choice already made for Notes/Lists), own branded `ActivityId`. Nothing here required a change to `taskStore`, `trackerStore`, or any Organizer type. Supabase tables are Phase 2, arriving alongside the Strava sync work below (which needs one for OAuth tokens regardless).

```typescript
type ActivityId = string & { readonly _brand: 'ActivityId' };
type ActivityTypeId = string & { readonly _brand: 'ActivityTypeId' };

// Extensible — new sources (Garmin, Apple Health, Google Fit, CSV import...) just add
// a union member and a new sync function; the Activity shape itself doesn't change.
type ActivitySource = 'manual' | 'strava';

// User-customisable registry, not a closed union — built (see "as extended" below).
// Built-ins use fixed ids ('run', 'hike', ...) so Strava's sport_type maps directly;
// custom types get a random id.
interface ActivityType {
  id: ActivityTypeId; name: string; icon: string; color: string | null;
  tracksDistance: boolean;             // Distance field shown/hidden per type (fixed a
                                        // real bug — Yoga/Strength don't have a distance)
  fieldSchema: ActivityFieldSchema[];  // Fitness-local field schema, same shape family
                                        // as Records' FieldSchema but not shared with it
  isBuiltIn: boolean; archivedAt: string | null; createdAt: string; updatedAt: string;
}

interface Activity {
  id:                ActivityId;
  type:              ActivityTypeId;          // references ActivityType above
  title:             string;                  // defaults to the Strava activity name, editable
  startedAt:         string;                  // ISO 8601 timestamp
  timezone:          string | null;

  // Canonical units are SI (meters, seconds, m/s) regardless of display preference —
  // conversion to km/mi or min/km etc. happens at render time only.
  distanceMeters:    number | null;
  movingTimeSeconds: number | null;
  elapsedTimeSeconds: number | null;           // stored now, not shown in UI until Phase 2
  averageSpeedMps:   number | null;

  // Keyed by ActivityFieldSchema.id — now genuinely populated by the selected
  // ActivityType's custom fields (as extended, below), plus still the extensibility
  // valve for Phase 2+ Strava-only fields (elevation gain, heart rate, splits...).
  data:              Record<string, unknown>;

  notes:             string | null;
  purposeIds:        PurposeId[];              // cross-app Purpose tagging (shared platform layer)

  // Import tracking
  source:            ActivitySource;
  sourceId:          string | null;            // e.g. Strava activity id; null for manual entries
  sourceRaw:         Record<string, unknown> | null; // full raw payload from the source, verbatim —
                                                 // lets Phase 2 surface new fields without re-syncing

  archivedAt:        string | null;             // same sunset pattern as Collection/Purpose, not delete
  createdAt:         string;
  updatedAt:         string;
  userId:            string;
}
```

`(source, sourceId)` needs a uniqueness constraint (app-side and DB-side) so re-running a sync never creates duplicates — re-syncing an already-imported activity should update it in place, not insert a second row.

#### Cross-linking to Records (futureproofing, not built in Phase 1)

The explicit ask: manual Fitness entries and Records trackers should be linkable later, without redesigning either. Use the **same embedded `crossAppRefs` mechanism the rest of the suite uses** (see CLAUDE.md / docs/features/implemented-features.md "Cross-app linking"): a `crossAppRefs: CrossAppRef[]` field on each side, with `services/crossAppLinkCleanup.ts` keeping both directions free of dead links. (An early plan to use a normalized `cross_app_links` table was dropped — the table was never used and migration 031 removes it.) The only prerequisite is that `Activity` has a stable typed ID today, which it does. Nothing else needs to be built now; this section exists so Phase 1 doesn't accidentally close off the option.

#### UI scope — Phase 1 only

- [x] New top-level nav item, "extras" group (below the divider, with Portfolio) — hotkey `7` / `Ctrl+7`.
- [x] Activity list (all activities, newest first) showing: type icon, title, date, **distance, moving time, average speed** — nothing else, even though more is stored.
- [x] Manual "Add activity" form: type, title, date, distance, moving time. Built as auto-computed-only (not separately editable) — average speed shows as a live "Average speed: X km/h" preview derived from distance/time, no override field. Simpler than the original "editable" wording here; revisit if a real need for manual override shows up (e.g. importing a GPS-corrected speed that doesn't match distance/time exactly).
- [x] Editing/deleting an activity works the same regardless of `source` — a synced activity can be edited or deleted locally like a manual one (edits are **not** pushed back to Strava; this is one-way import only). Not yet exercised with real Strava data since import isn't built, but the modal already branches on `editingActivity.source === 'strava'` to show a badge.
- [x] **Extended beyond original Phase 1 scope**: activity type is now a customisable registry, not just Run/Hike. 8 built-in types (Run, Hike, Walk, Ride, Swim, Strength, Yoga, Other); the create/edit form shows the top-3-by-usage as pills plus a "More…" dropdown of everything; a Customise (⚙) button opens per-type editing (name/icon/color/custom fields), mirroring `EditTrackerPane`'s field editor. See CLAUDE.md for the full writeup.
- [x] **Bug fix — per-type `tracksDistance`**: the first cut of the customisable-types work still showed Distance on every type, including Yoga and Strength, which don't have one. Added `ActivityType.tracksDistance: boolean` (seed defaults: `false` for Strength/Yoga, `true` for everything else), user-editable via a checkbox in `EditActivityTypeModal`; the Distance field is now conditionally rendered in `AddActivityModal`, not just optional. Moving time stays universal. `fitnessStore` bumped to v3 for the backfill.
- [x] **`N` (no modifier) now also triggers the section-aware new-item hotkey**, alongside the existing `Space` and `Ctrl+N` — app-wide, not Fitness-specific, but requested alongside this app's other changes. See CLAUDE.md hotkeys table.
- [x] A "Connect Strava" action and a manual "Sync now" button, in `FitnessSection`'s `StravaConnect` subcomponent. Built — see "Strava integration architecture" below for what shipped and what's still outstanding.

#### Strava integration architecture (built)

Followed the planned shape: the Portfolio app's ticker data proxy through Vercel Edge Functions (`api/ticker-quote.ts` etc.) was the existing pattern, extended with a token **exchange** step (authorization code → access + refresh token) that has to happen server-side since it needs the app's client secret.

**Vercel Edge Functions** (`api/*.ts`, `export const config = { runtime: 'edge' }`):
- `api/_lib/strava.ts` — `exchangeStravaCode`/`refreshStravaToken` (POST to Strava's token endpoint with `STRAVA_CLIENT_SECRET` — a plain, non-`VITE_`-prefixed Vercel env var, so it never reaches the client; `VITE_FMP_API_KEY` remains the cautionary example of what not to do) and `mapSportType()` (Strava `sport_type` → our built-in `ActivityTypeId`s, unrecognised → `'other'`).
- `api/_lib/supabaseEdge.ts` — `getUserClient(accessToken)` / `bearerToken(req)` helpers shared by the three endpoints below.
- `api/strava-oauth-callback.ts` — receives the `code` Strava redirects back with, identifies the user by redeeming the single-use `state` nonce (see below; the original access-token-in-`state` design was replaced 2026-09-20), exchanges the code for tokens, upserts `fitness_strava_connection`, redirects to `/?strava=connected` or `/?strava=error&reason=…`.
- `api/strava-status.ts` — Bearer-authenticated GET, returns connection metadata only (never tokens).
- `api/strava-sync.ts` — Bearer-authenticated POST, called by "Sync now". Refreshes the token if near-expired, fetches the 200 most recent activities from Strava, maps and returns them — does not touch Supabase or localStorage itself; the client does the upsert.
- The "Connect Strava" button is a plain link to Strava's authorize URL (built client-side in `src/services/strava.ts`), no server code needed for that half.

**The redirect-identity problem, solved:** Strava's callback is a full browser navigation, so there's no way to attach a Supabase `Authorization` header to it. *(Superseded 2026-09-20: `state` is now a single-use nonce, migration 032 — see `docs/features/fitness.md`.)* Originally fixed by passing the user's current Supabase access token through the OAuth **`state`** parameter — `api/strava-oauth-callback.ts` read it back out, called `supabase.auth.getUser()` to identify the user, and wrote as that user, so RLS applies normally. No service-role key anywhere in this codebase.

**Supabase table — built and applied to live:**
- `fitness_strava_connection` (`supabase/migrations/012_fitness_strava.sql`) — one row per user: `user_id`, `athlete_id`, `access_token`, `refresh_token`, `expires_at`, `scope`, timestamps. RLS scoped to the owning user. **This migration has been written but not yet executed against the live Supabase project** — that's the one remaining step before Connect will work end-to-end.

**Deviation from the original plan — no `fitness_activities` Supabase table (yet):** the original spec called for a second table mirroring `Activity` server-side. What actually got built keeps activities exactly where they already lived — `fitnessStore`, localStorage-only — and `syncStrava()` just upserts synced activities into that same local store via the pre-existing `upsertBySource()`. Simpler for Phase 1 (matches "start local, Supabase sync is a later phase" already true of `noteStore`/`listStore`), but it means synced activities don't survive a `localStorage.clear()` or show up on a second device without a re-sync. Revisit alongside whenever Fitness gets real Supabase sync (see "Not yet done" below).

**Verification status:** everything client-side (button rendering, signed-out guard, `?strava=connected`/`?strava=error` query-param handling, auto-navigation to the Fitness section on redirect) was build-verified and Playwright-tested against the local dev server. The edge functions themselves only execute on an actual Vercel deployment — the real OAuth round-trip and token exchange have **not** been tested end-to-end yet.

**Not yet done:**
- Run `012_fitness_strava.sql` against the live Supabase project (blocks Connect from working at all right now)
- Real end-to-end OAuth test against the Vercel deployment
- Supabase sync for `Activity`/`ActivityType` records themselves (see deviation note above)

**Phase 2+ (not now):** Strava webhook subscription (push instead of manual sync — needs a validation handshake endpoint and a public receiver, `api/strava-webhook.ts`), automatic throttled sync on app load, mapping additional Strava `sport_type` values onto the activity-type registry beyond what's covered today, promoting `ActivityFieldSchema` into the shared platform layer if Records ever wants the same shape (not needed yet — Lists' `ListFieldSchema` has stayed independent too, so there's no pressure to do this preemptively), exercise plans (structure likely mirrors `RoutineTask[]` + `RepeatConfig` from Routines — a plan is an ordered template, not a log entry), imports from other sources (Garmin, Apple Health, Google Fit, manual CSV).

#### Add-on app architecture (built)

Fitness is the first app built against the suite's future "core bundle (nav items 1–5) + optional/paid add-ons (Portfolio, Fitness, below the nav divider)" model. `src/config/apps.ts` defines `APP_TIERS` and `isAppEnabled(view)` — the single gating point NavSidebar, App.tsx's routing, and the `6`/`7` hotkeys all check. `isAppEnabled` always returns `true` today (no entitlement backend exists), but every caller already treats it as something that can say no, so wiring a real purchase/entitlement check later is a one-function change. `PortfolioSection` and `FitnessSection` are also now `React.lazy()`-loaded (confirmed via build output: separate chunks, ~200KB off the main bundle) instead of statically bundled — the "code-splitting ensures each app's bundle only loads when needed" line in the suite architecture doc was aspirational until this; it's now real for the two add-on apps. See CLAUDE.md "Add-on app architecture" for the full writeup.

#### Strava API setup guide (for the user — external prerequisite)

Needed before any of the Strava integration architecture above can be built or tested:

1. Go to https://www.strava.com/settings/api (requires a Strava account, log in first).
2. Fill in the "My API Application" form:
   - **Application Name**: anything recognizable, e.g. "Organisaitor Fitness" (shown on Strava's consent screen when connecting).
   - **Category**: pick whatever fits closest (e.g. "Training").
   - **Club**: leave blank.
   - **Website**: the deployed app URL (Vercel production URL).
   - **Authorization Callback Domain**: the bare domain only, no `https://` and no path (e.g. `my-todo.vercel.app`, not `https://my-todo.vercel.app/api/strava-oauth-callback`) — Strava enforces this format.
3. Submit. Strava issues a **Client ID** (safe to share, not secret) and a **Client Secret** (treat like a password).
4. Client ID: fine to paste in chat when ready to build the OAuth pieces. Client Secret: do **not** paste it in chat — add it directly as a Vercel environment variable (Project Settings → Environment Variables) once told the exact variable name to use; it must **not** have a `VITE_` prefix, or it ships to the browser.
5. ✅ Done — Client ID `270097` registered, `VITE_STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` set in Vercel and deployed. This unblocked the OAuth build above.

#### Decisions (resolved)

1. **OAuth scope**: start with `activity:read` (public activities only). `activity:read_all` (private activities included) is an explicit future expansion, not a Phase 1 blocker — re-running the OAuth connect flow with a wider scope is a small change when wanted.
2. **Display units**: metric (km, km/h) by default. Stored data is SI (meters, m/s) regardless, so an imperial toggle later is a render-layer-only change.
3. **Sync trigger for Phase 1**: manual "Sync now" button only. No automatic/throttled background sync in Phase 1.

#### Remaining prerequisites (not decisions — actions needed before/while building)

4. ~~**Strava API app registration**~~ — done (client id `270097`, env vars set in Vercel).
5. **Run `012_fitness_strava.sql` against the live Supabase project** — the table doesn't exist yet, so "Connect Strava" will fail at the token-upsert step until this runs.
6. **Tauri desktop OAuth**: the callback endpoint is a Vercel URL, which works naturally for the web/PWA build. Since tokens live in Supabase (not local device storage), the intended answer is "connect once via the web app, and the desktop build picks up the same connection through the synced `fitness_strava_connection` row" — flagged here so it's a deliberate decision, not an oversight, when this gets built.
