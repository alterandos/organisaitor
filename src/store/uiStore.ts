import { create } from 'zustand';
import type { Tag, Purpose, Collection, CalendarItemKind, TaskViewMode, NoteTagId, ScheduleTemplate, Priority } from '@/types';
import type { Activity } from '@/types/fitness';

export type AppView = 'tasks' | 'calendar' | 'records' | 'lists' | 'portfolio' | 'notes' | 'fitness';

export type CalendarViewMode = 'month' | 'week' | 'day';

// Backspace-to-go-back history. An object shape (not a bare AppView[]) so a future entry
// can carry more than "which section" — e.g. which note/list was open — without a
// breaking change to the stack's element type. Scoped to app-switching only for now, per
// the request ("if we leave it at app switching for now that'll be enough, but keep in
// mind flexibility to expand"). MAX_SECTION_HISTORY is the one place to change the depth.
export interface SectionHistoryEntry { view: AppView }
export const MAX_SECTION_HISTORY = 6;

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
  // MobileQuickAddBar's "More options…" escape hatch (docs/android/01-tasks-app.md §3.2) —
  // opens the full AddTaskModal pre-filled with whatever the quick-add bar had entered so far.
  quickAddPrefill:        { title: string; priority: Priority; collectionId: string | null; deadline: string | null } | null;
  showAddTaskWithPrefill: (prefill: { title: string; priority: Priority; collectionId: string | null; deadline: string | null }) => void;
  showAddCollection: () => void;
  taskModalAdvanced: boolean;
  pendingParentId:   string | null;
  showAddPurpose:    () => void;
  showAddTag:        () => void;
  showAddActivity:   () => void;
  openEditActivity:  (activity: Activity) => void;
  closeEditActivity: () => void;
  closeModal:        () => void;

  // Activity type customisation (slide-in pane, mirrors EditTrackerPane)
  editActivityTypeOpen:   boolean;
  editingActivityTypeId:  string | null;   // null = create mode
  showAddActivityType:    () => void;
  openEditActivityType:   (id: string) => void;
  closeEditActivityType:  () => void;

  // Schedules (recurring weekly timetables, e.g. a uni/gym schedule) — manager pane + create/edit modal
  schedulesOpen:     boolean;
  openSchedules:     () => void;
  closeSchedules:    () => void;
  showAddSchedule:   () => void;
  openEditSchedule:  (schedule: ScheduleTemplate) => void;
  closeEditSchedule: () => void;

  setActiveCollection:    (id: string | null) => void;
  openEndeavourPicker:    () => void;
  closeEndeavourPicker:   () => void;
  toggleEndeavourPicker:  () => void;
  openPurposePicker:      () => void;
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

  sortField:    SortField;
  sortDir:      SortDir;
  setSortField: (f: SortField, dir?: SortDir) => void;
  setSortDir:   (d: SortDir) => void;

  activeView:    AppView;
  setActiveView: (view: AppView, opts?: { skipHistory?: boolean }) => void;

  // Backspace-to-go-back: sectionHistory is most-recent-first, capped at
  // MAX_SECTION_HISTORY. navigateBack() pops the top entry and switches to it via
  // setActiveView(..., { skipHistory: true }) — skipping the history push is what stops
  // "going back" itself from being recorded as a new forward move, so repeated Backspace
  // presses walk further back through the stack instead of bouncing between two entries.
  sectionHistory: SectionHistoryEntry[];
  navigateBack:   () => void;

  taskViewMode:    TaskViewMode;
  setTaskViewMode: (mode: TaskViewMode) => void;

  editingCalendarEventId:    string | null;
  editingCalendarReminderId: string | null;
  openCalendarEventPane:     (id: string) => void;
  closeCalendarEventPane:    () => void;
  openCalendarReminderPane:  (id: string) => void;
  closeCalendarReminderPane: () => void;

  // Which of Month/Week/Day CalendarView is showing — lifted out of CalendarView's own
  // local state so it survives switching to another app and back (CalendarView unmounts
  // on section switch, same reason notesLastEditingNoteId exists for Notes).
  calendarViewMode:    CalendarViewMode;
  setCalendarViewMode: (mode: CalendarViewMode) => void;

  // Calendar layer-visibility dropdown (checkboxes; the underlying filter values live in
  // settingsStore, persisted — this is only the panel's transient open/closed state).
  calendarLayersOpen:   boolean;
  toggleCalendarLayers: () => void;
  closeCalendarLayers:  () => void;

  calendarItemDate:  string | null;
  calendarItemKind:  CalendarItemKind | null;
  calendarItemTime:  string | null;
  calendarItemTitle: string | null;
  showAddCalendarItem: (date?: string, kind?: CalendarItemKind, time?: string, title?: string) => void;

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
  closeEditEntry:   () => void;
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
  editingNoteId:           string | null;
  openNote:                (id: string) => void;
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
  toggleNoteTagViewTagId:  (id: string) => void;
  noteTagViewReturn:       string[] | null;  // tag IDs to restore when clicking "back"
  setNoteTagViewReturn:    (ids: string[] | null) => void;

  // Android back-button handling (docs/android/00-architecture.md §5d). A screen with its
  // own back-relevant navigation (a master-detail detail view, e.g. Records/Lists) registers
  // itself as the sole consumer on mount and clears it on unmount. The global back-button
  // listener checks, in order: (1) is a modal/pane open per existing uiStore state — close it;
  // (2) is mobileBackConsumer set — call it, handled if it returns true; (3) neither — fall
  // through to system back/minimize. Only one master-detail screen is ever visible at a time,
  // so a single slot (not a stack) is sufficient.
  mobileBackConsumer:         (() => boolean) | null;
  registerMobileBackConsumer: (fn: (() => boolean) | null) => void;

  // MobileMoreSheet (Android bottom-nav overflow — Notes/Portfolio/Fitness/Manage/Settings/Account)
  mobileMoreSheetOpen:  boolean;
  openMobileMoreSheet:  () => void;
  closeMobileMoreSheet: () => void;
}

export const useUIStore = create<UIState>()((set, get) => ({
  openModal:                null,
  activeCollectionIdByView: {},
  endeavourPickerOpen:      false,
  purposePickerOpen:        false,
  manageOpen:               false,
  manageSection:            'endeavours',
  editingTaskId:      null,
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

  showAddTask:       () => set({ openModal: 'add-task', taskModalAdvanced: false, pendingParentId: null, quickAddPrefill: null }),
  showAddSubtask:    (parentId) => set({ openModal: 'add-task', taskModalAdvanced: true, pendingParentId: parentId ?? null, quickAddPrefill: null }),
  quickAddPrefill:        null,
  showAddTaskWithPrefill: (prefill) => set({ openModal: 'add-task', taskModalAdvanced: false, pendingParentId: null, quickAddPrefill: prefill }),
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
  showAddSchedule:   () => set({ openModal: 'add-schedule', editingSchedule: null }),
  openEditSchedule:  (schedule) => set({ openModal: 'add-schedule', editingSchedule: schedule }),
  closeEditSchedule: ()         => set({ openModal: null,           editingSchedule: null      }),

  closeModal:        () => set({
    openModal: null,
    taskModalAdvanced: false,
    pendingParentId: null,
    quickAddPrefill: null,
    editingTag: null,
    editingPurpose: null,
    editingCollection: null,
    editingActivity: null,
    editingSchedule: null,
    calendarItemDate: null,
    calendarItemKind: null,
    calendarItemTitle: null,
    editingEntryId: null,
    editingWatchlistItemId: null,
    editingListId: null,
    editingListItemId: null,
    pendingListItemListId: null,
    pendingListItemTabId: null,
    editingNoteMetaId: null,
  }),

  setActiveCollection: (id) => set((s) => ({
    activeCollectionIdByView: { ...s.activeCollectionIdByView, [s.activeView]: id },
  })),
  openEndeavourPicker:   () => set({ endeavourPickerOpen: true }),
  closeEndeavourPicker:  () => set({ endeavourPickerOpen: false }),
  toggleEndeavourPicker: () => set((s) => ({ endeavourPickerOpen: !s.endeavourPickerOpen })),
  openPurposePicker:     () => set({ purposePickerOpen: true }),
  closePurposePicker:    () => set({ purposePickerOpen: false }),
  togglePurposePicker:   () => set((s) => ({ purposePickerOpen: !s.purposePickerOpen })),
  openManage:            (section) => set({ manageOpen: true, manageSection: section ?? 'endeavours' }),
  closeManage:           () => set({ manageOpen: false }),
  toggleManage:          () => set((s) => ({ manageOpen: !s.manageOpen })),
  setManageSection:      (section) => set({ manageSection: section }),
  openTaskPane:        (id) => set({ editingTaskId: id }),
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

  sortField: 'createdAt',
  sortDir:   'desc',
  setSortField: (f, dir) => set({ sortField: f, sortDir: dir ?? DEFAULT_SORT_DIR[f] }),
  setSortDir:   (d)      => set({ sortDir: d }),

  activeView:    'tasks',
  setActiveView: (view, opts) => set((s) => {
    if (view === s.activeView) return {};
    return {
      activeView:          view,
      sectionHistory: opts?.skipHistory
        ? s.sectionHistory
        : [{ view: s.activeView }, ...s.sectionHistory].slice(0, MAX_SECTION_HISTORY),
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
      // Endeavour/Purpose filter dropdowns are section-scoped UI, not section-scoped
      // state — close them on any section switch so they don't reopen stale later.
      endeavourPickerOpen: false,
      purposePickerOpen:   false,
    };
  }),

  sectionHistory: [],
  navigateBack: () => {
    const [prev, ...rest] = get().sectionHistory;
    if (!prev) return;
    set({ sectionHistory: rest });
    get().setActiveView(prev.view, { skipHistory: true });
  },

  taskViewMode:    'overview',
  setTaskViewMode: (mode) => set({ taskViewMode: mode }),

  editingCalendarEventId:    null,
  editingCalendarReminderId: null,
  openCalendarEventPane:     (id) => set({ editingCalendarEventId: id }),
  closeCalendarEventPane:    ()   => set({ editingCalendarEventId: null }),
  openCalendarReminderPane:  (id) => set({ editingCalendarReminderId: id }),
  closeCalendarReminderPane: ()   => set({ editingCalendarReminderId: null }),

  calendarViewMode:    'month',
  setCalendarViewMode: (mode) => set({ calendarViewMode: mode }),

  calendarLayersOpen:   false,
  toggleCalendarLayers: () => set((s) => ({ calendarLayersOpen: !s.calendarLayersOpen })),
  closeCalendarLayers:  () => set({ calendarLayersOpen: false }),

  calendarItemDate:  null,
  calendarItemKind:  null,
  calendarItemTime:  null,
  calendarItemTitle: null,
  showAddCalendarItem: (date, kind, time, title) => set({
    openModal: 'add-calendar-item',
    calendarItemDate: date ?? null,
    calendarItemKind: kind ?? null,
    calendarItemTime: time ?? null,
    calendarItemTitle: title ?? null,
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
  setActiveTracker: (id) => set({ activeTrackerId: id, activeRoutineId: null }),
  showAddTracker:   () => set({ openModal: 'add-tracker', pendingTrackerId: null }),
  pendingTrackerId: null,
  showAddEntry:     (trackerId) => set({ openModal: 'add-entry', pendingTrackerId: trackerId, editingEntryId: null }),
  editingEntryId:   null,
  openEditEntry:    (id) => set({ editingEntryId: id, openModal: 'add-entry' }),
  closeEditEntry:   () => set({ editingEntryId: null, openModal: null }),
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
  setSelectedNoteTag:     (id) => set({ selectedNoteTagId: id }),
  expandedNoteTagIds:     [],
  toggleNoteTagExpanded:  (id) => set((s) => ({
    expandedNoteTagIds: s.expandedNoteTagIds.includes(id)
      ? s.expandedNoteTagIds.filter((x) => x !== id)
      : [...s.expandedNoteTagIds, id],
  })),
  pendingNoteTagParentId: null,
  pendingNoteTagKind:     'area',
  editingNoteId:          null,
  openNote:               (id) => set({ editingNoteId: id }),
  closeNote:              ()   => set({ editingNoteId: null }),
  notesLastEditingNoteId: null,
  notesLastActiveTabId:   null,
  setNotesLastActiveTab:  (tabId) => set({ notesLastActiveTabId: tabId }),
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
  openNoteTagView:        (tagIds) => set({ noteTagViewActive: true, noteTagViewTagIds: tagIds }),
  closeNoteTagView:       () => set({ noteTagViewActive: false, noteTagViewTagIds: [] }),
  toggleNoteTagViewTagId: (id) => set((s) => ({
    noteTagViewTagIds: s.noteTagViewTagIds.includes(id)
      ? s.noteTagViewTagIds.filter((x) => x !== id)
      : [...s.noteTagViewTagIds, id],
  })),
  noteTagViewReturn:    null,
  setNoteTagViewReturn: (ids) => set({ noteTagViewReturn: ids }),

  // Routines
  showAddRoutine:        () => set({ openModal: 'add-routine' }),
  editRoutineOpen:       false,
  editingRoutineId:      null,
  openEditRoutine:       (id) => set({ editRoutineOpen: true, editingRoutineId: id }),
  closeEditRoutine:      () => set({ editRoutineOpen: false, editingRoutineId: null }),
  activeRoutineId:       null,
  setActiveRoutine:      (id) => set({ activeRoutineId: id, activeTrackerId: null }),

  mobileBackConsumer:         null,
  registerMobileBackConsumer: (fn) => set({ mobileBackConsumer: fn }),

  mobileMoreSheetOpen:  false,
  openMobileMoreSheet:  () => set({ mobileMoreSheetOpen: true }),
  closeMobileMoreSheet: () => set({ mobileMoreSheetOpen: false }),
}));

// Android back-button priority list (docs/android/00-architecture.md §5d step 1: "is a
// modal/pane open per existing uiStore state — close it"). Checked most-commonly-nested-on-
// top first — this is a fixed priority order, not a real stack, which the architecture doc
// treats as acceptable since only one of these is ever meaningfully "on top" in practice.
// Returns true if something was closed (caller should treat the back press as handled).
export function closeTopmostMobileOverlay(): boolean {
  const s = useUIStore.getState();
  if (s.openModal !== null)                                { s.closeModal();             return true; }
  if (s.calendarQuickAddOpen)                               { s.closeCalendarQuickAdd();  return true; }
  if (s.editingTaskId !== null)                             { s.closeTaskPane();          return true; }
  if (s.editingCalendarEventId !== null)                    { s.closeCalendarEventPane(); return true; }
  if (s.editingCalendarReminderId !== null)                 { s.closeCalendarReminderPane(); return true; }
  if (s.editTrackerOpen)                                    { s.closeEditTracker();       return true; }
  if (s.editRoutineOpen)                                    { s.closeEditRoutine();       return true; }
  if (s.editActivityTypeOpen)                               { s.closeEditActivityType();  return true; }
  if (s.editNoteTagOpen)                                    { s.closeEditNoteTag();       return true; }
  if (s.noteTagViewActive)                                  { s.closeNoteTagView();       return true; }
  if (s.schedulesOpen)                                      { s.closeSchedules();         return true; }
  if (s.manageOpen)                                         { s.closeManage();            return true; }
  if (s.integrationsOpen)                                   { s.closeIntegrations();      return true; }
  if (s.accountOpen)                                        { s.closeAccount();           return true; }
  if (s.settingsOpen)                                       { s.closeSettings();          return true; }
  if (s.editingNoteId !== null && s.activeView !== 'notes') { s.closeNote();              return true; }
  if (s.mobileMoreSheetOpen)                                { s.closeMobileMoreSheet();   return true; }
  return false;
}

// The focused Endeavour for whichever section is currently active. Sections that don't
// show the Endeavour picker (Lists, Portfolio) simply never populate their entry.
export const selectActiveCollectionId = (s: UIState): string | null =>
  s.activeCollectionIdByView[s.activeView] ?? null;
