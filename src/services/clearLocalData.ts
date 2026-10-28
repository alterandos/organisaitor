import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { clearMicrosoftCursors } from '@/services/microsoftCalendar';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useOverviewStore } from '@/store/overviewStore';
import { useConverterStore } from '@/store/converterStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useNoteStore } from '@/store/noteStore';
import { usePictureStore } from '@/store/pictureStore';
import { useTrashStore } from '@/store/trashStore';
import { useListStore } from '@/store/listStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useRecentItemsStore } from '@/store/recentItemsStore';
import { usePinnedItemsStore } from '@/store/pinnedItemsStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useUIStore } from '@/store/uiStore';
import { useAgentLogStore } from '@/store/agentLogStore';
import { useAgentBatchStore } from '@/store/agentBatchStore';
import { useFitnessStore } from '@/store/fitnessStore';

// Empties this device's copy of every CLOUD-SYNCED store (the persist middleware rewrites each
// store's localStorage key with the empty state, so nothing is left behind there either) plus
// the account-specific memory that points into that data. Callers must stopSync() first and
// must have confirmed the data is in the cloud — see requestSignOut() in ./signOut.ts.
//
// Deliberately NOT touched, because it exists only on this device and wiping it would destroy
// the user's only copy: routineStore, portfolioStore.columnConfig, settingsStore,
// hotkeyOverridesStore, notificationStore.notifiedLog. When one of those gains cloud sync, add
// it here in the same change.
//
// Each store is reset from its own getInitialState(), so seeded defaults (built-in list types,
// the portfolio's investment-purpose seeds) come back exactly as on a fresh install.
export function clearSyncedLocalData(): void {
  const task = useTaskStore.getInitialState();
  useTaskStore.setState({ tasks: task.tasks, collections: task.collections, tags: task.tags, purposes: task.purposes });

  const calendar = useCalendarStore.getInitialState();
  // The import keys too: they name the account's imported events, and a next account on this
  // device importing the same Google calendar must not find them "already deleted".
  useCalendarStore.setState({ events: calendar.events, reminders: calendar.reminders, deadlines: calendar.deadlines, importedSourceKeys: [] });
  clearMicrosoftCursors();

  useTrackerStore.setState({ entries: useTrackerStore.getInitialState().entries });
  useScheduleStore.setState({ schedules: useScheduleStore.getInitialState().schedules });
  useOverviewStore.setState({ overviews: useOverviewStore.getInitialState().overviews });
  useConverterStore.setState({ converters: useConverterStore.getInitialState().converters, recent: [] });
  useItemTypeStore.setState({ types: useItemTypeStore.getInitialState().types });
  usePinnedItemsStore.setState({ pins: usePinnedItemsStore.getInitialState().pins });
  // Synced since 2026-10-22 (before that it stayed on the device, and showed under the next account).
  const fitness = useFitnessStore.getInitialState();
  useFitnessStore.setState({ activities: fitness.activities, activityTypes: fitness.activityTypes });

  const note = useNoteStore.getInitialState();
  useNoteStore.setState({ notes: note.notes, noteTags: note.noteTags, structuredTagEntries: note.structuredTagEntries });

  usePictureStore.setState({ pictures: usePictureStore.getInitialState().pictures });
  // Synced (trash_items), and its snapshots are the account's deleted records.
  useTrashStore.setState({ entries: useTrashStore.getInitialState().entries });

  const list = useListStore.getInitialState();
  useListStore.setState({ lists: list.lists, listItems: list.listItems, listTypes: list.listTypes });

  const portfolio = usePortfolioStore.getInitialState();
  usePortfolioStore.setState({
    watchlistItems:     portfolio.watchlistItems,
    portfolioTags:      portfolio.portfolioTags,
    investmentPurposes: portfolio.investmentPurposes,
  });

  // Local-only, but the batches hold copies of the account's records, so they go with it.
  useAgentLogStore.getState().clear();
  useAgentBatchStore.getState().clear();

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
