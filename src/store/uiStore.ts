import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tag, Purpose, Collection, CalendarItemKind, TaskViewMode, NoteTagId, ScheduleTemplate, Priority, CrossAppRefType } from '@/types';
import type { Activity } from '@/types/fitness';
import { useRecentItemsStore } from '@/store/recentItemsStore';
import { useNoteStore } from '@/store/noteStore';
import { persistStorage } from '@/utils/persistStorage';
import { todayIso } from '@/utils/date';
import { getNotePrimaryNotebookId } from '@/utils/notes';
import type { NoteId } from '@/types/notes';
import type { PassageMark } from '@/utils/noteContent';
import { type NavPlace, pushPlace, travel } from '@/store/navHistory';

export type AppView = 'overview' | 'tasks' | 'calendar' | 'records' | 'lists' | 'portfolio' | 'notes' | 'fitness';
// Notes' three columns (ChronicleView). Which one has keyboard focus decides what N/Space creates.
export type NotesColumn = 'tree' | 'list' | 'editor';

// What the Overview section is showing: an Endeavour's automatic Overview, or a saved one.
export type OverviewSelection = { kind: 'endeavour' | 'saved'; id: string } | null;

export type CalendarViewMode = 'month' | 'week' | 'day';

// Fields the Notes "Create ▸ Calendar item" flow pre-fills in AddCalendarItemModal beyond the
// date/kind/time/title already carried by showAddCalendarItem's own params.
export interface CalendarItemPrefillExtra {
  endTime?:      string | null;
  notes?:        string | null;
  location?:     string | null;
  collectionId?: string | null;
  // Inferred from a note selection (inferCalendarItemFromSelection) — shown, not silently applied.
  eventType?:    'default' | 'birthday' | 'travel';
  tentative?:    boolean;
  important?:    boolean;
  repeat?:       { freq: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number } | null;
}

// A Notes text range waiting for the item it was turned into (see pendingArtifactLink).
export interface PendingArtifactLink {
  noteId:            string;
  from:              number;
  to:                number;
  targetType:        CrossAppRefType;
  tabId?:            string;
  replaceWithTitle?: boolean;
  resolvedTargetId?: string;
}

// Back/forward history: see store/navHistory.ts (what a stop is) and recordPlace/goToPlace below.

// notesTabMemory hygiene cap — same shape as recentItemsStore's MAX_ENTRIES/TRIM_TO: nothing
// ever removes an entry when its note is deleted, so trimming down on write when the map gets
// too large keeps it bounded. No per-entry timestamp here (unlike recentItemsStore), so the
// trim just drops arbitrary entries via insertion order rather than true least-recently-used —
// fine for a hygiene cap this generous.
const MAX_NOTE_TAB_MEMORY = 500;
const NOTE_TAB_MEMORY_TRIM_TO = 400;

// How long calendarLastEditing stays eligible to auto-reopen when returning to Calendar.
export const CALENDAR_LAST_EDITING_TTL_MS = 30 * 60_000;

// A notebook's tree row only renders if every ancestor above it is expanded (ChronicleView
// only maps a node's children when `isExpanded`) — so jumping straight to a note whose
// notebook is nested under a currently-collapsed parent would set selectedNoteTagId correctly
// but leave that row invisible, looking just as "stuck" as not updating the selection at all.
// Walks up from the notebook's PARENT (the notebook's own row doesn't need to be expanded,
// only found) adding any collapsed ancestor.
function expandNotebookAncestors(
  expandedNoteTagIds: NoteTagId[],
  notebookId: string,
  noteTags: Record<string, { parentTagId: string | null }>,
): NoteTagId[] {
  const toAdd: NoteTagId[] = [];
  let curr = noteTags[notebookId]?.parentTagId ?? null;
  while (curr && !expandedNoteTagIds.includes(curr as NoteTagId) && !toAdd.includes(curr as NoteTagId)) {
    toAdd.push(curr as NoteTagId);
    curr = noteTags[curr]?.parentTagId ?? null;
  }
  return toAdd.length > 0 ? [...expandedNoteTagIds, ...toAdd] : expandedNoteTagIds;
}

// Manage view (library administration) — left-nav tabs, extensible for future sections.
export type ManageSection = 'endeavours' | 'purposes' | 'tags';

export type ModalType =
  | 'add-task'
  | 'add-collection'
  | 'add-purpose'
  | 'add-tag'
  | 'add-calendar-item'
  | 'add-tracker'
  | 'add-entry'
  | 'add-routine'
  | 'add-watchlist-item'
  | 'add-portfolio-tag'
  | 'add-investment-purpose'
  | 'bulk-upload-watchlist'
  | 'add-list'
  | 'add-overview'
  | 'add-list-item'
  | 'add-note'
  | 'add-note-tag'
  | 'note-tag-presets'
  | 'edit-note-meta'
  | 'add-activity'
  | 'add-schedule'
  | null;

export type SortField = 'createdAt' | 'deadline' | 'collection' | 'priority';
export type SortDir   = 'asc' | 'desc';

const DEFAULT_SORT_DIR: Record<SortField, SortDir> = {
  createdAt:  'desc',
  deadline:   'desc',
  priority:   'desc',
  collection: 'asc',
};

interface UIState {
  openModal:          ModalType;
  // Keyed by section (AppView) so each section (Tasks/Calendar/Records/Notes) remembers
  // its own focused Endeavour independently — switching sections and back preserves it.
  activeCollectionIdByView: Partial<Record<AppView, string | null>>;
  endeavourPickerOpen:      boolean;
  purposePickerOpen:        boolean;
  manageOpen:               boolean;
  manageSection:            ManageSection;
  editingTaskId:      string | null;
  // Same "remember on leave, restore fresh on entry" shape as notesLastEditingNoteId —
  // returning to Tasks (any path: nav click/hotkey, or Alt+Left/Right) reopens whichever
  // task's pane was last open. No TTL (unlike Calendar's equivalent) — a task pane reopening
  // doesn't carry the same "surprising unprompted action" risk an event/reminder pane does.
  tasksLastEditingTaskId: string | null;
  sidebarOpen:        boolean;
  activePurposeIds:   string[];
  activeTagIds:       string[];
  editingTag:         Tag        | null;
  editingPurpose:     Purpose    | null;
  editingCollection:  Collection | null;
  editingActivity:    Activity   | null;
  editingSchedule:    ScheduleTemplate | null;

  showAddTask:       () => void;
  showAddSubtask:    (parentId?: string) => void;
  // New task as a follow-up of `originTaskId` (task links): AddTaskModal seeds Endeavour/tags/
  // purposes from it the way it does from a parent, and links the new task `followUpOf` it.
  showAddFollowUp:   (originTaskId: string) => void;
  pendingFollowUpOf: string | null;
  // MobileQuickAddBar's "More options…" escape hatch (docs/android/01-tasks-app.md §3.2), and
  // the Notes "Create ▸ Task" flow (FloatingToolbar) — both open the full AddTaskModal
  // pre-filled rather than duplicating its fields in a bespoke form.
  quickAddPrefill: {
    title: string; priority: Priority; collectionId: string | null;
    deadline: string | null; deadlineTime?: string | null; links?: string[];
  } | null;
  showAddTaskWithPrefill: (prefill: {
    title: string; priority: Priority; collectionId: string | null;
    deadline: string | null; deadlineTime?: string | null; links?: string[];
  }) => void;

  // Notes "Create ▸ ..." flow (FloatingToolbar's Ctrl+Q / "+" menu): a selection was turned
  // into a request to create some other entity (Task today), and the mark that should point
  // at it can't be applied until that entity actually exists. `noteId`/`from`/`to` are
  // captured at the moment of creation-request; `resolvedTargetId` is filled in by the
  // creating modal (e.g. AddTaskModal) once the new entity's id is known, which NoteEditor
  // watches for to apply the ArtifactLinkMark and then clears this field itself. Only one
  // pending link at a time — matches there only ever being one create modal open at once.
  // tabId: the note tab the selection was in (see CrossAppRef.tabId), carried into the reverse link.
  // replaceWithTitle (a `\` object): once created, the text from..to (possibly empty) becomes the
  // item's final title, so the note reads as the item does. Ctrl+Q links the selection as it is.
  pendingArtifactLink: PendingArtifactLink | null;
  setPendingArtifactLink:   (link: Omit<PendingArtifactLink, 'resolvedTargetId'>) => void;
  // targetType overrides the pending link's type when what actually got created differs from what
  // was requested — e.g. the Calendar-item modal lets the user flip Event/Reminder after opening.
  resolveArtifactLink:      (targetId: string, targetType?: CrossAppRefType) => void;
  clearPendingArtifactLink: () => void;
  showAddCollection: () => void;
  taskModalAdvanced: boolean;
  pendingParentId:   string | null;
  showAddPurpose:    () => void;
  showAddTag:        () => void;
  showAddActivity:   () => void;
  openEditActivity:  (activity: Activity) => void;
  closeEditActivity: () => void;
  closeModal:        () => void;
  // What was typed in a creation pane when the user switched it to another kind (CreateKindSwitcher):
  // the next creation pane starts with it as its name/title. Cleared by closeModal.
  createDraft:       string | null;
  setCreateDraft:    (draft: string | null) => void;

  // Activity type customisation (slide-in pane, mirrors EditTrackerPane)
  editActivityTypeOpen:   boolean;
  editingActivityTypeId:  string | null;   // null = create mode
  showAddActivityType:    () => void;
  openEditActivityType:   (id: string) => void;
  closeEditActivityType:  () => void;

  // Schedules (recurring weekly timetables, e.g. a uni/gym schedule) — CalendarSidePane
  // (which also shows the calendar layer toggles) + AddScheduleModal for create/edit.
  // Field names kept as `schedulesOpen`/`openSchedules`/`closeSchedules` even though the
  // pane now shows Layers too, to avoid an unnecessary rename churn across every call site.
  schedulesOpen:     boolean;
  openSchedules:     () => void;
  closeSchedules:    () => void;
  toggleSchedules:   () => void;
  showAddSchedule:   () => void;
  openEditSchedule:  (schedule: ScheduleTemplate) => void;
  closeEditSchedule: () => void;

  setActiveCollection:    (id: string | null) => void;
  closeEndeavourPicker:   () => void;
  toggleEndeavourPicker:  () => void;
  closePurposePicker:     () => void;
  togglePurposePicker:    () => void;
  openManage:             (section?: ManageSection) => void;
  closeManage:            () => void;
  toggleManage:           () => void;
  setManageSection:       (section: ManageSection) => void;
  openTaskPane:         (id: string) => void;
  closeTaskPane:        () => void;
  openSidebar:          () => void;
  closeSidebar:         () => void;
  togglePurposeFilter:  (id: string) => void;
  toggleTagFilter:      (id: string) => void;
  openEditTag:          (tag: Tag) => void;
  closeEditTag:         () => void;
  openEditPurpose:      (purpose: Purpose) => void;
  closeEditPurpose:     () => void;
  openEditCollection:   (collection: Collection) => void;
  closeEditCollection:  () => void;

  settingsOpen:  boolean;
  openSettings:  () => void;
  closeSettings: () => void;

  accountOpen:  boolean;
  openAccount:  () => void;
  closeAccount: () => void;

  integrationsOpen:  boolean;
  openIntegrations:  () => void;
  closeIntegrations: () => void;

  // Recycling Bin (Ctrl+Shift+R, or from Account) — see src/components/RecyclingBinPane/.
  recyclingBinOpen:  boolean;
  openRecyclingBin:  () => void;
  closeRecyclingBin: () => void;

  sortField:    SortField;
  sortDir:      SortDir;
  setSortField: (f: SortField, dir?: SortDir) => void;
  setSortDir:   (d: SortDir) => void;

  activeView:    AppView;
  // mode 'silent': switch without recording a history stop (history's own moves).
  setActiveView: (view: AppView, opts?: { mode?: 'push' | 'silent' }) => void;

  // The one back/forward history (store/navHistory.ts): stops most-recent-first. Alt+Left /
  // Backspace / the Android back button go back, Alt+Right forward, and the Alt+N history browser
  // jumps several stops at once (travelHistory). navigateBack reports whether it moved, so the
  // Android back button knows when to minimise instead.
  navHistory:        NavPlace[];
  navForward:        NavPlace[];
  navigateBack:      () => boolean;
  navigateForward:   () => void;
  travelHistory:     (steps: number) => boolean;
  currentPlace:      () => NavPlace;
  historyBrowserOpen: boolean;
  openHistoryBrowser:  () => void;
  closeHistoryBrowser: () => void;

  taskViewMode:    TaskViewMode;
  setTaskViewMode: (mode: TaskViewMode) => void;

  // Which tasks are expanded/collapsed in TaskList — lifted out of TaskList's own local
  // state so it survives navigating away (TaskList unmounts on every section switch) and
  // back, per the request that expanded tasks stay expanded. Meaning is inverted in
  // 'focused' mode (see TaskList.isExpanded) same as before the lift.
  taskExpandedIds:    string[];
  toggleTaskExpanded: (taskId: string) => void;
  clearTaskExpanded:  () => void;

  editingCalendarEventId:    string | null;
  editingCalendarReminderId: string | null;
  editingCalendarDeadlineId: string | null;
  // The occurrence date (YYYY-MM-DD) that was clicked, for a repeating item — lets the pane offer
  // "this occurrence only / this and following / all" (RecurrenceScopeBar). null when opened
  // from somewhere with no specific occurrence in mind.
  editingCalendarEventOccurrence:    string | null;
  editingCalendarReminderOccurrence: string | null;
  editingCalendarDeadlineOccurrence: string | null;
  openCalendarEventPane:     (id: string, occurrenceDate?: string) => void;
  closeCalendarEventPane:    () => void;
  openCalendarReminderPane:  (id: string, occurrenceDate?: string) => void;
  closeCalendarReminderPane: () => void;
  openCalendarDeadlinePane:  (id: string, occurrenceDate?: string) => void;
  closeCalendarDeadlinePane: () => void;

  // Remembers the last event/reminder/deadline pane open in Calendar (same "last X" pattern as
  // notesLastEditingNoteId) so leaving the section and coming back — including via
  // Alt+Left/Right — reopens it, but only within CALENDAR_LAST_EDITING_TTL_MS: a memory
  // that's gone stale (you came back an hour later, having long since moved on) should NOT
  // reopen a pane out of nowhere. Freshness is checked where it's read (setActiveView), not
  // by a background timer — there's no proactive-expiry mechanism in uiStore to hook into.
  calendarLastEditing: { type: 'event' | 'reminder' | 'deadline'; id: string; at: string } | null;

  // Which of Month/Week/Day CalendarView is showing — lifted out of CalendarView's own
  // local state so it survives switching to another app and back (CalendarView unmounts
  // on section switch, same reason notesLastEditingNoteId exists for Notes).
  calendarViewMode:    CalendarViewMode;
  setCalendarViewMode: (mode: CalendarViewMode) => void;

  // Which date/period Calendar is showing — same "lifted so it survives unmount" reasoning
  // as calendarViewMode above, added 2026-09-25 so returning to Calendar (any path) lands back
  // on the same month/week/day, not reset to today. Month view reads year/month; week/day
  // read calendarSelectedDate — same split CalendarView.tsx's own "Go to date" already used
  // internally, now just persisted instead of local state. Unconditional (no TTL, unlike
  // calendarLastEditing below) — restoring where you were looking isn't the same kind of
  // "surprising unprompted action" reopening an edit pane out of nowhere would be.
  calendarYear:  number;
  calendarMonth: number;  // 0-indexed
  calendarSelectedDate: string; // YYYY-MM-DD
  setCalendarYear:  (value: number | ((prev: number) => number)) => void;
  setCalendarMonth: (value: number | ((prev: number) => number)) => void;
  setCalendarSelectedDate: (value: string) => void;

  // Calendar layer-visibility dropdown (checkboxes; the underlying filter values live in
  // settingsStore, persisted — this is only the panel's transient open/closed state).

  calendarItemDate:  string | null;
  calendarItemKind:  CalendarItemKind | null;
  calendarItemTime:  string | null;
  calendarItemTitle: string | null;
  // Extra fields the Notes "Create ▸ Calendar item" flow pre-fills beyond the four above.
  calendarItemExtra: CalendarItemPrefillExtra | null;
  showAddCalendarItem: (date?: string, kind?: CalendarItemKind, time?: string, title?: string, extra?: CalendarItemPrefillExtra) => void;

  // Android quick-add sheet for calendar events/reminders (docs/android/02-calendar-app.md §3) —
  // a separate, faster component from AddCalendarItemModal, not just that modal pre-filled.
  calendarQuickAddOpen: boolean;
  calendarQuickAddDate: string | null;
  calendarQuickAddTime: string | null;
  calendarQuickAddKind: CalendarItemKind;
  showCalendarQuickAdd:  (date: string, time?: string | null, kind?: CalendarItemKind) => void;
  closeCalendarQuickAdd: () => void;

  // Records / Trackers
  activeTrackerId:  string | null;
  setActiveTracker: (id: string | null) => void;
  showAddTracker:   () => void;
  pendingTrackerId: string | null;
  showAddEntry:     (trackerId: string) => void;
  editingEntryId:   string | null;
  openEditEntry:    (id: string) => void;
  editTrackerOpen:    boolean;
  editingTrackerId:   string | null;
  openEditTracker:    (id: string) => void;
  closeEditTracker:   () => void;

  // Routines
  showAddRoutine:         () => void;
  editRoutineOpen:        boolean;
  editingRoutineId:       string | null;
  openEditRoutine:        (id: string) => void;
  closeEditRoutine:       () => void;
  activeRoutineId:        string | null;
  setActiveRoutine:       (id: string | null) => void;

  // Lists
  showAddList:           () => void;
  openEditList:          (id: string) => void;
  editingListId:         string | null;
  showAddListItem:       (listId: string, tabId?: string | null) => void;
  openEditListItem:      (id: string) => void;
  editingListItemId:     string | null;
  pendingListItemListId: string | null;
  pendingListItemTabId:  string | null;
  activeListId:          string | null;
  setActiveListId:       (id: string | null) => void;
  // Remembers the last-selected list + tab within it so switching apps and back restores
  // the same view — same "last" pattern as notesLastEditingNoteId, kept separate from
  // activeListId because that field must still clear to null on unmount (AddTaskButton
  // and the N/Space hotkey read it live to decide whether "Add item" is offered).
  listsLastActiveListId: string | null;
  listsLastActiveTabId:  string | null;
  setListsLastActive:    (listId: string | null, tabId: string | null) => void;

  // Overview — persisted, so the section reopens on what it last showed.
  overviewSelection:     OverviewSelection;
  setOverviewSelection:  (sel: OverviewSelection) => void;
  // Jump to an Endeavour's automatic Overview from anywhere (e.g. the Endeavour's row menu).
  openEndeavourOverview: (collectionId: string) => void;
  editingOverviewId:     string | null;   // null with openModal 'add-overview' = creating one
  showAddOverview:       () => void;
  openEditOverview:      (id: string) => void;

  // Portfolio
  showAddWatchlistItem:      () => void;
  showAddPortfolioTag:       () => void;
  showAddInvestmentPurpose:  () => void;
  showBulkUploadWatchlist:   () => void;
  editingWatchlistItemId:    string | null;
  openEditWatchlistItem:     (id: string) => void;
  portfolioChartOpen:        boolean;
  setPortfolioChartOpen:     (open: boolean) => void;

  // Notes
  selectedNoteTagId:       NoteTagId | null;
  setSelectedNoteTag:      (id: NoteTagId | null) => void;
  expandedNoteTagIds:      NoteTagId[];
  toggleNoteTagExpanded:   (id: NoteTagId) => void;
  pendingNoteTagParentId:  NoteTagId | null;
  pendingNoteTagKind:      'area' | 'tag';
  // Which Notes column has keyboard focus (arrow-key navigation in ChronicleView). Memory-only;
  // back to 'tree' each time Notes is entered, as when it was ChronicleView's own state.
  notesFocusedColumn:      NotesColumn;
  setNotesFocusedColumn:   (col: NotesColumn) => void;
  editingNoteId:           string | null;
  // tabId (optional): open on that tab of the note — '__main__' or a NoteTab id. Consumed by
  // NoteEditor. In Notes, the note being left becomes a history stop (`opts.mode` 'silent': not,
  // for history's own moves).
  openNote:                (id: string, tabId?: string, opts?: { mode?: 'push' | 'silent' }) => void;
  requestedNoteTab:        { noteId: string; tabId: string } | null;
  clearRequestedNoteTab:   () => void;
  // A passage to select and scroll to once the note is open (a Glossary entry's definition, a
  // reference to it, a Key point, a passage due for review). Set with openNote by
  // services/notePassage.ts; consumed by NoteEditor.
  requestedNotePassage:      ({ noteId: string } & PassageMark) | null;
  setRequestedNotePassage:   (p: ({ noteId: string } & PassageMark) | null) => void;
  // The Notes Glossary view (components/NotesSection/GlossaryView.tsx), in place of the tree.
  notesGlossaryOpen:       boolean;
  openNotesGlossary:       () => void;
  closeNotesGlossary:      () => void;
  // The Notes Review view (passages marked "review later" that are due).
  notesReviewOpen:         boolean;
  openNotesReview:         () => void;
  closeNotesReview:        () => void;
  closeNote:               () => void;
  // Remembers which note (if any) was open in the Notes section so switching away and
  // back restores it — separate from editingNoteId, which also drives NoteEditorPane's
  // cross-app quick-view in other sections and must still clear on section switch.
  notesLastEditingNoteId:  string | null;
  // Which tab (null = Main) was open within notesLastEditingNoteId — restored by
  // NoteEditor alongside the note itself so returning to Notes lands on the same tab,
  // not just the same note.
  notesLastActiveTabId:    string | null;
  setNotesLastActiveTab:   (tabId: string | null) => void;
  // Per-note "which tab was I last on" memory, keyed by noteId — distinct from
  // notesLastActiveTabId above (which only ever remembers the single most-recently-open
  // note+tab pair). This is what lets revisiting a DIFFERENT note within the same Notes
  // session (without leaving the section) land back on that note's own last tab, rather than
  // always resetting to Main. Capped (see setNoteTabMemory) — nothing ever removes an entry
  // when its note is deleted, so left unbounded it would grow forever.
  notesTabMemory:          Record<string, string | null>;
  setNoteTabMemory:        (noteId: string, tabId: string | null) => void;
  showAddNote:             () => void;
  showAddNoteTag:          (parentId?: NoteTagId | null, kind?: 'area' | 'tag') => void;
  showTagPresets:          () => void;
  editingNoteMetaId:       string | null;
  showEditNoteMeta:        (noteId: string) => void;

  // Notes — edit notebook
  editNoteTagOpen:   boolean;
  editingNoteTagId:  string | null;
  openEditNoteTag:   (id: string) => void;
  closeEditNoteTag:  () => void;

  // Notes — tag view
  noteTagViewActive:       boolean;
  noteTagViewTagIds:       string[];
  openNoteTagView:         (tagIds: string[]) => void;
  closeNoteTagView:        () => void;
  noteTagViewReturn:       string[] | null;  // tag IDs to restore when clicking "back"
  setNoteTagViewReturn:    (ids: string[] | null) => void;

  // Android back-button handling (docs/android/00-architecture.md §5d). A screen with its
  // own back-relevant navigation (a master-detail detail view, e.g. Records/Lists) registers
  // itself as the sole consumer on mount and clears it on unmount. The global back-button
  // listener (App.tsx) checks, in order: (1) closeTopOverlay() — the Escape stack, newest
  // overlay first; (2) mobileBackConsumer, handled if it returns true; (3) navigateBack();
  // (4) minimise. Only one master-detail screen is ever visible at a time,
  // so a single slot (not a stack) is sufficient.
  mobileBackConsumer:         (() => boolean) | null;
  registerMobileBackConsumer: (fn: (() => boolean) | null) => void;

  // MobileMoreSheet (Android bottom-nav overflow — Notes/Portfolio/Fitness/Manage/Settings/Account)
  mobileMoreSheetOpen:  boolean;
  openMobileMoreSheet:  () => void;
  closeMobileMoreSheet: () => void;

  // Suite-wide Quick Access pane (Ctrl+G) — jump straight to a note/notebook/task/list/
  // Endeavour/tracker/routine by search, or from recent/frequent history. See
  // src/utils/quickAccess.ts for the provider registry and src/store/recentItemsStore.ts
  // for the visit-tracking that backs "recent"/"frequent".
  // "Confirm your passphrase to permanently decrypt this note/list" prompt (DecryptPrompt).
  // Requested by the clickable 🔒 icons; not persisted.
  decryptPrompt:       { kind: 'note' | 'list'; id: string } | null;
  requestDecrypt:      (kind: 'note' | 'list', id: string) => void;
  closeDecryptPrompt:  () => void;

  quickAccessOpen:   boolean;
  openQuickAccess:   () => void;
  closeQuickAccess:  () => void;
  toggleQuickAccess: () => void;

  // Lists' selected-list state lives as local useState in ListsSection.tsx (seeded once from
  // listsLastActiveListId on mount) rather than in uiStore, so an external navigation request
  // (Quick Access picking a list while already inside the Lists section) has nothing to write
  // to that ListsSection would notice. This is that escape hatch: ListsSection watches it in
  // an effect and applies+clears it, the same "pending request, consumed by the one section
  // that can act on it" shape as pendingArtifactLink above.
  pendingListSelectionId: string | null;
  requestListSelection:   (id: string) => void;
  clearPendingListSelection: () => void;

  // Same "pending request, consumed by the section that can act on it" shape: CalendarView's
  // visible year/month/selectedDate are local state, so something outside it (a note's link to an
  // event) can't move the calendar directly. CalendarView applies this via its jumpToDate and clears it.
  pendingCalendarDate: string | null;
  requestCalendarDate: (date: string) => void;
  clearPendingCalendarDate: () => void;
}

// uiStore is memory-only for everything EXCEPT the fields listed in `partialize` below —
// navigation/session memory (active section, back/forward history, each section's
// last-open item + tab, and the Endeavour/Purpose filters). Modal/pane/dropdown
// open-states are deliberately excluded so the app never reopens pointing at a stale
// modal, or a possibly-deleted item, after a reload. See PERSISTED_STORAGE_KEYS
// (src/config/backup.ts) — 'todo-ui-session' is registered there too.
export const useUIStore = create<UIState>()(persist((set, get) => ({
  openModal:                null,
  activeCollectionIdByView: {},
  endeavourPickerOpen:      false,
  purposePickerOpen:        false,
  manageOpen:               false,
  manageSection:            'endeavours',
  editingTaskId:      null,
  tasksLastEditingTaskId: null,
  sidebarOpen:        false,
  activePurposeIds:   [],
  activeTagIds:       [],
  editingTag:         null,
  editingPurpose:     null,
  editingCollection:  null,
  editingActivity:    null,
  editingSchedule:    null,
  taskModalAdvanced:  false,
  pendingParentId:    null,

  showAddTask:       () => set({ openModal: 'add-task', taskModalAdvanced: false, pendingParentId: null, pendingFollowUpOf: null, quickAddPrefill: null }),
  showAddSubtask:    (parentId) => set({ openModal: 'add-task', taskModalAdvanced: true, pendingParentId: parentId ?? null, pendingFollowUpOf: null, quickAddPrefill: null }),
  pendingFollowUpOf: null,
  showAddFollowUp:   (originTaskId) => set({ openModal: 'add-task', taskModalAdvanced: false, pendingParentId: null, pendingFollowUpOf: originTaskId, quickAddPrefill: null }),
  quickAddPrefill:        null,
  showAddTaskWithPrefill: (prefill) => set({ openModal: 'add-task', taskModalAdvanced: false, pendingParentId: null, pendingFollowUpOf: null, quickAddPrefill: prefill }),

  pendingArtifactLink:      null,
  setPendingArtifactLink:   (link) => set({ pendingArtifactLink: link }),
  resolveArtifactLink:      (targetId, targetType) => set((s) =>
    s.pendingArtifactLink ? { pendingArtifactLink: { ...s.pendingArtifactLink, resolvedTargetId: targetId, ...(targetType ? { targetType } : {}) } } : {}
  ),
  clearPendingArtifactLink: () => set({ pendingArtifactLink: null }),
  showAddCollection: () => set({ openModal: 'add-collection' }),
  showAddPurpose:    () => set({ openModal: 'add-purpose'    }),
  showAddTag:        () => set({ openModal: 'add-tag'        }),
  showAddActivity:   () => set({ openModal: 'add-activity', editingActivity: null }),
  openEditActivity:  (activity) => set({ openModal: 'add-activity', editingActivity: activity }),
  closeEditActivity: ()         => set({ openModal: null,           editingActivity: null      }),

  editActivityTypeOpen:  false,
  editingActivityTypeId: null,
  showAddActivityType:   () => set({ editActivityTypeOpen: true, editingActivityTypeId: null }),
  openEditActivityType:  (id) => set({ editActivityTypeOpen: true, editingActivityTypeId: id }),
  closeEditActivityType: () => set({ editActivityTypeOpen: false, editingActivityTypeId: null }),

  schedulesOpen:     false,
  openSchedules:     () => set({ schedulesOpen: true  }),
  closeSchedules:    () => set({ schedulesOpen: false }),
  toggleSchedules:   () => set((s) => ({ schedulesOpen: !s.schedulesOpen })),
  showAddSchedule:   () => set({ openModal: 'add-schedule', editingSchedule: null }),
  openEditSchedule:  (schedule) => { useRecentItemsStore.getState().recordVisit('schedule', schedule.id); set({ openModal: 'add-schedule', editingSchedule: schedule }); },
  closeEditSchedule: ()         => set({ openModal: null,           editingSchedule: null      }),

  createDraft:       null,
  setCreateDraft:    (draft) => set({ createDraft: draft }),
  closeModal:        () => set({
    openModal: null,
    createDraft: null,
    taskModalAdvanced: false,
    pendingParentId: null,
    pendingFollowUpOf: null,
    editingOverviewId: null,
    quickAddPrefill: null,
    editingTag: null,
    editingPurpose: null,
    editingCollection: null,
    editingActivity: null,
    editingSchedule: null,
    calendarItemDate: null,
    calendarItemKind: null,
    calendarItemTitle: null,
    calendarItemExtra: null,
    editingEntryId: null,
    editingWatchlistItemId: null,
    editingListId: null,
    editingListItemId: null,
    pendingListItemListId: null,
    pendingListItemTabId: null,
    editingNoteMetaId: null,
  }),

  setActiveCollection: (id) => {
    if (id) useRecentItemsStore.getState().recordVisit('endeavour', id);
    set((s) => ({
      activeCollectionIdByView: { ...s.activeCollectionIdByView, [s.activeView]: id },
    }));
  },
  closeEndeavourPicker:  () => set({ endeavourPickerOpen: false }),
  toggleEndeavourPicker: () => set((s) => ({ endeavourPickerOpen: !s.endeavourPickerOpen })),
  closePurposePicker:    () => set({ purposePickerOpen: false }),
  togglePurposePicker:   () => set((s) => ({ purposePickerOpen: !s.purposePickerOpen })),
  openManage:            (section) => set({ manageOpen: true, manageSection: section ?? 'endeavours' }),
  closeManage:           () => set({ manageOpen: false }),
  toggleManage:          () => set((s) => ({ manageOpen: !s.manageOpen })),
  setManageSection:      (section) => set({ manageSection: section }),
  openTaskPane:        (id) => { useRecentItemsStore.getState().recordVisit('task', id); set({ editingTaskId: id }); },
  closeTaskPane:       ()   => set({ editingTaskId: null }),
  openSidebar:         ()   => set({ sidebarOpen: true }),
  closeSidebar:        ()   => set({ sidebarOpen: false }),

  togglePurposeFilter: (id) => set((s) => ({
    activePurposeIds: s.activePurposeIds.includes(id)
      ? s.activePurposeIds.filter((x) => x !== id)
      : [...s.activePurposeIds, id],
  })),

  toggleTagFilter: (id) => set((s) => ({
    activeTagIds: s.activeTagIds.includes(id)
      ? s.activeTagIds.filter((x) => x !== id)
      : [...s.activeTagIds, id],
  })),

  openEditTag:         (tag)        => set({ editingTag:        tag,        openModal: 'add-tag'        }),
  closeEditTag:        ()           => set({ editingTag:        null,       openModal: null              }),
  openEditPurpose:     (purpose)    => set({ editingPurpose:    purpose,    openModal: 'add-purpose'    }),
  closeEditPurpose:    ()           => set({ editingPurpose:    null,       openModal: null              }),
  openEditCollection:  (collection) => set({ editingCollection: collection, openModal: 'add-collection' }),
  closeEditCollection: ()           => set({ editingCollection: null,       openModal: null              }),

  settingsOpen:  false,
  openSettings:  () => set({ settingsOpen: true  }),
  closeSettings: () => set({ settingsOpen: false }),

  accountOpen:  false,
  openAccount:  () => set({ accountOpen: true  }),
  closeAccount: () => set({ accountOpen: false }),

  integrationsOpen:  false,
  openIntegrations:  () => set({ integrationsOpen: true  }),
  closeIntegrations: () => set({ integrationsOpen: false }),

  recyclingBinOpen:  false,
  openRecyclingBin:  () => set({ recyclingBinOpen: true  }),
  closeRecyclingBin: () => set({ recyclingBinOpen: false }),

  sortField: 'createdAt',
  sortDir:   'desc',
  setSortField: (f, dir) => set({ sortField: f, sortDir: dir ?? DEFAULT_SORT_DIR[f] }),
  setSortDir:   (d)      => set({ sortDir: d }),

  activeView:    'tasks',
  setActiveView: (view, opts) => set((s) => {
    if (view === s.activeView) return {};
    // A normal navigation records where we're leaving and clears the forward stack, as a
    // browser does; history's own moves ('silent') manage the stacks themselves.
    const history = (opts?.mode ?? 'push') === 'push' ? recordPlace(s) : {};
    // Only reopen a remembered Calendar pane if it's still within the TTL — otherwise it's
    // treated the same as no memory at all (both editing ids land on null below).
    const freshCalendarMemory =
      s.calendarLastEditing && Date.now() - new Date(s.calendarLastEditing.at).getTime() < CALENDAR_LAST_EDITING_TTL_MS
        ? s.calendarLastEditing
        : null;
    return {
      activeView: view,
      ...history,
      portfolioChartOpen:  false,
      // Close inline note editor and tag view when leaving the notes section (editingNoteId
      // also drives NoteEditorPane's cross-app quick-view elsewhere, so it can't just be left
      // set) — but remember which note it was in notesLastEditingNoteId, and restore it when
      // coming back to Notes, so switching apps and back doesn't dump you at the root.
      editingNoteId:       view === 'notes'
        ? (s.activeView === 'notes' ? s.editingNoteId : s.notesLastEditingNoteId)
        : null,
      notesLastEditingNoteId: s.activeView === 'notes' ? s.editingNoteId : s.notesLastEditingNoteId,
      noteTagViewReturn:   view === 'notes' ? s.noteTagViewReturn : null,
      notesFocusedColumn:  'tree' as const,
      // Same "last X, remembered on leave, restored fresh on entry" shape as Notes above —
      // except gated by CALENDAR_LAST_EDITING_TTL_MS (freshCalendarMemory), since unlike a
      // note, reopening an event/reminder pane out of nowhere after a long absence would read
      // as the app doing something unprompted rather than "picking up where you left off."
      editingCalendarEventId: view === 'calendar'
        ? (s.activeView === 'calendar' ? s.editingCalendarEventId : (freshCalendarMemory?.type === 'event' ? freshCalendarMemory.id : null))
        : null,
      editingCalendarReminderId: view === 'calendar'
        ? (s.activeView === 'calendar' ? s.editingCalendarReminderId : (freshCalendarMemory?.type === 'reminder' ? freshCalendarMemory.id : null))
        : null,
      editingCalendarDeadlineId: view === 'calendar'
        ? (s.activeView === 'calendar' ? s.editingCalendarDeadlineId : (freshCalendarMemory?.type === 'deadline' ? freshCalendarMemory.id : null))
        : null,
      calendarLastEditing: s.activeView === 'calendar'
        ? (s.editingCalendarEventId
            ? { type: 'event' as const, id: s.editingCalendarEventId, at: new Date().toISOString() }
            : s.editingCalendarReminderId
            ? { type: 'reminder' as const, id: s.editingCalendarReminderId, at: new Date().toISOString() }
            : s.editingCalendarDeadlineId
            ? { type: 'deadline' as const, id: s.editingCalendarDeadlineId, at: new Date().toISOString() }
            : s.calendarLastEditing)
        : s.calendarLastEditing,
      // Endeavour/Purpose filter dropdowns are section-scoped UI, not section-scoped
      // state — close them on any section switch so they don't reopen stale later.
      endeavourPickerOpen: false,
      purposePickerOpen:   false,
      // TaskPane can be opened while jumping sections (e.g. clicking an ArtifactLinkMark in
      // Notes) — every *pre-existing* way to open it from another section (CalendarEventPane's
      // "Linked task" chip, etc.) explicitly closes its own pane first and never itself calls
      // setActiveView, so TaskPane never had to survive a real section switch before. Without
      // this, Backspace back out of Tasks left a stale TaskPane floating over whatever section
      // you returned to — caught via a live round-trip, not by inspection. Landing specifically
      // back in Tasks restores the last-open pane instead (same "remember on leave, restore
      // fresh on entry" shape as notesLastEditingNoteId, 2026-09-25).
      editingTaskId: view === 'tasks'
        ? (s.activeView === 'tasks' ? s.editingTaskId : s.tasksLastEditingTaskId)
        : null,
      tasksLastEditingTaskId: s.activeView === 'tasks' ? s.editingTaskId : s.tasksLastEditingTaskId,
    };
  }),

  navHistory: [],
  navForward: [],
  navigateBack:    () => get().travelHistory(-1),
  navigateForward: () => { get().travelHistory(1); },
  travelHistory: (steps) => {
    const s = get();
    const moved = travel(s.navHistory, s.navForward, capturePlace(s), steps);
    if (!moved) return false;
    set({ navHistory: moved.back, navForward: moved.forward });
    goToPlace(moved.target);
    return true;
  },
  currentPlace: () => capturePlace(get()),
  historyBrowserOpen:  false,
  openHistoryBrowser:  () => set({ historyBrowserOpen: true }),
  closeHistoryBrowser: () => set({ historyBrowserOpen: false }),

  taskViewMode:    'overview',
  setTaskViewMode: (mode) => {
    set({ taskViewMode: mode, taskExpandedIds: [] });
  },

  taskExpandedIds: [],
  toggleTaskExpanded: (taskId) => set((s) => ({
    taskExpandedIds: s.taskExpandedIds.includes(taskId)
      ? s.taskExpandedIds.filter((id) => id !== taskId)
      : [...s.taskExpandedIds, taskId],
  })),
  clearTaskExpanded: () => set({ taskExpandedIds: [] }),

  editingCalendarEventId:    null,
  editingCalendarReminderId: null,
  editingCalendarDeadlineId: null,
  calendarLastEditing:       null,
  editingCalendarEventOccurrence:    null,
  editingCalendarReminderOccurrence: null,
  editingCalendarDeadlineOccurrence: null,
  openCalendarEventPane:     (id, occurrenceDate) => set({ editingCalendarEventId: id, editingCalendarEventOccurrence: occurrenceDate ?? null }),
  closeCalendarEventPane:    ()   => set({ editingCalendarEventId: null, editingCalendarEventOccurrence: null }),
  openCalendarReminderPane:  (id, occurrenceDate) => set({ editingCalendarReminderId: id, editingCalendarReminderOccurrence: occurrenceDate ?? null }),
  closeCalendarReminderPane: ()   => set({ editingCalendarReminderId: null, editingCalendarReminderOccurrence: null }),
  openCalendarDeadlinePane:  (id, occurrenceDate) => set({ editingCalendarDeadlineId: id, editingCalendarDeadlineOccurrence: occurrenceDate ?? null }),
  closeCalendarDeadlinePane: ()   => set({ editingCalendarDeadlineId: null, editingCalendarDeadlineOccurrence: null }),

  calendarViewMode:    'month',
  setCalendarViewMode: (mode) => set({ calendarViewMode: mode }),

  calendarYear:  Number(todayIso().slice(0, 4)),
  calendarMonth: Number(todayIso().slice(5, 7)) - 1,
  calendarSelectedDate: todayIso(),
  setCalendarYear:  (value) => set((s) => ({ calendarYear:  typeof value === 'function' ? value(s.calendarYear)  : value })),
  setCalendarMonth: (value) => set((s) => ({ calendarMonth: typeof value === 'function' ? value(s.calendarMonth) : value })),
  setCalendarSelectedDate: (value) => set({ calendarSelectedDate: value }),


  calendarItemDate:  null,
  calendarItemKind:  null,
  calendarItemTime:  null,
  calendarItemTitle: null,
  calendarItemExtra: null,
  showAddCalendarItem: (date, kind, time, title, extra) => set({
    openModal: 'add-calendar-item',
    calendarItemDate: date ?? null,
    calendarItemKind: kind ?? null,
    calendarItemTime: time ?? null,
    calendarItemTitle: title ?? null,
    calendarItemExtra: extra ?? null,
  }),

  calendarQuickAddOpen: false,
  calendarQuickAddDate: null,
  calendarQuickAddTime: null,
  calendarQuickAddKind: 'event',
  showCalendarQuickAdd: (date, time, kind) => set({
    calendarQuickAddOpen: true,
    calendarQuickAddDate: date,
    calendarQuickAddTime: time ?? null,
    calendarQuickAddKind: kind ?? 'event',
  }),
  closeCalendarQuickAdd: () => set({ calendarQuickAddOpen: false }),

  // Records / Trackers
  activeTrackerId:  null,
  setActiveTracker: (id) => { if (id) useRecentItemsStore.getState().recordVisit('tracker', id); set({ activeTrackerId: id, activeRoutineId: null }); },
  showAddTracker:   () => set({ openModal: 'add-tracker', pendingTrackerId: null }),
  pendingTrackerId: null,
  showAddEntry:     (trackerId) => set({ openModal: 'add-entry', pendingTrackerId: trackerId, editingEntryId: null }),
  editingEntryId:   null,
  openEditEntry:    (id) => set({ editingEntryId: id, openModal: 'add-entry' }),
  editTrackerOpen:  false,
  editingTrackerId: null,
  openEditTracker:  (id) => set({ editTrackerOpen: true, editingTrackerId: id }),
  closeEditTracker: () => set({ editTrackerOpen: false, editingTrackerId: null }),

  // Lists
  showAddList:           () => set({ openModal: 'add-list',      editingListId: null }),
  openEditList:          (id) => set({ openModal: 'add-list',    editingListId: id   }),
  editingListId:         null,
  showAddListItem:       (listId, tabId) => set({ openModal: 'add-list-item', pendingListItemListId: listId, pendingListItemTabId: tabId ?? null, editingListItemId: null }),
  openEditListItem:      (id) => set({ openModal: 'add-list-item', editingListItemId: id }),
  editingListItemId:     null,
  pendingListItemListId: null,
  pendingListItemTabId:  null,
  activeListId:          null,
  setActiveListId:       (id) => set({ activeListId: id }),
  listsLastActiveListId: null,
  listsLastActiveTabId:  null,
  setListsLastActive:    (listId, tabId) => set({ listsLastActiveListId: listId, listsLastActiveTabId: tabId }),
  overviewSelection:     null,
  setOverviewSelection:  (sel) => set({ overviewSelection: sel }),
  openEndeavourOverview: (collectionId) => {
    set({ overviewSelection: { kind: 'endeavour', id: collectionId } });
    get().setActiveView('overview');
  },
  editingOverviewId:     null,
  showAddOverview:       () => set({ openModal: 'add-overview', editingOverviewId: null }),
  openEditOverview:      (id) => set({ openModal: 'add-overview', editingOverviewId: id }),

  // Portfolio
  showAddWatchlistItem:     () => set({ openModal: 'add-watchlist-item', editingWatchlistItemId: null }),
  showAddPortfolioTag:      () => set({ openModal: 'add-portfolio-tag'     }),
  showAddInvestmentPurpose: () => set({ openModal: 'add-investment-purpose'}),
  showBulkUploadWatchlist:  () => set({ openModal: 'bulk-upload-watchlist' }),
  editingWatchlistItemId:   null,
  openEditWatchlistItem:    (id) => set({ openModal: 'add-watchlist-item', editingWatchlistItemId: id }),
  portfolioChartOpen:       false,
  setPortfolioChartOpen:    (open) => set({ portfolioChartOpen: open }),

  // Notes
  selectedNoteTagId:      null,
  // Moving to a different notebook also closes the open note — otherwise the previous
  // notebook's note would sit in the editor pane under the new notebook's list.
  setSelectedNoteTag:     (id) => {
    if (id) useRecentItemsStore.getState().recordVisit('notebook', id);
    // Selecting a notebook keeps the path to it open: one reached by hovering its parents open
    // (ChronicleView's hover-expand) would otherwise collapse out of sight as soon as the mouse
    // left the tree (reported 2026-10-01).
    set((s) => ({
      selectedNoteTagId: id,
      ...(id ? { expandedNoteTagIds: expandNotebookAncestors(s.expandedNoteTagIds, id, useNoteStore.getState().noteTags) } : {}),
      ...(id !== s.selectedNoteTagId ? {
        editingNoteId: null,
        ...(s.editingNoteId ? recordPlace(s) : {}),
      } : {}),
    }));
  },
  expandedNoteTagIds:     [],
  toggleNoteTagExpanded:  (id) => set((s) => ({
    expandedNoteTagIds: s.expandedNoteTagIds.includes(id)
      ? s.expandedNoteTagIds.filter((x) => x !== id)
      : [...s.expandedNoteTagIds, id],
  })),
  pendingNoteTagParentId: null,
  pendingNoteTagKind:     'area',
  notesFocusedColumn:     'tree',
  setNotesFocusedColumn:  (col) => set({ notesFocusedColumn: col }),
  editingNoteId:          null,
  openNote: (id, tabId, opts) => set((s) => {
    const requestedNoteTab = tabId ? { noteId: id, tabId } : null;
    if (id === s.editingNoteId) return { requestedNoteTab };
    // The note being left is a stop, only in Notes itself (editingNoteId also drives the
    // quick-view pane in other sections, which isn't a place you were).
    const history = (opts?.mode ?? 'push') === 'push' && s.activeView === 'notes' && s.editingNoteId ? recordPlace(s) : {};

    // Keep the notebook tree/list panels in sync with whatever note is actually being shown.
    // Every path that opens a note funnels through here — tree click, Quick Access, cross-app
    // links, back/forward stepping — so resolving it once here fixes all of them, including a
    // pre-existing gap in Quick Access's note navigation that had the same symptom. Without
    // this, jumping to a note NOT via its own notebook's list left the tree/list pointing at
    // whatever notebook was selected before (reported 2026-09-25).
    const { notes, noteTags } = useNoteStore.getState();
    const note = notes[id as NoteId];
    const notebookId = note ? getNotePrimaryNotebookId(note, noteTags) : null;
    const selectedNoteTagId = notebookId ? (notebookId as NoteTagId) : s.selectedNoteTagId;
    const expandedNoteTagIds = notebookId
      ? expandNotebookAncestors(s.expandedNoteTagIds, notebookId, noteTags)
      : s.expandedNoteTagIds;

    return { editingNoteId: id, requestedNoteTab, ...history, selectedNoteTagId, expandedNoteTagIds };
  }),
  requestedNoteTab:       null,
  clearRequestedNoteTab:  () => set({ requestedNoteTab: null }),
  requestedNotePassage:     null,
  setRequestedNotePassage:  (p) => set({ requestedNotePassage: p }),
  notesGlossaryOpen:      false,
  openNotesGlossary:      () => set({ notesGlossaryOpen: true, notesReviewOpen: false, noteTagViewActive: false }),
  closeNotesGlossary:     () => set({ notesGlossaryOpen: false }),
  notesReviewOpen:        false,
  openNotesReview:        () => set({ notesReviewOpen: true, notesGlossaryOpen: false, noteTagViewActive: false }),
  closeNotesReview:       () => set({ notesReviewOpen: false }),
  closeNote: () => set((s) => ({
    editingNoteId: null,
    ...(s.activeView === 'notes' && s.editingNoteId ? recordPlace(s) : {}),
  })),
  notesLastEditingNoteId: null,
  notesLastActiveTabId:   null,
  setNotesLastActiveTab:  (tabId) => set({ notesLastActiveTabId: tabId }),
  notesTabMemory:         {},
  setNoteTabMemory: (noteId, tabId) => set((s) => {
    let notesTabMemory = { ...s.notesTabMemory, [noteId]: tabId };
    const keys = Object.keys(notesTabMemory);
    if (keys.length > MAX_NOTE_TAB_MEMORY) {
      notesTabMemory = Object.fromEntries(keys.slice(-NOTE_TAB_MEMORY_TRIM_TO).map((k) => [k, notesTabMemory[k]]));
    }
    return { notesTabMemory };
  }),
  showAddNote:            ()   => set({ openModal: 'add-note' }),
  showAddNoteTag:         (parentId, kind = 'area') => set({ openModal: 'add-note-tag', pendingNoteTagParentId: parentId ?? null, pendingNoteTagKind: kind }),
  showTagPresets:         () => set({ openModal: 'note-tag-presets' }),
  editingNoteMetaId:      null,
  showEditNoteMeta:       (noteId) => set({ openModal: 'edit-note-meta', editingNoteMetaId: noteId }),

  editNoteTagOpen:  false,
  editingNoteTagId: null,
  openEditNoteTag:  (id) => set({ editNoteTagOpen: true, editingNoteTagId: id }),
  closeEditNoteTag: () => set({ editNoteTagOpen: false, editingNoteTagId: null }),

  noteTagViewActive:      false,
  noteTagViewTagIds:      [],
  openNoteTagView:        (tagIds) => set({ noteTagViewActive: true, noteTagViewTagIds: tagIds, notesGlossaryOpen: false, notesReviewOpen: false }),
  closeNoteTagView:       () => set({ noteTagViewActive: false, noteTagViewTagIds: [] }),
  noteTagViewReturn:    null,
  setNoteTagViewReturn: (ids) => set({ noteTagViewReturn: ids }),

  // Routines
  showAddRoutine:        () => set({ openModal: 'add-routine' }),
  editRoutineOpen:       false,
  editingRoutineId:      null,
  openEditRoutine:       (id) => set({ editRoutineOpen: true, editingRoutineId: id }),
  closeEditRoutine:      () => set({ editRoutineOpen: false, editingRoutineId: null }),
  activeRoutineId:       null,
  setActiveRoutine:      (id) => { if (id) useRecentItemsStore.getState().recordVisit('routine', id); set({ activeRoutineId: id, activeTrackerId: null }); },

  mobileBackConsumer:         null,
  registerMobileBackConsumer: (fn) => set({ mobileBackConsumer: fn }),

  mobileMoreSheetOpen:  false,
  openMobileMoreSheet:  () => set({ mobileMoreSheetOpen: true }),
  closeMobileMoreSheet: () => set({ mobileMoreSheetOpen: false }),

  decryptPrompt:       null,
  requestDecrypt:      (kind, id) => set({ decryptPrompt: { kind, id } }),
  closeDecryptPrompt:  () => set({ decryptPrompt: null }),

  quickAccessOpen:   false,
  openQuickAccess:   () => set({ quickAccessOpen: true }),
  closeQuickAccess:  () => set({ quickAccessOpen: false }),
  toggleQuickAccess: () => set((s) => ({ quickAccessOpen: !s.quickAccessOpen })),

  pendingListSelectionId:    null,
  requestListSelection:      (id) => set({ pendingListSelectionId: id }),
  clearPendingListSelection: () => set({ pendingListSelectionId: null }),
  pendingCalendarDate:       null,
  requestCalendarDate:       (date) => set({ pendingCalendarDate: date }),
  clearPendingCalendarDate:  () => set({ pendingCalendarDate: null }),
}), {
  name:    'todo-ui-session',
  storage: persistStorage(),
  version: 4,
  // v1 → v2: overviewSelection (Overview section, 2026-10-01).
  // v2 → v3: one history of places (navHistory/navForward) replaces sectionHistory and
  // notesHistory (2026-10-07); the old section stops carry over, the note stops are dropped.
  // v3 → v4: expandedNoteTagIds persisted, so the notebook tree reopens as it was left (2026-10-08).
  migrate: (persisted, fromVersion) => {
    let state = (persisted ?? {}) as Record<string, unknown>;
    if (fromVersion < 2 && state.overviewSelection === undefined) state = { ...state, overviewSelection: null };
    if (fromVersion < 3) {
      const at = new Date().toISOString();
      const toPlaces = (v: unknown) => (Array.isArray(v) ? v : []).map((e: { view: AppView }) => ({ view: e.view, at }));
      const rest = { ...state };
      for (const k of ['sectionHistory', 'sectionForwardHistory', 'notesHistory', 'notesForwardHistory']) delete rest[k];
      state = { ...rest, navHistory: toPlaces(state.sectionHistory), navForward: toPlaces(state.sectionForwardHistory) };
    }
    if (fromVersion < 4 && !Array.isArray(state.expandedNoteTagIds)) state = { ...state, expandedNoteTagIds: [] };
    return state as never;
  },
  partialize: (s) => ({
    activeView:               s.activeView,
    navHistory:               s.navHistory,
    navForward:               s.navForward,
    activeCollectionIdByView: s.activeCollectionIdByView,
    activePurposeIds:         s.activePurposeIds,
    tasksLastEditingTaskId:   s.tasksLastEditingTaskId,
    notesLastEditingNoteId:   s.notesLastEditingNoteId,
    notesLastActiveTabId:     s.notesLastActiveTabId,
    notesTabMemory:           s.notesTabMemory,
    selectedNoteTagId:        s.selectedNoteTagId,
    expandedNoteTagIds:       s.expandedNoteTagIds,
    listsLastActiveListId:    s.listsLastActiveListId,
    listsLastActiveTabId:     s.listsLastActiveTabId,
    overviewSelection:        s.overviewSelection,
    activeTrackerId:          s.activeTrackerId,
    activeRoutineId:          s.activeRoutineId,
    calendarViewMode:         s.calendarViewMode,
    calendarYear:             s.calendarYear,
    calendarMonth:            s.calendarMonth,
    calendarSelectedDate:     s.calendarSelectedDate,
    calendarLastEditing:      s.calendarLastEditing,
  }),
}));

// The focused Endeavour for whichever section is currently active. Sections that don't
// show the Endeavour picker (Lists, Portfolio) simply never populate their entry.
export const selectActiveCollectionId = (s: UIState): string | null =>
  s.activeCollectionIdByView[s.activeView] ?? null;

// ── History: what "here" is, and going back to a place (store/navHistory.ts) ─────────────────

export function capturePlace(s: UIState): NavPlace {
  const at = new Date().toISOString();
  switch (s.activeView) {
    case 'notes': {
      const noteId = s.editingNoteId;
      return { view: 'notes', at, noteId, notebookId: s.selectedNoteTagId, tabId: noteId ? (s.notesTabMemory[noteId] ?? null) : null };
    }
    case 'tasks':    return { view: 'tasks', at, taskId: s.editingTaskId };
    case 'lists':    return { view: 'lists', at, listId: s.activeListId ?? s.listsLastActiveListId, listTabId: s.listsLastActiveTabId };
    case 'calendar': return { view: 'calendar', at, calendar: { mode: s.calendarViewMode, year: s.calendarYear, month: s.calendarMonth, date: s.calendarSelectedDate } };
    case 'records':  return { view: 'records', at, trackerId: s.activeTrackerId, routineId: s.activeRoutineId };
    case 'overview': return { view: 'overview', at, overview: s.overviewSelection };
    default:         return { view: s.activeView, at };
  }
}

// The stack change for a normal navigation away from where we are.
function recordPlace(s: UIState): Pick<UIState, 'navHistory' | 'navForward'> {
  return { navHistory: pushPlace(s.navHistory, capturePlace(s)), navForward: [] };
}

// Puts the app back at a place, without recording a stop. The section's own "where was I"
// memory is set first, so entering the section lands there.
function goToPlace(p: NavPlace): void {
  const ui = useUIStore.getState();
  const set = useUIStore.setState;
  switch (p.view) {
    case 'notes': {
      set({ notesLastEditingNoteId: p.noteId ?? null, selectedNoteTagId: (p.notebookId ?? null) as NoteTagId | null });
      ui.setActiveView('notes', { mode: 'silent' });
      if (p.noteId) useUIStore.getState().openNote(p.noteId, p.tabId ?? undefined, { mode: 'silent' });
      else set({ editingNoteId: null });
      return;
    }
    case 'tasks':
      set({ tasksLastEditingTaskId: p.taskId ?? null });
      if (ui.activeView === 'tasks') set({ editingTaskId: p.taskId ?? null });
      break;
    case 'lists':
      set({ listsLastActiveListId: p.listId ?? null, listsLastActiveTabId: p.listTabId ?? null });
      if (ui.activeView === 'lists' && p.listId) ui.requestListSelection(p.listId);
      break;
    case 'calendar':
      if (p.calendar) set({ calendarViewMode: p.calendar.mode, calendarYear: p.calendar.year, calendarMonth: p.calendar.month, calendarSelectedDate: p.calendar.date });
      break;
    case 'records':
      set({ activeTrackerId: p.trackerId ?? null, activeRoutineId: p.routineId ?? null });
      break;
    case 'overview':
      if (p.overview !== undefined) set({ overviewSelection: p.overview });
      break;
  }
  useUIStore.getState().setActiveView(p.view, { mode: 'silent' });
}
