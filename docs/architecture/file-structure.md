# File structure

<!-- Moved out of CLAUDE.md on 2026-10-09 (audit: CLAUDE.md is read every session, this is reference). Read it only when the task needs it. -->

A one-line description of every folder and notable file. Search the code first; read this when you need the map. **When you add a folder or a notable file, add its line here.**

```
src/
  App.tsx                    — root: hotkey handler, modal routing, section switcher
  types/index.ts             — all TypeScript interfaces and unions
  types/agent.ts             — agent command-layer types (RiskTier, EntityKind, AgentLogEntry, AgentBatch); not re-exported from index.ts
  types/overview.ts          — Overview types (OverviewQuery, Overview, OverviewRow, OverviewSourceKey); not re-exported from index.ts — see "Overview"
  contextMenu/               — right-click menus (see "Right-click menus"): types.ts (item / scope / provider / context), registry.ts (registerContextMenuProvider, scopes by element, resolveContextMenu), useContextMenuScope.ts
  specialChars/              — `//name` → a character, in every text field (see "Special characters"): charSets.ts (THE table: Greek today; findCharTrigger, matchChars, exactChar; SHORTCUTS/findShortcut; the person's own shortcuts: findUserShortcut, textShortcutProblem), charPicker.ts (the list under the cursor, shared), fieldInput.ts (installSpecialCharInput: one set of document listeners for every input and textarea, installed from App.tsx)
  charts/                    — charts for any app (see "Charts"): chartSpec.ts (ChartSpec, THE library-neutral description of a chart, and the pure data helpers: pasted tables, 100% stacking, waterfall steps), chartAdapter.ts (THE only module that knows Chart.js: toChartConfig, drawChart, which loads the library on first use), ChartWidget.ts + .module.css (THE chart-with-data-editor: the drawing, the data table, the paste box; plain DOM so any host can use it)
  diagrams/                  — diagrams for every app: diagramSpec.ts (THE stored description), diagramLayout.ts (dagre: Flow and Flowchart layouts), DiagramWidget.tsx (React Flow; lazy-loaded) — see CLAUDE.md "Diagrams"
  overview/                  — the Overview engine (see "Overview"): sources.ts (OVERVIEW_SOURCES — THE registry, one entry per app/item kind, pure functions over a store snapshot), engine.ts (runOverview: filter/sort/group; endeavourOverviewQuery), useOverviewSnapshot.ts (the React hook that builds the snapshot, encrypted notes/lists resolved through their views), open.ts (openOverviewRow — jump to a row's source), done.ts (the Overview's one edit: ticking a task, reminder or deadline row done)
  types/trash.ts             — Recycling Bin types (TrashEntry, TrashableKind, DeletedBy); not re-exported from index.ts — see "Recycling Bin" above
  agent/                     — the AI agent command layer (see "Agent command layer" below and docs/ai/02-command-layer.md): access.ts (THE boundary: what an agent can read and do), commands/*.ts, run.ts (runCommand), registry.ts (toolDefinitions), batch.ts (snapshot/diff/revert), errors.ts, devHandle.ts (dev-only console handle)
  test/                      — Vitest setup (Map-backed localStorage) and helpers
  config/
    hotkeys.ts               — HOTKEYS[] + HOTKEY_GROUPS (single source of truth)
    labels.ts                — all user-facing strings; rename concepts here
    trackerTemplates.ts      — FieldSchema[] presets for habit/books/movies/custom
    noteTagPresets.ts        — TagPresetDef[] curated annotation tag packs (Academic preset)
    noteTemplates.ts         — NoteTemplateDef[] content-prefill templates for AddNoteModal (Blank, Meeting Minutes, Daily Journal, Book/Article Notes, Project Brief, Cornell Notes)
    activityTypes.ts         — BUILTIN_ACTIVITY_TYPE_SEEDS (Run/Hike/Walk/Ride/Swim/Strength/Yoga/Other, fixed ids) used once by fitnessStore to seed activityTypes; DEFAULT_TOP_TYPE_IDS fallback for the pill row before any activities exist
    glossaryRelations.ts     — GLOSSARY_RELATIONS: how one Glossary entry can relate to another (type of, depends on, contrasts with, related), with the inverse wording
    structuredTagTypes.ts    — STRUCTURED_TAG_TYPES[]: registry of built-in tags that carry their own separate StructuredTagEntry data (Acronym, Definition, Concept); field kinds text/textarea/list/image/parent/links with readers (fieldText/fieldList/fieldLinks); each entry pairs a typeKey (matching BuiltinTag.typeKey) with a field schema and an optional non-AI infer() — see "Structured tag entries" in Implemented features for the extensibility design
    apps.ts                  — APP_TIERS (core vs addon nav sections) + isAppEnabled(view): single gating point for add-on app availability (Portfolio, Fitness today; no real entitlement backend yet — always returns true)
    calendarEventTypes.ts    — PICKABLE_EVENT_TYPES (Event/Birthday/Travel, with icons — the one list AddCalendarItemModal, CalendarEventPane and the import review offer) + EVENT_TYPE_ICON; TRAVEL_MODES (flight/train/bus/car/ferry and their icons) and eventTypeIcon(ev), the icon an event shows; names come from LABELS.calendarEventType / LABELS.travelMode
    places.ts                — PLACES: destinations that aren't items (Glossary, Review, History, Settings, Account, Integrations, Recycling Bin), shown as Quick Access's Places row, ordered by use
    createKinds.ts           — CREATE_KINDS: every kind of thing a creation pane's switcher can switch to, grouped by section (see "Creation panes: the switcher")
    noteBackdrops.ts         — NOTE_BACKDROP_PRESETS and the NoteBackdrop type (what fills the room below a note); each preset's look is CSS in NoteEditor/NoteBackdrop.module.css
    backup.ts                — PERSISTED_STORAGE_KEYS: every localStorage key any store persists to (single source of truth for full-app Export/Restore in AccountPane and IntegrationsPane — add a key here when a new persisted store is added, nowhere else)
  store/
    navHistory.ts            — the back/forward history's shape (NavPlace, what a stop is) and pure stack moves (pushPlace, travel); uiStore captures and restores places
    taskStore.ts             — tasks, collections, tags, purposes
    trackerStore.ts          — tracker entries
    routineStore.ts          — routine instances (localStorage only)
    noteStore.ts             — notes + note tags (localStorage only)
    listStore.ts             — lists + list items + list types; list/item mutations route encrypted lists themselves (see "Client-side encryption for Lists")
    fitnessStore.ts          — activities (Fitness app, localStorage only)
    scheduleStore.ts         — Schedule templates (recurring weekly timetables, Calendar section, localStorage only)
    uiStore.ts               — all UI state
    settingsStore.ts         — user preferences
    authStore.ts             — Supabase session
    pinnedItemsStore.ts      — what's pinned to Quick Access (Q), in order (persisted `quick-access-pins`; synced `quick_access_pins`); pin only through services/quickAccessPins.ts — see "Pin to Quick Access"
    recentItemsStore.ts      — Go to (Ctrl+G) recent/frequent visit history, keyed by `${QuickAccessTargetType}:${entityId}`
    stickyStore.ts           — where each sticky note sits on this device's screen (fractions of the window) and its design (sticky / pin / staple / tape)
    dialogStore.ts           — queue of pending confirm/alert requests (memory-only) behind `confirmDialog()` / `choiceDialog()` / `alertDialog()` in components/ConfirmDialog/dialogs.ts
    overviewStore.ts         — saved Overviews (persisted `overviews-storage`, synced `overviews`); deleteOverview goes to the Recycling Bin
    toastStore.ts            — the one toast showing (memory-only) behind `showToast()` in components/Toast/showToast.ts — see "Toasts"
    hotkeyOverridesStore.ts  — user-rebound hotkeys (persisted `todo-hotkey-overrides`); `matchesHotkeyId`, `findConflicts`
    notificationStore.ts     — pending in-app notifications + already-notified log (persisted `todo-notifications`)
    voiceStore.ts            — voice dictation status/level for VoiceIndicator (memory-only, written by services/speech/dictation.ts)
    trashStore.ts            — Recycling Bin: TrashEntry snapshots (persisted `trash-storage`, IndexedDB), see "Recycling Bin" above
    pictureStore.ts          — the picture library (persisted `pictures-storage`, IndexedDB; synced `pictures`); use only through services/pictures.ts
  services/sync/
    syncService.ts           — Supabase push/pull
    mappers.ts               — xToRow / rowToX for every entity
    hydrating.ts             — isHydrating / setHydrating: true while sync writes the cloud's rows into the stores (read by store watchers)
  services/quickAccessPins.ts — togglePin (toast with Undo), isPinned, pinMenuItem, the note-row pin provider, adoptLegacyNotePins: THE way to pin to Quick Access
  hooks/usePinAction.ts     — a pin button's icon/label/action, for a RowAction or a button (PinButton)
  services/newItem.ts       — openNewItem(view): THE N/Space/Ctrl+N routing, section by section (Notes: by focused column) — see "New-item hotkey"
  services/signOut.ts       — requestSignOut(): THE way to sign out — confirms (and says what stays on the device), locks the vault, force-uploads and only wipes if that succeeded (else warns, user can cancel), then authStore.signOut(). Never call authStore.signOut() directly from UI
  services/welcome.ts       — whether this device chose to carry on without an account (the welcome page): per device, not in backups, forgotten by requestSignOut
  services/glossary.ts      — the Glossary model (Definitions, Concepts, Acronyms across notes): glossaryEntries/glossaryEntry/glossaryReferences, through the views — see "Annotations"
  services/noteFromItem.ts  — createNoteForItem(place, title): a new note in a notebook, or a new tab of a note, returned as the CrossAppRef to link; newNoteTitleFor(title, date). "+ New note" in the calendar panes
  services/notePassage.ts   — openNotePassage(noteId, { mark | node, attr, value }); noteHasPassage / docHasPassage (the open editor's text first): THE way to open a note at a passage (finds the tab; NoteEditor selects it). definitionPassage(entryId)
  services/notesNav.ts      — what a Notes view does (open a note, go into a group, filter, grouping, view): the only way a view built on the browse model changes anything
  config/noteViews.ts       — NOTE_VIEWS: the Notes views and tools (id, kind, label, icon, Place, showsEditor); components in components/NotesSection/noteViewComponents.ts
  hooks/useNotesBrowse.ts   — the browse model for the current filter/grouping, and the trail to the group you are in
  services/noteReview.ts    — Review later: reviewItems/dueReviews (Important passages on the review list, from stored content) and answerReview (writes the schedule back, through the editor if that text is open)
  services/noteInbox.ts     — inboxes: sendToInbox (moves the selection into an inbox, leaving a marker; Undo), makeItemTask, openInboxItem / openItemSource, listInboxes — see "Inboxes"
  dictionary.ts / dictionaryActions.ts — the Dictionary: words kept in a built-in list, meanings fetched (Free Dictionary API, Wiktionary), use counts
  services/noteHubs.ts      — idea hubs: addPassageToHub (marks the passage, links it in the hub; Undo), addLinkToHub (a Glossary term or a note), setLinkRelation, removeLink (takes the passage's mark off), openHub / openHubLink / openHubFromMarker, listHubs
  services/noteContentEdit.ts — editNoteContent(noteId, tabId, { inEditor, inJson }): THE way to change a note's content from outside the editor (through the open editor if that text is open, else the stored JSON); editNoteText(…, schema, edit) when the editor's schema is at hand
  services/stickyNotes.ts   — sticky notes: notes in the Stickies notebook (presetKey 'stickies'); addSticky, setStickyContent (paragraphs with bold/italic/underline/strike, through editNoteContent), stickyDocOf/stickyDocFrom/stickyText, removeSticky (to the Recycling Bin, Undo)
  services/scratchpad.ts    — the scratchpad (Alt+P): one note in its own notebook (presetKey 'scratchpad', pinned after Stickies); ensureScratchpad, scratchpadText, cutScratchpad (with Undo)
  services/glossaryDelete.ts — deleting a Glossary record: asks (saying how many links go too), then removes every link to it in every note
  services/noteLinkTargets.ts — what a note link or embed points at: noteDocFor, linkTarget (the passage as it reads now), ensureBlockId, openNoteLink
  services/liveNoteEditor.ts — THE registry of open note editors (one per pane side by side): registerOpenNoteEditor, the one in front via registerLiveNoteEditor/liveNote(); liveNoteEditorFor(noteId, tabId), liveNoteFor(noteId), liveNotes(), liveNoteOf(view), flushOpenNoteEditors(). A change to a note's content from outside the editor goes through that view when it's open
  services/clearLocalData.ts — clearSyncedLocalData(): empties every CLOUD-SYNCED store + the account-specific selection ids (each reset from its own getInitialState()). Local-only stores (fitness, routine instances, settings, hotkeys, portfolio columnConfig) are deliberately left; add a store here in the same change that gives it cloud sync
  services/oauthState.ts    — mintOAuthState(provider): the single-use nonce used as the OAuth `state` for Strava/Google connect (migration 032; on Android it also records the client, migration 041, falling back if that isn't run); never put a credential in an OAuth URL. openOAuthFlow(provider, url): THE way a connect button starts the flow — a page navigation on web/desktop, the in-app browser on Android (resolves when the flow returns or the browser closes)
  services/android/deepLinks.ts — THE organisaitor:// router on Android: registerDeepLink(host, handler), startDeepLinks() (one appUrlOpen listener + the cold-start launch URL), started from one effect in App.tsx. A feature adds a route here, never its own appUrlOpen listener
  services/android/oauthReturn.ts — the `oauth-done` route: what the callbacks send an Android flow back to (closes the browser, settles openOAuthFlow, navigates like the web's ?strava/?googleCalendar return, toast). Server half: api/_lib/oauthReturn.ts
  services/strava.ts         — client-side Strava wrapper: getStravaConnectUrl(), checkStravaStatus(), syncStrava() (calls api/strava-* edge functions, upserts results into fitnessStore)
  services/googleCalendar.ts — client-side Google Calendar sync wrapper: getGoogleCalendarConnectUrl(), syncGoogleCalendars() (waits for the cloud load, calls api/google-calendar-sync and -instances, maps through calendarImport/google.ts and applies through calendarImport/reconcile.ts) — see docs/features/external-calendar-sync.md
  services/microsoftCalendar.ts — Outlook sync: getMicrosoftCalendarConnectUrl(), syncMicrosoftCalendars() (delta cursors per device, series refresh, applies through calendarImport/reconcile.ts), clearMicrosoftCursors()
  services/calendarConnections.ts — every provider's connections: fetchCalendarConnections(), setCalendarEnabled(), disconnectCalendar(), syncAllCalendars()
  services/calendarImport/  — every calendar import (Google and Outlook sync, .ics files): microsoft.ts (mapMsEvent, msRecurrenceToRepeat, seriesDrafts, removedDraft, pure); draft.ts (ImportDraft, ImportedFields, importKey, the field comparisons), classify.ts (birthdays, travel modes from titles), google.ts (mapGoogleEvent, pure), ics.ts (icsToDrafts, withEventType), ids.ts (importedEventId: the same id on every device), reconcile.ts (applyImport — THE one place imported events are created, updated or removed — findExisting, removeImportedEvents)
  services/crossAppLinkCleanup.ts — deleteTaskWithCleanup/deleteNoteWithCleanup/removeCrossAppRefFromTarget: keeps cross-app links (Task.crossAppRefs, Notes' ArtifactLinkMark) from going dead when either side is deleted; the one module allowed to import both taskStore and noteStore (they must never import each other directly) — see "Cross-app linking"
  services/taskCompletion.ts — toggleTaskCompletion(taskId): THE way the UI completes or reopens a task. Asks before completing one that's waiting on other tasks (complete anyway / complete the whole chain upstream, via choiceDialog), then toggles through taskListLinks and shows the Completed toast (what it unlocked, + Follow-up, Undo). Agents toggle directly (agent/access.ts) — no dialog, no toast. Enforced by a pattern test
  services/notifications/   — THE notification rules and their delivery (docs/android/05-notifications.md): plan.ts (planNotifications — pure, every platform; WHEN anything notifies is decided only here), actions.ts (snooze / Done / complete the task / open the item — shared by the bell and Android buttons), androidScheduler.ts (Android: books the next 14 days with the OS via @capacitor/local-notifications, reconciles on launch/resume/store change, channels, buttons, permission ask). The desktop/web poller is hooks/useNotificationChecker.ts, built on plan.ts
  config/itemIcons.ts       — ITEM_TYPE_ICON / ITEM_FLAG_ICON / INBOX_ICON: THE icon for each item kind (deadline 🏁) and flag (❗ ✏️ 🔁) — see "Inline objects in notes"
  config/swatches.ts        — SWATCHES: THE colour palette every picker offers (hex for stored colours, pale for fills; tokens --color-swatch-* for drawn ones) — see "Colours a person picks"
  utils/floatingPlacement.ts — placeFloating / useFloatingPlacement / placeElement: THE way to place a dropdown, menu or popover so all of it is reachable
  utils/marginLayout.ts     — the margin column's layout: rows per line, three icons then +N, brackets (layoutMarginRows, spansLines)
  utils/unsureFlag.ts       — which sentence an Unsure flag takes (sentenceEndingAt, findUnsureTrigger), asQuestion
  utils/windowsZones.ts     — Windows time zone names to IANA (windowsZoneToIana, CLDR's table) and sameClock(a, b, at)
  utils/rrule.ts            — iCalendar repeat rules into RepeatConfig: parseRRule, parseRecurrence (with EXDATE), icalDate; null for what the app can't show exactly
  utils/typingTarget.ts     — isTypingTarget(e | element): THE "is the person typing?" check for key handlers (sees into shadow DOM)
  utils/noteInboxes.ts      — inboxes read from stored note content (inboxesInContent, collectInboxes), insertIndex, localDay; utils/inboxDoc.ts — their document operations (findNode, insertItem, sortedItems, sliceToBlocks)
  components/HubPickerModal/ — Add to hub (which hub) and a hub's + Link… (which Glossary term or note), each with how it relates
  components/NotesSection/HubsView.tsx — the Hubs view: every hub across notes, searchable (a Place)
  utils/noteHubs.ts         — hubs read from stored note content (hubsInContent, collectHubs), RELATIONS, linkInsertIndex
  components/NoteViews/Map/ — the Map (a Notes view and a Place): MapView (React Flow canvas), MapNodes (blob, label, note, item nodes; the link curve), atlasLayout.ts (circle-packed blobs, d3-hierarchy; blobPath), mapHover.ts; links via hooks/useNoteMapLinks.ts. Was components/NotesSection/MapView.tsx (a dagre graph) until 2026-10-17 — notes joined by their links, and optionally the items linked to them; lazy (React Flow, dagre)
  utils/noteMap.ts          — the Map's graph (buildNoteMap, noteTargetsIn), pure
  utils/noteBackdrop.ts     — which backdrop a note shows (resolveNoteBackdrop: its own, its notebook's and those above, the app-wide one), pure
  utils/richText.ts         — a little formatting in a block's own fields: sanitizeInlineHtml, richToPlain, richLines (Glossary cards)
  components/NoteEditor/blockFieldFormat.ts — formatFocusedBlockField: the ribbon's formatting buttons on a focused card field
  utils/noteLinks.ts        — links between notes read from stored content: linksToNote, unlinkedMentions, mentionRange, passagesOf, findBlock, passageRange
  src/test/glossaryFixtures.ts — defineInItsNote: puts a test record's card in its note (a record only counts while its note defines it)
  src/demo/demoAccount.ts   — the demo account (an Earth Sciences student's semester across every app), built through the stores' own actions; demoAccount.test.ts checks it against the editor's schema and writes it as a backup file (DEMO_OUT)
  src/demo/loadDemo.ts      — the in-app demo loader (Account pane, dev builds only): wipes this device and the signed-in demo account, adds the pictures, builds the demo dated from today, adds per-device touches
  src/demo/resources/       — the user's demo pictures, one file per slot (README lists them)
  components/InboxPickerModal/ — Send to inbox: the picker (inboxes ranked by the selected words, New inbox here, Also make a task)
  config/itemLinkKinds.ts   — ITEM_LINK_KINDS: THE registry of task-link kinds (Waiting on / Follow-up of / Related — icon, labels, blocks, symmetric); see "ItemLink" in Type system
  components/NoteEditor/noteEditorExtensions.ts — THE note editor's list of extensions (NoteEditor, the block guide, the demo's schema check)
  demo/noteContent.ts, demo/blockExamples.ts — writing note content in code, and one example per note block (the demo and the block guide)
  components/NoteEditor/extensions/CaseStudy.ts, CauseEffect.ts (+ causeEffectChain.ts), Venn.ts (+ vennLayout.ts) — the case study, cause and effect, and Venn note blocks (2026-10-23)
  utils/eventTaskLinks.ts   — tasks linked to an event or a Deadline (prepFor / followUpOf / related), pure: anchorOf, datesForLink, followMove, tasksLinkedTo
  utils/taskLinks.ts        — the task-link rules, pure: taskRelations (both directions), openBlockers/isBlocked/openBlockersDeep, unlockedBy, canAddLink (self/duplicate/loop), makeItemLink
  services/recurringTasks.ts — recurring tasks: nextOccurrenceDate (pure), spawnNextOccurrence (called on completion by taskListLinks and agent/access), nextOccurrenceOf, discardOccurrence (the toast's Undo), repeatSummary — see "Recurring tasks" in Type system
  services/taskListLinks.ts — a task's linked lists: checklistProgress() (the "📋 3/7" pill), toggleTaskWithLists() (toggles a task and unticks a linked checklist marked reusable — the UI calls it through services/taskCompletion.ts, never directly), toggleChecklistItemWithTasks() (THE way UI ticks a checklist item — offers to complete the linked task when the last one is ticked). Agents don't use it (no list access) — see "Lists: links from tasks, calendar items and notes" in Implemented features
  services/eventTaskLinks.ts — linking tasks to events and Deadlines (linkTaskToEvent, unlinkTaskFromEvent, linkedTaskDates) and initEventTaskFollow, the calendar-store watcher that moves linked tasks with their event (Undo toast)
  services/taskCalendarLinks.ts — keeps a task's shadow CalendarDeadline (deadline date) and event (scheduled date) matching the task, and flows edits made on the event back — the one place that logic lives (see "Task ⇄ calendar shadow entries" in Implemented features); like crossAppLinkCleanup it may import both taskStore and calendarStore
  services/taskDeadlineMigration.ts — migrateTaskDeadlineShadows(), called once from App.tsx's startup effect: converts any pre-2026-09-27 task shadow that's still a `CalendarReminder` with `reminderType: 'task'` into a `CalendarDeadline` with `deadlineType: 'task'` and repoints the owning task's `calendarDeadlineId`. State-driven (looks for legacy shadows still present, not a run-once flag), so it's naturally idempotent — see "Deadline calendar kind" in Implemented features
  services/trashCapture.ts  — moveToTrash(kind, entity): the write half of the Recycling Bin, called from inside every store's own delete* action. Deliberately imports NO domain store (only trashStore) so every domain store can import it without an import cycle — see "Recycling Bin" above
  services/pictures.ts      — THE picture library (backdrops, note text, Glossary cards): add (stored once; encrypted for an encrypted note), show (usePictureSrc, onPicturesChange), place (setBackdrop, pictureRef), uses, delete everywhere; initPictures keeps encrypted notes' pictures encrypted — see CLAUDE.md "Picture library"
  services/trash.ts         — restoreFromTrash(entryId)/deleteForever(entryId), trashedBy(run)/restoreAllFromTrash(ids): the restore half, imports every domain store to write a snapshot back; never imported by a store or by trashCapture.ts (import cycle)
  services/undoableActions.ts — archiveTaskWithUndo / deleteTaskWithUndo: act at once, then an Undo toast (decision D2: swipe-left and action-sheet paths; pane footers keep their confirm dialog). Delete's Undo restores every Recycling Bin entry the delete made
  services/noteSecrets.ts    — the encrypted-notes model: NoteSecrets/EntrySecrets shapes, the memory-only plaintext cache, noteView()/entryView()/isNoteLocked() (the ONE way to read a possibly-encrypted note), the serialized re-encrypt queue (queueEncrypt/flushEncryptions) — see "Client-side encryption for Notes — comprehensive"
  services/noteSecretsSync.ts — keeps that cache in step: decrypts encrypted notes/entries when the vault unlocks or a sync pull brings new payloads, wipes it on lock, upgrades v1 legacy encrypted notes
  services/listSecrets.ts    — the encrypted-lists model (Lists twin of noteSecrets.ts): ListSecrets/ItemSecrets shapes, memory-only plaintext caches, listView()/itemView()/isListLocked() — the ONE way to read a possibly-encrypted list/item. Reuses noteSecrets.ts's crypto, serialised re-encrypt queue and cache-version counter
  services/listSecretsSync.ts — keeps those caches in step with the vault (decrypt on unlock/sync pull, wipe on lock)
  store/listViews.ts         — React hooks useListViews()/useListView(id)/useListItemViews(): lists/items resolved through the cache
  components/ErrorBoundary/ — class ErrorBoundary: `scope="app"` (around <App /> in main.tsx: full-page fallback with Reload + Export backup + collapsed Details) and `scope="section"` (around the section switcher in App.tsx, keyed by `activeView` so navigating away resets it: "Reload this section", nav keeps working). A **new section must render inside that section boundary**; copy is `LABELS.errorBoundary`
  components/ConfirmDialog/ — THE replacement for window.confirm()/alert(): `dialogs.ts` (`confirmDelete`, `confirmDialog`, `choiceDialog`, `alertDialog`) + `ConfirmDialogHost`, mounted once in App.tsx (see "Confirmations and alerts")
  components/OverviewSection/ — the Overview section: sidebar (Endeavours → their automatic Overview; My overviews with RowHoverActions edit/delete; + New overview) + grouped table (row click opens the item in its app)
  utils/emptyContent.ts      — whether a note or rich text has anything in it (deleting an empty thing doesn't ask)
  components/AddOverviewModal/ — create/edit a saved Overview (sources, Endeavour, open/all, dates + window, title search, sort, group)
  utils/suggestRank.ts      — rankSuggestions/rankSearch: THE ordering for every "link a …" picker (see "Pickers suggest by keywords")
  components/HoverOptions/  — HoverOptions: hovering a button offers labelled alternatives to its plain click (the RowHoverActions machinery, `align`-able, vertical list); on Android a long-press opens them in an ActionSheet. Used for a task's Complete (TaskItem checkbox, ItemActionFooter's `completeOptions`)
  components/BottomSheet/   — BottomSheet: THE phone bottom sheet (portaled, backdrop tap / grabber drag-down / Escape + Android back close it, 85vh, safe-area padding, z-index 1020) — see "Bottom sheets"
  components/ActionSheet/   — ActionSheet (a BottomSheet of `{ label, icon?, onSelect, destructive? }`; choosing closes, then runs) + ActionSheetButton (one row, shared with RowAction in the sheet)
  components/Toast/         — `showToast()` (showToast.ts) + `ToastHost` (Toast.tsx), mounted once in App.tsx — see "Toasts"
  components/TaskLinks/     — EventTasksField: the event and Deadline panes' Tasks (linked tasks, + Preparation / + Follow-up / Link a task…); TaskLinksField: TaskPane's "Task links" section (grouped both-direction rows with editable reasons; + Waiting on… / + Follow-up / + Related…)
  components/TaskPickerModal/ — the "link a task" search dialog (portaled, shares NotePickerModal's CSS module like ListPickerModal)
  components/DecryptPrompt/  — app-wide "enter your passphrase to permanently decrypt this note/list" modal (uiStore.decryptPrompt / requestDecrypt), portaled, z-index 200; opened by every clickable 🔒
  store/noteViews.ts         — React hooks useNoteViews()/useNoteView(id)/useEntryViews(): notes/entries resolved through the cache, re-derived when the store OR the cache changes
  services/vault.ts          — client-side encryption vault: setupVault/unlockWithPassphrase/unlockWithRecoveryCode/lockVault, trustThisDevice (IndexedDB key cache), encryptField/decryptField (AES-GCM via Web Crypto) — see "Client-side encryption for Note content"
  services/autoBackup.ts     — automatic local backup rotation (change-volume-triggered, no time-based trigger): subscribes to every persisted domain store, accumulates a weighted change score, and once it crosses settingsStore.autoBackupChangeThreshold builds+saves a snapshot via autoBackupStorage.ts and thins old ones via utils/backupRetention.ts. initAutoBackup() called once from App.tsx. See "Automatic local backup rotation" in Implemented features
  services/autoBackupStorage.ts — IndexedDB storage for automatic snapshots, its own database (`organisaitor-backups`, deliberately separate from the notes/trash one): saveBackupSnapshot/listBackupSnapshots/getBackupSnapshot/deleteBackupSnapshot, all best-effort
  utils/
    backupRetention.ts       — selectSnapshotsToKeep(snapshots, targetAgesDays, now): pure grandfather/tiered-thinning algorithm (always keeps the newest, then claims the nearest unclaimed snapshot per target age, closest-first) — used by services/autoBackup.ts
    backupExport.ts          — buildBackupSnapshot() (every `PERSISTED_STORAGE_KEYS` key, used by both downloadBackup() and services/autoBackup.ts) / downloadBackup() / downloadAutoBackupSnapshot(id, createdAt) (one automatic snapshot as a file — Integrations pane): exports straight from localStorage (works without the app rendering); used by AccountPane and the ErrorBoundary fallback. restoreBackupData(backup, userId): writes a backup object back to persisted storage + rehydrates the Supabase-synced stores + force-uploads if signed in — the one restore path AccountPane, IntegrationsPane and AutoBackupSection all call
    calendarItemInput.ts     — buildCalendarEventInput / buildCalendarReminderInput: the rules for turning what a person or an agent supplied into a stored event/reminder (used by AddCalendarItemModal and the agent commands)
    scheduleBlocks.ts        — createScheduleBlock(): the one place a ScheduleBlock's defaults live (used by AddScheduleModal and the agent commands)
    date.ts                  — todayIso(), formatDate(), timeAddMinutes(), addDaysToIso(), computeLinkedEndTime() (auto-derives a linked end time from a start time — see Timepicker rebuild in Implemented features), etc.
    id.ts                    — typed nanoid wrappers
    notes.ts                 — Note/NoteTag Endeavour resolution: getEffectiveCollectionId, resolveNoteInheritedCollectionId, getNoteEffectiveCollectionId, getVisibleNoteTagIds, getNoteBreadcrumb (a note's location as a string, e.g. in the note picker)
    noteQuestions.ts         — questions in notes (collectQuestions, for the Overview) and questionSubject ("What is osmosis?" → "osmosis")
    acronymInference.ts      — rules-based acronym finding (Schwartz & Hearst, refined): inferAcronymFromSelection, deduceAcronym (first letters), acronymLetterPositions (which letters spell it), acronymPairAtEnd (for the as-you-type offer)
    blockOffers.ts           — rules for spotting writing that is a block as it is typed: quoteJustTyped, typesJustTyped, prosConsJustTyped
    notesBrowse.ts           — the Notes browse model: the notes as a tree of groups for a filter and grouping (browseNotes, NOTE_GROUPINGS, groupPath); every Notes view draws it
    viewTransition.ts        — withViewTransition(kind, change): animate a change of view or level with the browser's View Transitions (no library; skipped with reduced motion)
    pageKeys.ts              — pageKeyBlocked(e): THE check a section hotkey makes (typing, or an overlay open over the page)
    collections.ts           — getOrderedEndeavours(collectionsRecord): Projects then Lists, in CollectionFilterPicker's render order; shared by the picker and the Ctrl+E digit-select hotkey
    fitnessFormat.ts         — Fitness display formatting (metric only, Phase 1): formatDistance, formatDuration, formatSpeed, computeAverageSpeedMps. Stored data is always SI (meters/seconds/m·s⁻¹); conversion happens only here, at render time
    fitnessActivityTypes.ts  — getActivityType() (graceful fallback if a type was deleted) and getTopActivityTypes() (usage-ranked, for the AddActivityModal pill row)
    links.ts                 — openExternalLink(url) (Tauri-aware: routes through @tauri-apps/plugin-opener under Tauri, @capacitor/browser under Android, window.open() in the browser/PWA) and normalizeLinkUrl(raw) (prefixes bare domains with https://); shared by TaskItem/TaskPane/Notes link UI and App.tsx's global external-link click interceptor
    apiFetch.ts               — apiFetch(path, init): THE way to call /api/* (a pattern test fails on a bare fetch('/api…)); routes to the production Vercel URL through a native HTTP client in the packaged apps — @tauri-apps/plugin-http under Tauri, CapacitorHttp under Android (adapted back into a Response; never enable CapacitorHttp globally, it would patch Supabase's fetch too) — plain same-origin fetch in the browser. oauthRedirectOrigin(): the origin OAuth providers redirect back to (production in the packaged apps). See "Desktop (Tauri) API access" and "Android W1: platform services" in Implemented features
    saveFile.ts               — saveFile(filename, blob): THE way to hand the user a file (every export: backups, auto-backup snapshots, ErrorBoundary). Anchor download on web/Tauri; on Android writes to the cache directory and opens the share sheet (@capacitor/filesystem + @capacitor/share)
    convert.ts               — working out a conversion: convertUnit, runConverter / runConverterBack, readAmount, showAmount
    formula.ts               — THE formula reader and evaluator (mathjs syntax, no eval): compileFormula, formulaError
    dateCalc.ts              — the date calculator's rules (countFrom, between) and its wand's reader (readDateCalc)
    numberNotation.ts        — one number in four notations, exact (parseNumber, formatNumber, numberForms, cycleNotation, numberAt)
    textToTask.ts            — inferTaskFromSelection(text): non-AI date/time/priority/link inference for the Notes "Create ▸ Task" feature, and inferCalendarItemFromSelection(text) for "Create ▸ Calendar item" (kind event/reminder/deadline from phrase cues, plus travel/birthday, tentative, important, repeat — see "Notes Create ▸ Calendar item: phrase cues" in Implemented features) — regex-based, no external dependency; locale-aware (Intl) for ambiguous numeric dates. A new cue goes in with a test in textToTask.test.ts
    stableId.ts              — stableId(prefix, userId, key): the same id on every device for one imported thing (calendar import's importedEventId, Strava's stravaActivityId); each use is an approved exception to "never a fixed id"
    fitnessIds.ts            — stravaActivityId(userId, stravaId) and withStableStravaIds (older random-id Strava activities take their stable id on load)
    timelineWhen.ts          — readTimelineWhen (a timeline entry's When as a sortable point: dates in many formats, years, BC/AD, decades, ranges, times, "Day 3" steps) and readTimeline (the order, inherited years). Pure; a new format goes in with a test
    definitionInference.ts   — inferDefinitionFromSelection: term + meaning from "X is Y" / "X: Y" / a term and its sentence, for the Definition and Concept popover
    idbStorage.ts            — IndexedDB persistence for the notes store: preloadIdbStorage() (awaited in main.tsx before the app is imported), persistStorageIdb(), readPersistedValue()/writePersistedValue() for backup/restore, IDB_STORAGE_KEYS, getIdbUsage()
    persistStorage.ts        — THE `storage:` for every persist() (guards QuotaExceededError, see Zustand migration rule) + getStorageUsage()/formatStorageSize() for Settings → Storage
    imageCompress.ts         — compressImageBlob(file) / recompressDataUrl(dataUrl): scale to fit 1600 px + WebP; called only by services/pictures.ts (and squareIconDataUrl by block icons)
    noteTabs.ts              — MAIN_TAB_ID ('__main__'), tabDatesText (a tab's created/modified, the tab bar's hover), linkTabIdFor / effectiveLinkTabId / tabNameOf: how a CrossAppRef.tabId (a link naming one tab of a note) is recorded, resolved (deleted tab → main) and named
    keywords.ts              — extractKeywords(text) (stop-words/short words dropped, max 8) + stemForMatch(word); used by NotePickerModal's title-keyword suggestions
    noteSearchText.ts        — getNoteTabTexts(note): cached plain text of a note's main tab and each extra tab for searching (never caches encrypted notes); read a note's text for search through this, not by re-parsing its JSON
    openCrossAppTarget.ts    — (in services/) openArtifactTarget(type,id): opens a linked task/event/reminder in its section; used by editor link clicks and the Linked-from pills
    noteContent.ts           — stripArtifactLinksFromContent(contentJson, targetType, targetId): pure JSON-tree walk over a Note's stored Tiptap content, editor-independent (the note being cleaned up is rarely the one currently open) — used by crossAppLinkCleanup.ts
    haptics.ts               — Android-only guarded haptic wrappers (hapticLight/hapticMedium/hapticWarning — add hapticSuccess when first needed), no-op via Capacitor.isNativePlatform() elsewhere
    timeGrid.ts              — shared hourly time-grid layout math (buildHourLayout, minutesToY, layoutDayTimeGrid, markActiveHours), generic over item type; used by CalendarView's week/day views and CalendarSidePane's overlay-preview grid
    timeGridDrag.ts          — computeDragResult(geometry, pointerMinute, pointerColIndex): pure snap/clamp math behind drag-to-move / drag-to-resize on any hourly time grid — see hooks/useTimeGridDrag.ts and "Calendar drag-to-move / drag-to-resize" in Implemented features
    markdownTextEdit.ts      — toggleWrap(value, start, end, marker) / insertMarkdownLink(value, start, end, url, linkText?): pure text-splicing behind the "light rich text" Task/Calendar notes hotkeys — see hooks/useMarkdownHotkeys.ts
    scheduleOccurrences.ts   — expandScheduleBlock() (turns one ScheduleBlock into concrete occurrence dates, honouring interval/anchor/exceptions), blocksMayConflict() + countTemplateConflicts() (the schedule manager's "N potential conflicts" hint)
    recurrence.ts            — repeating calendar items and tasks: expandRepeat (honours RepeatConfig.exceptions, weekdays and the nth weekday of the month), repeatPattern (what those read as), nthWeekdayOfMonth, weekOfMonth, isOccurrenceSkipped, withException / endedBefore / tailOf (the "this one / this and following" operations) — see "Calendar: editing individual occurrences"
    timezone.ts              — account-wide timezone: resolveTimezone, zonedTimeToUtc, utcToZonedTime, rezoneWallClock, todayIsoInZone, listTimezones
    quickAccess.ts           — Quick Access / Go to provider registry (also resolveQuickAccessItem, resolvePinnedItems): one QuickAccessProvider per destination type (place/glossary term/note/notebook/task/list/endeavour/tracker/routine/schedule) with list()/resolve()/navigate(); searchQuickAccessItems(), resolveRecentItems(), navigateToQuickAccessItem() — extension point for new destination types (see Implemented features)
  services/timezoneMigration.ts — rezoneAllCalendarData(fromZone, toZone): re-stamps every stored wall-clock date+time when the timezone setting changes
  hooks/
    useCtrlEnterSubmit.ts    — THE Ctrl+Enter rule for form-less modals/panes: `useCtrlEnterSubmit(onSubmit, active?)` (see "Ctrl+Enter — universal submit rule")
    useEscapeClose.ts        — THE Escape rule: every overlay registers here; Escape closes only the most recently opened one (see "Escape key — universal close rule"). closeTopOverlay() is the same for the Android back button
    useHoverOpen.ts          — a header button's panel opened on hover as a preview (the bell, the Settings peek); a click is the site's (pin it, or open the full modal). Does nothing on Android
    useLongPress.ts          — long-press (450 ms, cancelled by >10px movement, hapticMedium, swallows the click it produces, cancels Android's own long-press menu). Touch only — see "Bottom sheets"
    useSwipeRow.ts           — swipe right (row's positive action) / swipe left (reveal the row's actions), axis lock, 24px edge exclusion; the classification is pure exported functions. Used by TaskItem
    useTimeGridDrag.ts       — shared drag-to-move / drag-to-resize for any hourly time grid built on utils/timeGrid.ts: one hook instance can drive every draggable block on a page (geometry supplied per-gesture, not fixed at hook-creation time). Used by CalendarView's week/day grids (Events move+resize, Reminders move only) and ScheduleWeekGridPreview's block editor (AddScheduleModal) — see "Calendar drag-to-move / drag-to-resize" in Implemented features
    useMarkdownHotkeys.ts    — "light rich text" for plain-<textarea> notes fields (Task/Calendar): Ctrl+B/Ctrl+I wrap the selection in Markdown bold/italic syntax (utils/markdownTextEdit.ts's pure toggleWrap), Ctrl+L opens components/MarkdownLinkPrompt to insert a `[text](url)` link. Attached directly to the textarea element, not `document`. See "Light rich text" in Implemented features
  components/
    NavSidebar/              — left nav: section switcher, settings, account icons (desktop/web only — hidden on Android in favour of MobileNav); navItems.tsx holds CORE_NAV_ITEMS and SECTION_ICONS (THE icon per section)
    NavFlash/                — what a keyboard back/forward (Alt+←/→, Backspace) shows: the compact history carousel (HistoryCarousel) centred on where you went, a small arrow at its side; stays while Alt is held, fades after (uiStore.navFlash, set by App.tsx).
    StickyNotes/             — the sticky notes over Notes (desktop): paper that stays where it's dragged, four designs, its text written in place; right-click: open, design, remove; mounted by NotesSection
      useSimpleNoteEditor.ts — the small editor over a simple-text note (a sticky, the scratchpad): debounced save, takes up outside changes; simpleNoteExtensions(placeholder)
    ScratchpadPanel/         — the scratchpad panel (Alt+P, over any section): Copy all / Cut all, Open in Notes, Scratchpad paper or Simple design; mounted by App.tsx
    WelcomePage/             — what a signed-out visitor sees instead of the app: suite name, tagline (LABELS.welcome), logo (public/brand/logo.png → /brand/logo.png), Sign in / Create an account / Continue without an account; App.tsx decides when
    HistoryBrowser/          — Alt+N: the history carousel (portaled, z-index 410); describePlace.ts reads a place's title, path, detail and preview live from the stores; PlaceCard.tsx is THE card for a place, shared with the phone's recent notes (MobileNotes)
      HistoryCarousel.tsx    — THE history carousel (cards fanned either side of the centred one), drawn full size by the history browser and compact by NavFlash.
    MobileNav/               — Android-only bottom tab bar: Tasks/Calendar/Records/Lists/More
    MobileMoreSheet/         — Android-only overflow sheet for MobileNav's More tab: Notes/Portfolio/Fitness/Manage Library/Settings/Account
    MobileQuickAddBar/       — Android-only bottom-anchored task quick-add (title + Due/Priority/Endeavour chips), replaces QuickAddInput on Android
    MobileCalendarQuickAdd/  — Android-only bottom-sheet quick-add for calendar events/reminders
    MobileNotes/             — Android-only Notes (NotesSection renders it instead of ChronicleView): the home screen (notebook tree with notes inside, or Recent as PlaceCards; uiStore.mobileNotesHome) and the full-screen note. The note's phone heading and side panel are in NoteEditor (isAndroid) and NoteEditor/MobileNoteSidePanel.tsx
    Sidebar/                 — hover panel (from the header hamburger, left-hand side): pinned "Manage Library" button (M/Ctrl+M) at top, then active endeavours (collections), purposes, tags — quick glance + filter/edit, not administration (see ManagePane). Every section except Calendar — there, the same hamburger click-opens CalendarSidePane instead (see "Calendar side pane")
    TaskList/                — main task list + collapsible Routines section
    TaskItem/                — single task row; shows subtask progress pill
    TaskPane/                — slide-in task detail/edit pane
    ResizeHandle/            — THE draggable edge of every side panel and column: usePaneWidth (widths in settingsStore.paneWidths) + ResizeHandle; SplitDivider, the line between panes of a split view (fractions)
    Icons/                   — THE suite's shared UI icons (see "Icons come from one place"): index.ts, ActionIcons.tsx (TrashIcon/ArchiveIcon/RestoreIcon/CheckCircleIcon), TextColorIcon.tsx, ColorDotIcon.tsx (one colour as a dot: a note colour in a menu), DisclosureIcon.tsx (the expand/collapse arrow) + disclosureDom.ts (the same arrow for plain-DOM code), FlagIcons.tsx (UnsureIcon) + unsureIcon.ts (createUnsureIcon: the Unsure flag's broken-ring question mark for plain-DOM code; not UnsureIcon.tsx, which would clash on a case-insensitive disk)
    ItemActions/             — the SHARED archive/restore + delete pattern every item pane uses (Task, Calendar event, Calendar reminder; future apps' panes should too) — see "Shared item actions" in Implemented features: icons from components/Icons, ItemActionFooter (optional Complete/Mark-incomplete toggle for task-backed items), ItemActionDialog (archive-with-reason + delete-confirm, portaled z-102), ArchivedBanner, useItemActions hook (dialog state + Escape + Ctrl+Enter + hotkeys)
    AddTaskModal/            — create task (basic + advanced sections)
    AddTaskButton/           — speed-dial FAB (view-aware)
    AddCollectionModal/      — create endeavour (project/list/tracker/routine)
    AddTrackerModal/         — create tracker (template picker + field config)
    AddRoutineModal/         — create routine (steps + day-of-week picker)
    AddEntryModal/           — add/edit tracker entry (dynamic fields)
    AddTagModal/             — create/edit tag (has notes textarea)
    AddPurposeModal/         — create/edit purpose
    AddCalendarItemModal/    — create calendar event or reminder
    EditTrackerPane/         — slide-in: edit tracker name/color/fields
    RecordsView/             — Records section: tracker sidebar + tracker detail + routines
    RoutineChecklist/        — routine card (steps, progress, complete button)
    CalendarView/            — month/week/day calendar; week/day use an hourly time grid (src/utils/timeGrid.ts)
      CalendarItemHoverCard.tsx — an entry shown whole while hovered (title, when, where, Endeavour, notes, links), placed by useFloatingPlacement
    CalendarEventPane/       — slide-in: edit calendar event
    CalendarReminderPane/    — slide-in: edit calendar reminder
    CalendarDeadlinePane/    — slide-in: edit calendar deadline (structural near-copy of CalendarReminderPane; "Notify me" is always shown, not gated by "no Time set" — a Deadline notifies only before, never at, even with a Time)
    RecurrenceScopeBar/      — shown at the top of the event/reminder panes for a repeating item: edit/delete only this occurrence or this-and-following
    AddScheduleModal/        — create/edit a Schedule (recurring weekly timetable) and its blocks
    CalendarSidePane/        — left-sliding pane (Calendar section): Layers toggles + Schedule list/manager (active toggle, conflict hint, overlay-preview grid) in one place — supersedes the old CalendarLayersPicker (header dropdown) and ManageSchedulesPane (right-sliding pane), see "Calendar side pane" in Implemented features
    ScheduleOccurrencePopover/ — click a Schedule occurrence on the calendar: skip this date, commit/uncommit (commitment mode), or jump to editing the Schedule
    AllDayNotifyField/       — NotifyLead.tsx: the Notify field for every calendar item (NotifyRuleField with its on/off box, NotifyRuleEditor, LeadAmountInput: a typed amount + ▾ presets); the rules are utils/notifyRule.ts
    IconPicker/              — IconField (pick an icon: emoji, search, your icons, a picture made into a 96 px icon), ItemIcon (show one), iconValue.ts (an icon is an emoji or picture:<id>); the emoji are config/emojiSet.ts
    BlockGuide/              — the block guide (a Place): every note block by category, its designs, a live read-only example (guideData.ts: keyword → node, examples from demo/blockExamples.ts)
    ConverterPane/           — the converters panel (Alt+=, a Place): built-in units and the person's own; ConverterEditor makes and edits one (Settings → Converters opens it too); ConvertWidget is one conversion as hosted by the `\convert` note block (extensions/Convert.ts), its pure parts in convertValue.ts
    DateCalculator/          — the date calculator (a Place; the Calendar header's button): count from a date, or between two dates, with the magic wand; rules utils/dateCalc.ts
    MagicWand/               — MagicWandButton + MagicWandPanel: a form filled in from words, through the form's own reader
    DateInput/               — the suite's date field (day/month/year segments, the time field's rules, ▾ calendar)
    MiniDatePicker/          — the go-to-date calendar (the Calendar side pane, the header's period picker as MiniDatePickerPopover, DateInput's ▾)
    (NoteEditor/extensions/partAdders.ts — "+" buttons beside a block's hovered part; cardImageLayout.ts — a Glossary card's picture width and place; objects/TaskBody.tsx — a task's pane body in a note)
    (NoteEditor/extensions/AutoBrackets.ts — brackets close themselves; EscapePassThrough.ts — lets an Escape no editor handler uses reach the Escape stack; CardTermLinks.tsx + CardTermLinkParts.tsx — Glossary term links in a card's fields; NoteSplitView/EmptyPane.tsx — a side-by-side pane with no note yet)
    (TimeInput/SegmentStepper.tsx — the ▲▼ of a segmented field; hooks/useWheelSteps.ts — the wheel steps a segment; utils/focusNext.ts — the next control in Tab order; utils/notifyRule.ts — one notify setting for every calendar item)
    OverviewRunway/          — an Overview's Runway (time left on a time line, dragging) and Board (time buckets) layouts; the rules are overview/timeline.ts, edits overview/edit.ts
    TimeInput/               — segmented hour/minute/AM-PM combobox respecting settingsStore.clockFormat (not a native <input type="time">, see Clock format setting below and the Timepicker rebuild entry in Implemented features), plus a quick-pick dropdown of half-hour times
    RepeatField/             — the repeat-rule editor (on/off, every N days/weeks/months/years, weekdays for weekly, "on the 2nd Tuesday" for monthly/yearly, ends never/after N/on a date); TaskPane and AddTaskModal
    TravelModePicker/        — how a travel event travels (flight, train, bus, car, ferry); AddCalendarItemModal and CalendarEventPane
    LinksField/              — the shared links list (clickable / edit / delete / add) used by TaskPane, CalendarEventPane and CalendarReminderPane; links typed into notes arrive via `mergeNewLinks` in the store's update action, never here
    LinkHoverPreview/        — app-wide: shows a hovered link's URL bottom-left (see "Link hover preview" pattern below)
    PinButton/               — the pin / unpin button beside an item's own heading (a list, a tracker, a routine)
    QuickAccessPane/         — app-wide: two tabs, Quick Access (Q: pins in your order, then Places) and Go to (Ctrl+G: search, Recent/Frequent); portaled search-and-jump overlay across Notes/Notebooks/Tasks/Lists/Endeavours/Trackers/Routines/Schedules, or browse Recent/Frequent visit history (see "Suite-wide Quick Access pane" in Implemented features)
    TruncatedText/           — wraps a CSS-ellipsis-truncated name/title; on hover, only when actually truncated, reveals the full text: `reveal="tooltip"` (default) in a floating box below the row, `reveal="extend"` drawn in place over the row and running out to the right (Notes: NoteList's note titles and ChronicleView's notebook names, 2026-09-28). Tooltip users: (2026-09-24) Sidebar/ManagePane/ListsSection/RecordsView's row names
    RowHoverActions/         — suite-wide nav-column row actions: RowOptionsMenu (the row's leading icon slot, which becomes a "⋯" on row hover; hovering it drops the actions down as a narrow column; long-press the row on Android) + RowAction (one labelled action), built on useRowHoverActions() (open/close state machine, shared with HoverOptions) + RowHoverActionsMenu (portaled floating panel; a BottomSheet on Android) — see "Row options menu" in Component patterns. Used by ChronicleView, Sidebar, ManagePane, ListsSection, RecordsView, OverviewSection
    SettingsPane/            — settings slide-in; reads HOTKEYS[] dynamically; NotificationsSection.tsx = Android-only Notifications block; SettingControls.tsx = the shared Toggle/SettingRow; StorageSection.tsx = the Storage block (per-store usage + Shrink images in notes); TypingShortcutsSection.tsx = the person's own typing shortcuts (add, edit, delete)
    ManagePane/              — library admin (Endeavours/Purposes/Tags): left-nav tabs + content, opened by clicking (not hovering) the header hamburger; archive/restore/delete rows. MANAGE_SECTIONS array in the file is the extension point for future tabs
    AccountPane/             — Supabase auth + account info; renders AutoBackupSection (both signed-in and guest branches)
    AutoBackupSection/       — automatic local backup UI (enable toggle, threshold, snapshot list with per-row Restore) — see services/autoBackup.ts and "Automatic local backup rotation" in Implemented features
    IntegrationsPane/        — (stub) future integrations
    RecyclingBinPane/        — suite-wide Recycling Bin: Ctrl+Shift+R or the "Recycling Bin" button in Account; filter chips by section, Restore / Delete forever per row, "Empty recycling bin" — see "Recycling Bin" above
    ColorPicker/             — reusable colour swatch picker
    CollectionPicker/        — CollectionPicker.tsx (single-select dropdown, used in create/edit forms) + CollectionFilterPicker.tsx (header Endeavour-focus picker, numbered for the E/Ctrl+E hotkey)
    CrossAppRefPicker/       — controlled { value: CrossAppRef[]; onChange; onNavigate?; types?; newNoteTitle? } widget: chips for existing links + "+ Note" (NotePickerModal) and "+ List" (ListPickerModal) buttons, and "+ New note" where `newNoteTitle` is passed (the calendar panes: NotePickerModal's place mode, then services/noteFromItem.ts); `types` limits which are offered (a list's own ListLinksBar offers notes only). List item/Tracker entry targets are BACKLOG. Used by AddTaskModal, TaskPane, the calendar event/reminder/deadline panes and ListsSection's ListLinksBar
    ListPickerModal/         — the "link a list" search dialog (portaled, shares NotePickerModal's CSS module); checklists first, encrypted lists by their view name
    LinkedChecklists/        — a task's linked checklists rendered as tickable steps inside TaskPane (each row IS the ListItem — nothing copied)
    MarkdownLinkPrompt/      — the Ctrl+L "insert a link" prompt for plain-<textarea> notes fields (Task/Calendar) — text+URL popover, portaled, mirrors NoteEditor's own "New link" pane visually/by keyboard. See hooks/useMarkdownHotkeys.ts and "Light rich text" in Implemented features
    LinkedNoteAbstracts/     — under a calendar item's notes: each linked note's abstract, editable in place (saves to the note); kept apart from the item's own notes. Used by the three calendar panes
    NotePickerModal/         — the "link a note" search dialog (mode 'place': where a NEW note goes — notebooks join the results, picking a note means a new tab of it) (portaled to document.body, z-index 1000): title + notebook path + preview + date per result, multi-word search over title/path/content, title-keyword suggestions while the search box is empty (`suggestFrom`), keyboard nav; captures Ctrl+Enter so the pane/modal behind it doesn't answer. Any future "pick a note" UI should reuse it rather than list notes by title alone — titles are not unique
    PurposeFilterPicker/     — header Purpose-focus picker (multi-select checkboxes), Tasks section only; P/Ctrl+P hotkey
    SortBar/                 — sort controls for task list
    NoteEditor/              — Tiptap v3 rich-text editor with toolbar, zoom, table support, abstract, attributes panel
      extensions/ResizableImage.ts   — the note picture: eight handles when selected (corners keep the shape, edges stretch, `height` set once stretched) and Crop (crop handles over the whole picture, dimmed outside; Enter/Done/click away applies, Esc cancels). The crop is attributes (`crop`, fractions per side), never cut from the image. Geometry is pure in imageGeometry.ts; CSS in ResizableImage.module.css
      extensions/HeadingNumbering.ts — ProseMirror plugin: computes hierarchical heading numbers, sets data-heading-number
      extensions/Section.ts          — custom Document (content: 'section+') + Section node (content: 'block+', columns/locked attrs) + ColumnBlock/Column nodes (locked-columns layout); commands setSectionColumns / insertSectionBreak / toggleSectionLocked
      extensions/DuplicateLine.ts    — Alt+Shift+↓: duplicateLineDown copies the current line (textblock, or its whole list item) or the selected lines below
      extensions/Timeline.ts         — the `\timeline` note block: Timeline (variant attr) / TimelineItem / TimelineWhen nodes, insertTimeline, and TimelineBehaviour (Enter/Backspace/Delete, placeholders, current-entry dot, "+ Add entry" widget) — see "Note blocks"
      extensions/timelineMenu.ts     — the timeline's right-click provider (Style ▸ / Order ▸)
      noteClipboardText.ts           — what a copy puts on the clipboard as plain text (editorProps.clipboardTextSerializer): Markdown-style headings, lists, quotes, tables as tab-separated rows
      extensions/HeadingLevel.ts     — Ctrl+= / Ctrl+− on a heading change its level (else App.tsx zooms)
      extensions/HeadingFold.ts      — collapsing headings (the `collapsed` attribute, the margin arrow, Ctrl+., hidden text opens when the cursor reaches it); headingMenu.ts its right-click items
      StickyHeadings.tsx             — the sticky heading trail at the top of a scrolling note (its A− / A+ and right-click)
      headingTrail.ts                — where the reader is in the outline (shared by the sticky trail and the Contents highlight)
      extensions/NoteBylines.ts      — Subtitle (Ctrl+H, S) and Author (Ctrl+H, A) paragraph styles: own nodes like NoteTitle, never numbered or in the outline
      extensions/fontSize.ts         — the font-size ladder (FONT_SIZES), currentFontSize / setFontSize / stepFontSize (Ctrl+Shift+< / >, the ribbon's A− [size] A+)
      extensions/Quote.ts            — the `\quote` note block: QuoteBlock (variant, hidden), QuoteText, QuoteField (QUOTE_FIELDS), insertQuote / quoteFromSelection, setQuoteVariant / toggleQuoteField, keys and the pill; quoteMenu.ts is its right-click provider
      extensions/Cycle.ts            — the `\cycle` note block (at least two stages, each owning the arrow to the next; arrows' direction and name; icons/pictures; designs Ring / Flow / Steps); cycleMenu.ts is its right-click provider
      extensions/Breakdown.ts        — the `\breakdown` note block (a whole and at least two parts; designs Hub / Pillars / Tree; spectrum colours); breakdownMenu.ts is its right-click provider
      extensions/Conclusion.ts       — the `\conclusion` note block (reasons that lead to it, then the conclusion; designs Arrow / Brace / Therefore / Total line / Funnel); conclusionMenu.ts is its right-click provider
      extensions/Types.ts            — the `\types` note block (a category and its kinds, each with an icon slot; designs Field guide / Umbrella / "Is a" / Compact); typesMenu.ts is its right-click provider
      extensions/IdKey.ts            — the `\key` identification key (numbered steps of choices, each leading to an answer or another step; designs Couplets / Question cards); idKeyMenu.ts is its right-click provider
      extensions/ProsCons.ts         — the `\proscons` note block (a subject, weighted pros and cons, a verdict; designs T-chart / Scales / Ledger) and the points lists the options block shares; prosConsMenu.ts its right-click provider
      extensions/Argument.ts         — the argument note block (a claim, evidence for and/or against on the pros and cons lists, optional parts; designs Card / Tree / Debate); argumentMenu.ts its right-click provider
      extensions/MarginColumn.ts     — THE margin column beside a note: registerMarginSource, marginItems, refreshMarginColumns; Important, ConceptRef, GlossaryChip and UnsureFlag register sources
      extensions/UnsureFlag.ts       — the Unsure flag mark, its icon after the passage, the (?) offer, Turn into a question; unsureMenu.ts its right-click providers; objects/unsureTrigger.ts the menu entry
      extensions/Options.ts          — the `\options` note block (a goal and its options, each with status, score and pros/cons; designs Fork / Side by side / Ranked / Tiles / Either-or); optionsMenu.ts its right-click provider
      extensions/designCycle.ts      — Ctrl+] / Ctrl+[ for every block's designs; BLOCK_DESIGN_LISTS is THE map of each block's designs
      noteColorMenu.ts               — a note's colour: setNoteColor, and the Note colour ▸ submenu on a note row's and the editor's right-click
      notePdf.ts                     — Export as PDF: copies the open note into a print-only layer and opens the print dialog; Note ▾ and right-click entries
      extensions/DictionaryWords.ts  — marks Dictionary words in a note (italic on a faint shade) and shows their meaning on hover
      blockNodes.ts                  — THE lists of note blocks, their parts and what can be linked (plain data)
      extensions/blockIcons.ts       — THE icon slot for a block's part (emoji or a square picture): the cycle's stages and the types
      extensions/Hierarchy.ts        — the `\hierarchy` note block (`\tree`, `\taxonomy`): items stored flat with a level, written as an outline (Enter, Tab / Shift+Tab move an item and its children a level); level names (`tiers`) beside the rows or over the columns; designs Tree / Columns / Outline. hierarchyLayout.ts reads the tree (spans, siblings) purely; hierarchyMenu.ts is its right-click provider
      extensions/Chart.ts            — the `\chart` note block: one atom node (`variant` = chart type, `spec` = a ChartSpec) whose view is the block's pill around the shared ChartWidget (src/charts/); chartMenu.ts is its right-click provider
      extensions/Pyramid.ts          — the `\pyramid` note block (`\funnel`, `\maslow`): at least two layers, top first, each a label drawn on its shape and a note beside it; designs Pyramid / Funnel / Stacked; pyramidMenu.ts is its right-click provider
      extensions/CodeBlock.ts        — the `\code` note block (and ```): the codeBlock node with a language picker, lowlight colouring (lazy-loaded), Copy, designs Plain / Line numbers / Terminal; codeMenu.ts is its right-click provider
      extensions/Maths.ts            — the `\maths` note block (mathBlock; designs Centred / Left / Numbered) and inline maths (mathInline): a MathLive field (lazy-loaded) storing LaTeX; mathsMenu.ts is its right-click provider
      extensions/Hub.ts              — the `\hub` note block (hub, hubTitle, hubTake, hubLink, and the hubRef mark on a linked passage, with its marker); designs List / Compact; hubMenu.ts is its right-click provider (and Add to hub… on selected text)
      extensions/Inbox.ts            — the `\inbox` note block (inbox, inboxTitle, inboxItem, and the movedStub marker a sent passage leaves); keys, designs List / Cards / Board, order; inboxMenu.ts is its right-click provider (and Send to inbox… on selected text)
      extensions/SpecialCharInput.ts — `//name` → a character in the note editor (the same table, list and keys as fieldInput.ts, through ProseMirror; not in code)
      extensions/OccurrenceHighlight.ts — selecting a word or phrase faintly marks its other mentions in the tab (whole words when the selection is whole words); decorations only
      extensions/GlossaryAutolink.ts — offers to link a Glossary term as it's typed (once per note per term); Enter/Tab, Backspace undoes
      extensions/GlossaryCard.ts — the Glossary card block (`\definition`, `\acronym`, `\concept`): a node pointing at a record by entryId; designs Card / Compact; GlossaryCardBody.tsx draws and edits the record by field kind; glossaryCardMenu.ts (design, frame, "Show as a card" on marked text and on a chip)
      extensions/GlossaryChip.ts — the Glossary record inside a line (the card's Inline design): a chip pointing at the record; its card opens below on a click; cardToChip / chipToCard
      extensions/ListItem.ts — the list item, allowed to start with a block
      objects/blockCategories.ts — THE categories of note block (card, structure, weighing, visual, container): placement and the `\` menu's groups
      extensions/NoteLink.ts — links between notes (`noteLink` mark: `[[`, `\ref`, Link to a note…), click to open, hover card; noteLinkMenu.ts (right-click for links and embeds); NoteLink.module.css
      extensions/NoteEmbed.ts — `\embed`: a passage from another note shown live (designs Quote / Card / Plain)
      extensions/BlockIds.ts — the lasting `blockId` on paragraphs and headings that links and embeds point at
      NoteLinkPicker.tsx — the note picker, then which passage (for links and embeds)
      NoteLinksFrom.tsx — the note's foot: notes linking here, unlinked mentions
      objects/noteRefTrigger.ts, objects/embedBlock.ts — the `\ref` and `\embed` keywords
      extensions/Question.ts, Compare.ts, Diagram.ts — the question, comparison and diagram blocks (their menus: questionMenu.ts, compareMenu.ts, diagramMenu.ts)
      extensions/typingOffer.ts — THE "offer as you type" chip (typingOfferPlugin): Enter/Tab accept, Esc or typing on passes over, Backspace undoes; used by GlossaryAutolink, AcronymOffer and BlockOffers
      extensions/TrailingLine.ts — always an empty line after a block that ends a section or column
      extensions/AcronymOffer.ts — offers to record "Long form (ABC)" as an acronym as it's typed
      extensions/BlockOffers.ts — offers a quote, a types block or pros and cons as matching writing is typed (rules in utils/blockOffers.ts)
      extensions/blockDesigns.ts     — Block designs, the shared half: BlockDesign, blockPill, designButtons, designMenuItem, pillButton, openBlockPopover, selectBlock / deleteBlock / selectButton, frames (blockFrameAttributes, setBlockFrame, openFrameOptions, applyFrameAttrs, the frame-fit plugin) (+ BlockDesigns.module.css for the popovers)
      extensions/blockPicks.ts       — Ctrl+click picks parts of a block (BLOCK_PART_NODES), Delete / copy / cut them together; Ctrl+Alt+click selects the whole block
      NoteBackdrop.tsx               — the room below the end of a note (the note's own backdrop, else its notebook's, else the app-wide one: utils/noteBackdrop.ts), its picker (apply to this note / its notebook / all notes; the picture library) and BackdropField for the note and notebook edit modals
      extensions/ConceptRef.ts       — ConceptRefMark (text linked to a Glossary term) + ConceptMargin (the brace and label beside it, hover card, click to the definition) — see "Annotations"
      extensions/Importance.ts       — Important's levels, passages, Review later scheduling and the margin markers; importanceLevels.ts holds the three levels
      extensions/annotationMenu.ts   — right-click on linked text (go to definition, unlink) and on Important text (level, review, remove)
      extensions/ArtifactLinkMark.ts — Mark (targetType/targetId/display attrs) marking a span of note text as linked to a cross-app entity made from it, via FloatingToolbar's "Create ▸" menu (Ctrl+Q) or `\`; only data — drawn by objects/artifactGroups.ts; see "Cross-app linking" in Implemented features
      objects/               — inline objects (`\`) and link rendering (see "Inline objects in notes"): kinds.ts (NOTE_OBJECT_KINDS — THE registry; matchPickable/chosenKind across objects and blocks), blockKinds.ts (NOTE_BLOCK_KINDS — the note-block registry) + timelineBlock.ts, types.ts (NoteObjectKind, NoteBlockKind, PickableKind), reminderKind.ts, session.ts (the `\` session, derived from the text), actions.ts (accept/commit/unlink/insertObjectTrigger), NoteObjectTrigger.ts (the extension + keys), NoteObjectMenu.tsx, artifactTypes.ts (ARTIFACT_TYPES: live summary per linked type), artifactGroups.ts (ArtifactLinkGroups: the pane per link, states, the expanded box and body widget, Home/End, the stored-mark guard), eventKind.ts, deadlineKind.ts + reminderKind.ts (both from datedKindFactory.ts), ArtifactBody.tsx + WhenLine.tsx + ObjectBody.tsx + CalendarItemBody.tsx + EventBody.tsx + NotifyChips.tsx (the expanded body), flags.ts (ArtifactFlag, calendarFlags, flagMenuItems), calendarItems.ts, whenInput.ts (readWhenInput, expandShortWeekdays, the defaults), contextMenu.ts (right-click on a link), format.ts
      extensions/NoteTagMark.ts      — Mark (tagId/color/typeKey/structuredEntryId attrs) for annotation tags; structuredEntryId links a tagged passage to its StructuredTagEntry (see "Structured tag entries")
      contextMenu.ts         — the editor's right-click providers (clipboard, link/create, Style ▸, select all) on the `note-editor` scope; NoteEditorMenuApi is what NoteEditor hands them
      builtinTags.ts         — 8 built-in annotation tag definitions (Important/Concept/Definition/Example/Question/Reference/Learn Later/Acronym) — typeKey drives both Learn Later's future create-task action and Acronym's structured-tag-entry behaviour
      NoteBacklinks.tsx      — the "Linked from" bar under a note's title: single pill / "🔗 N" chip + list, each pill openable, draggable into the text, or insertable at the cursor (derived from other items' crossAppRefs via store/noteBacklinks.ts — nothing stored); artifactLinkInsert.ts holds the insert/drop helpers
    NoteEditorPane/          — slide-in pane wrapping NoteEditor for non-Notes sections
    NoteSplitView/           — notes side by side: NoteSplitView (the panes in a grid, the shared ribbon, empty panes' "Choose a note…"), NoteViewMenu (the ribbon's View ▾), openBeside ("Open beside" on a note row)
    AddNoteModal/            — quick-add note (Ctrl+Space) with hierarchical tag picker
    ContextMenu/             — ContextMenuHost (THE contextmenu listener, mounted once in App.tsx) + ContextMenu (the menu: sections, submenus, keyboard); content comes from src/contextMenu/
    CreateKindSwitcher/      — the Note / Notebook / Tag (…) strip at the top of a creation pane; kinds from config/createKinds.ts
    AddNoteTagModal/         — create notebook (area) or custom annotation tag; a notebook's "Inside" picker (starts at where it was opened from, can move anywhere in the tree or to the top level)
    EditNoteTagModal/        — edit notebook/tag name, icon, color; field schema editor for annotation tags
    EditNoteMetaModal/       — edit note metadata: tagIds (notebooks + annotation tags), accent color, pinned
    NoteTagPresetModal/      — install curated annotation tag packs; detects already-installed via presetKey
    ChronicleView/           — Notes section layout: notebook tree, note list, editor; hover-expand on notebooks; NotebookLocationView is the editor column's empty state (path/tree of where you are)
    NoteViews/               — Notes views built on the browse model (CLAUDE.md "Notes views"; no store imports): shared ViewBar, ViewFilter, NoteLevel, gridFocus.ts; Mosaic/ (MosaicView: tiles one level at a time; MosaicTile with its hover peek; MosaicNoteCard; mosaicLayout.ts tile sizes and peek sections); Map/ (see components/NoteViews/Map/ below)
    NotesSection/            — Notes section wrapper (NotesViewSwitcher.tsx: the header's view switcher and its Tab hotkey), rendering the view or tool in uiStore.notesView through noteViewComponents.ts (CLAUDE.md "Notes views"); GlossaryView.tsx (the Glossary) and ReviewView.tsx (Review later), both opened from TagFAB's # panel
    ListsSection/            — Lists section: sidebar (Checklists/Watchlists/Reference dividers) + card grid (watchlist), table (reference) or ChecklistView.tsx (checklist — tick-off, checked items struck through and moved to the bottom via listStore.toggleListItemChecked) + tab bar
    AddListModal/            — two-step create/edit list (type picker grouped by kind → form with field schema editor + tabs editor)
    AddListItemModal/        — add/edit list item (tab picker, status picker for watchlists, dynamic fields, notes, links)
    FitnessSection/          — Fitness app: activity list (type icon, title, date, distance, moving time, avg speed) + empty state
    AddActivityModal/        — create/edit Activity: top-3-usage type pills + "More…" dropdown of all types + Customise (⚙), title, date, distance, moving time h/m → avg speed computed live, selected type's custom fields, notes, purpose chips; Escape-safe from the start
    EditActivityTypeModal/   — create/edit an ActivityType: name, icon, color, field-schema editor (mirrors EditTrackerPane); built-ins editable but not deletable
  supabase/migrations/       — SQL migration files (run in order)
```
