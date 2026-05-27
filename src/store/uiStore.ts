import { create } from 'zustand';
import type { Tag, Purpose, Collection, CalendarItemKind, TaskViewMode } from '@/types';

export type AppView = 'tasks' | 'calendar' | 'records' | 'portfolio';

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
  activeCollectionId: string | null;
  editingTaskId:      string | null;
  sidebarOpen:        boolean;
  activePurposeIds:   string[];
  activeTagIds:       string[];
  editingTag:         Tag        | null;
  editingPurpose:     Purpose    | null;
  editingCollection:  Collection | null;

  showAddTask:       () => void;
  showAddSubtask:    (parentId?: string) => void;
  showAddCollection: () => void;
  taskModalAdvanced: boolean;
  pendingParentId:   string | null;
  showAddPurpose:    () => void;
  showAddTag:        () => void;
  closeModal:        () => void;

  setActiveCollection:  (id: string | null) => void;
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
  setActiveView: (view: AppView) => void;

  taskViewMode:    TaskViewMode;
  setTaskViewMode: (mode: TaskViewMode) => void;

  editingCalendarEventId:    string | null;
  editingCalendarReminderId: string | null;
  openCalendarEventPane:     (id: string) => void;
  closeCalendarEventPane:    () => void;
  openCalendarReminderPane:  (id: string) => void;
  closeCalendarReminderPane: () => void;

  calendarItemDate: string | null;
  calendarItemKind: CalendarItemKind | null;
  showAddCalendarItem: (date?: string, kind?: CalendarItemKind) => void;

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
  routinesSectionOpen:    boolean;
  toggleRoutinesSection:  () => void;
  editRoutineOpen:        boolean;
  editingRoutineId:       string | null;
  openEditRoutine:        (id: string) => void;
  closeEditRoutine:       () => void;
  activeRoutineId:        string | null;
  setActiveRoutine:       (id: string | null) => void;

  // Portfolio
  showAddWatchlistItem:      () => void;
  showAddPortfolioTag:       () => void;
  showAddInvestmentPurpose:  () => void;
  showBulkUploadWatchlist:   () => void;
  editingWatchlistItemId:    string | null;
  openEditWatchlistItem:     (id: string) => void;
  portfolioChartOpen:        boolean;
  setPortfolioChartOpen:     (open: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  openModal:          null,
  activeCollectionId: null,
  editingTaskId:      null,
  sidebarOpen:        false,
  activePurposeIds:   [],
  activeTagIds:       [],
  editingTag:         null,
  editingPurpose:     null,
  editingCollection:  null,
  taskModalAdvanced:  false,
  pendingParentId:    null,

  showAddTask:       () => set({ openModal: 'add-task', taskModalAdvanced: false, pendingParentId: null }),
  showAddSubtask:    (parentId) => set({ openModal: 'add-task', taskModalAdvanced: true, pendingParentId: parentId ?? null }),
  showAddCollection: () => set({ openModal: 'add-collection' }),
  showAddPurpose:    () => set({ openModal: 'add-purpose'    }),
  showAddTag:        () => set({ openModal: 'add-tag'        }),
  closeModal:        () => set({
    openModal: null,
    taskModalAdvanced: false,
    pendingParentId: null,
    editingTag: null,
    editingPurpose: null,
    editingCollection: null,
    calendarItemDate: null,
    calendarItemKind: null,
    editingEntryId: null,
    editingWatchlistItemId: null,
  }),

  setActiveCollection: (id) => set({ activeCollectionId: id }),
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
  setActiveView: (view) => set({ activeView: view, portfolioChartOpen: false }),

  taskViewMode:    'overview',
  setTaskViewMode: (mode) => set({ taskViewMode: mode }),

  editingCalendarEventId:    null,
  editingCalendarReminderId: null,
  openCalendarEventPane:     (id) => set({ editingCalendarEventId: id }),
  closeCalendarEventPane:    ()   => set({ editingCalendarEventId: null }),
  openCalendarReminderPane:  (id) => set({ editingCalendarReminderId: id }),
  closeCalendarReminderPane: ()   => set({ editingCalendarReminderId: null }),

  calendarItemDate: null,
  calendarItemKind: null,
  showAddCalendarItem: (date, kind) => set({
    openModal: 'add-calendar-item',
    calendarItemDate: date ?? null,
    calendarItemKind: kind ?? null,
  }),

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

  // Portfolio
  showAddWatchlistItem:     () => set({ openModal: 'add-watchlist-item', editingWatchlistItemId: null }),
  showAddPortfolioTag:      () => set({ openModal: 'add-portfolio-tag'     }),
  showAddInvestmentPurpose: () => set({ openModal: 'add-investment-purpose'}),
  showBulkUploadWatchlist:  () => set({ openModal: 'bulk-upload-watchlist' }),
  editingWatchlistItemId:   null,
  openEditWatchlistItem:    (id) => set({ openModal: 'add-watchlist-item', editingWatchlistItemId: id }),
  portfolioChartOpen:       false,
  setPortfolioChartOpen:    (open) => set({ portfolioChartOpen: open }),

  // Routines
  showAddRoutine:        () => set({ openModal: 'add-routine' }),
  routinesSectionOpen:   true,
  toggleRoutinesSection: () => set((s) => ({ routinesSectionOpen: !s.routinesSectionOpen })),
  editRoutineOpen:       false,
  editingRoutineId:      null,
  openEditRoutine:       (id) => set({ editRoutineOpen: true, editingRoutineId: id }),
  closeEditRoutine:      () => set({ editRoutineOpen: false, editingRoutineId: null }),
  activeRoutineId:       null,
  setActiveRoutine:      (id) => set({ activeRoutineId: id, activeTrackerId: null }),
}));
