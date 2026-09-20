import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useRecentItemsStore } from '@/store/recentItemsStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useUIStore } from '@/store/uiStore';

// Empties this device's copy of every CLOUD-SYNCED store (the persist middleware rewrites each
// store's localStorage key with the empty state, so nothing is left behind there either) plus
// the account-specific memory that points into that data. Callers must stopSync() first and
// must have confirmed the data is in the cloud — see requestSignOut() in ./signOut.ts.
//
// Deliberately NOT touched, because it exists only on this device and wiping it would destroy
// the user's only copy: fitnessStore, routineStore, portfolioStore.columnConfig, settingsStore,
// hotkeyOverridesStore, notificationStore.notifiedLog. When one of those gains cloud sync, add
// it here in the same change.
//
// Each store is reset from its own getInitialState(), so seeded defaults (built-in list types,
// the portfolio's investment-purpose seeds) come back exactly as on a fresh install.
export function clearSyncedLocalData(): void {
  const task = useTaskStore.getInitialState();
  useTaskStore.setState({ tasks: task.tasks, collections: task.collections, tags: task.tags, purposes: task.purposes });

  const calendar = useCalendarStore.getInitialState();
  useCalendarStore.setState({ events: calendar.events, reminders: calendar.reminders });

  useTrackerStore.setState({ entries: useTrackerStore.getInitialState().entries });
  useScheduleStore.setState({ schedules: useScheduleStore.getInitialState().schedules });

  const note = useNoteStore.getInitialState();
  useNoteStore.setState({ notes: note.notes, noteTags: note.noteTags, structuredTagEntries: note.structuredTagEntries });

  const list = useListStore.getInitialState();
  useListStore.setState({ lists: list.lists, listItems: list.listItems, listTypes: list.listTypes });

  const portfolio = usePortfolioStore.getInitialState();
  usePortfolioStore.setState({
    watchlistItems:     portfolio.watchlistItems,
    portfolioTags:      portfolio.portfolioTags,
    investmentPurposes: portfolio.investmentPurposes,
  });

  useRecentItemsStore.setState({ items: {} });
  useNotificationStore.setState({ pending: [] });

  useUIStore.setState({
    activeCollectionIdByView: {},
    activePurposeIds:         [],
    activeTagIds:             [],
    activeTrackerId:          null,
    activeRoutineId:          null,
    selectedNoteTagId:        null,
    notesLastEditingNoteId:   null,
    notesLastActiveTabId:     null,
    listsLastActiveListId:    null,
    listsLastActiveTabId:     null,
    editingTaskId:                null,
    editingCalendarEventId:       null,
    editingCalendarReminderId:    null,
  });
}
