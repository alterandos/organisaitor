# uiStore — key state and actions

<!-- Moved out of CLAUDE.md on 2026-10-09 (audit: CLAUDE.md is read every session, this is reference). Read it only when the task needs it. -->

```typescript
// Active section (pending rename: activeView→activeSection, AppView→AppSection, setActiveView→setActiveSection)
activeView: AppView               // 'tasks' | 'calendar' | 'records'  — persisted
setActiveView(view, opts?: { mode?: 'push' | 'back' | 'forward' })  // mode defaults to 'push'

// The ONE back/forward history (store/navHistory.ts) — Alt+Left/Backspace, Alt+Right, the
// Android back button and the Alt+N history browser all walk it. A stop is a *place* (NavPlace):
// a section plus where you were in it. What counts as a stop (the user, 2026-10-07): Notes, every
// note (with its tab and notebook); Tasks / Lists, one per visit, back to the open task / list;
// Calendar, one per visit, back to the period and view; Records, its tracker/routine; Overview,
// its selection. Browser semantics: a normal navigation pushes where you're leaving and clears
// the forward stack. Both persisted; capped at MAX_NAV_HISTORY (40). Replaced sectionHistory and
// notesHistory (uiStore v3).
navHistory: NavPlace[], navForward: NavPlace[]   // most-recent-first
setActiveView(view, { mode: 'silent' })          // history's own moves; everything else pushes
openNote(id, tabId?, { mode: 'silent' })         // in Notes, the note being left is a stop
navigateBack(): boolean, navigateForward()        // navigateBack reports whether it moved (Android minimises when it didn't)
travelHistory(steps): boolean                     // several stops at once (the history browser); stops in between stay
currentPlace(): NavPlace
historyBrowserOpen, openHistoryBrowser(), closeHistoryBrowser()
// A new section with its own "where was I" (a selected item, a period) adds it to NavPlace,
// capturePlace and goToPlace (bottom of uiStore.ts), and a case in describePlace
// (components/HistoryBrowser/) — or it is one stop that just reopens the section.

// Endeavour focus filter (CollectionFilterPicker, header) — keyed per section so each
// of Tasks/Calendar/Records/Notes remembers its own focused Endeavour independently;
// switching sections and back preserves it. Lists/Portfolio never populate an entry
// (picker isn't shown there). Default per section is null ("All Endeavours").
activeCollectionIdByView: Partial<Record<AppView, string | null>>
setActiveCollection(id)           // writes to activeCollectionIdByView[current activeView]
selectActiveCollectionId(state)   // plain selector fn (not a hook) — reads the current section's value; use as useUIStore(selectActiveCollectionId)
endeavourPickerOpen: boolean      // CollectionFilterPicker dropdown open state (E / Ctrl+E)
openEndeavourPicker(), closeEndeavourPicker(), toggleEndeavourPicker()

// Purpose filter (PurposeFilterPicker, header, Tasks section only) — multi-select;
// reuses the pre-existing activePurposeIds/togglePurposeFilter (unchanged). Open state:
purposePickerOpen: boolean        // P / Ctrl+P
openPurposePicker(), closePurposePicker(), togglePurposePicker()

// Both picker open-states are force-closed on any setActiveView() call, so switching
// sections never leaves one stuck open in the background.

// Manage view (library administration — Endeavours/Purposes/Tags), opened by clicking
// (not hovering) the header hamburger button. Left-nav tabs, extensible — see ManageSection.
manageOpen: boolean
manageSection: ManageSection      // 'endeavours' | 'purposes' | 'tags'
openManage(section?), closeManage(), setManageSection(section)

// Modals (openModal: ModalType)
// ModalType = 'add-task'|'add-collection'|'add-purpose'|'add-tag'|
//             'add-calendar-item'|'add-tracker'|'add-entry'|'add-routine'|null
showAddTask(), showAddSubtask(parentId?), showAddCollection()
showAddPurpose(), showAddTag()
showAddCalendarItem(date?, kind?)
showAddTracker(), showAddEntry(trackerId), showAddRoutine()
closeModal()

// Task pane
openTaskPane(id), closeTaskPane()
editingTaskId: string | null
tasksLastEditingTaskId: string | null   // last-open pane, restored on returning to Tasks (no TTL — see uiStore's own comment for why not)

// TaskList expand/collapse — lifted out of TaskList's own local state so it survives
// navigating away (TaskList unmounts on every section switch) and back. Memory-only (not
// persisted) — resets on reload, same scope as sortField/sortDir.
taskExpandedIds: string[]
toggleTaskExpanded(taskId), clearTaskExpanded()  // setTaskViewMode() also clears it itself

// Settings / account / integrations (slide-in panes)
settingsOpen, openSettings(), closeSettings()
accountOpen, openAccount(), closeAccount()
integrationsOpen, openIntegrations(), closeIntegrations()

// Edit panes (slide-in from right)
editTrackerOpen, editingTrackerId, openEditTracker(id), closeEditTracker()
editingEntryId, openEditEntry(id), closeEditEntry()
editingCalendarEventId, openCalendarEventPane(id), closeCalendarEventPane()
editingCalendarReminderId, openCalendarReminderPane(id), closeCalendarReminderPane()

// Calendar last-edited memory — persisted; restores whichever event/reminder pane was open
// when Calendar was last left, on returning to Calendar (any path — section click, hotkey, or
// Alt+Left/Right), but only within CALENDAR_LAST_EDITING_TTL_MS (30 min, checked at read time
// in setActiveView — no background timer). Not cleared when the pane is closed while still in
// Calendar — "last edited," not "currently open."
calendarLastEditing: { type: 'event' | 'reminder'; id: string; at: string } | null

// Which date/period Calendar is showing — lifted out of CalendarView's own local state
// (2026-09-25) so it survives leaving/re-entering the section, same reasoning as
// calendarLastEditing above but unconditional (no TTL — this is just "where were you
// looking," not reopening an edit UI). Month view reads year/month; week/day read
// calendarSelectedDate. calendarViewMode (month/week/day) was already lifted earlier.
calendarYear: number, calendarMonth: number /* 0-indexed */, calendarSelectedDate: string /* YYYY-MM-DD */
setCalendarYear(v), setCalendarMonth(v)   // v: number | ((prev: number) => number), same overload as React's setState
setCalendarSelectedDate(v: string)

// Notes: which notebooks are expanded in the Chronicle tree (persisted since v4, so the tree
// reopens as it was left; ids of deleted notebooks are harmless and ignored)
expandedNoteTagIds: NoteTagId[], toggleNoteTagExpanded(id)

// Android: what Notes opens on with no note open (MobileNotes) — persisted since v5
mobileNotesHome: 'notebooks' | 'recent', setMobileNotesHome(home)

// Notes: which column has keyboard focus (ChronicleView's arrow-key navigation), back to 'tree'
// on entering Notes; decides what N/Space creates. Memory-only.
notesFocusedColumn: 'tree' | 'list' | 'editor', setNotesFocusedColumn(col)

// Text carried from one creation pane to the next when CreateKindSwitcher switches kind.
// Cleared by closeModal.
createDraft: string | null, setCreateDraft(draft)

// Notes: a passage to select once a note is open (services/notePassage.ts sets it with openNote;
// NoteEditor consumes it), and the Glossary / Review views in place of the tree (memory-only).
requestedNotePassage: { noteId, mark, attr, value } | null, setRequestedNotePassage(p)
notesGlossaryOpen, openNotesGlossary(), closeNotesGlossary()
notesReviewOpen, openNotesReview(), closeNotesReview()

// Records
activeTrackerId: string | null
setActiveTracker(id)
pendingTrackerId: string | null  // passed to AddEntryModal
```

