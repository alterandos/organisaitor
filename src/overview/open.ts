import { useUIStore } from '@/store/uiStore';
import { useListStore } from '@/store/listStore';
import { useTrackerStore } from '@/store/trackerStore';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import type { OverviewRow } from '@/types/overview';

// Opens an Overview row in its own app — the same places a cross-app link goes (openArtifactTarget)
// where one exists, plus the kinds links don't cover yet.
export function openOverviewRow(row: OverviewRow): void {
  const ui = useUIStore.getState();
  switch (row.source) {
    case 'task': case 'event': case 'reminder': case 'deadline': case 'list':
      openArtifactTarget(row.source, row.id);
      return;
    case 'note':
      ui.setActiveView('notes');
      ui.openNote(row.id);
      return;
    case 'listItem': {
      const item = useListStore.getState().listItems[row.id as never];
      if (!item) return;
      ui.setListsLastActive(item.listId, item.tabId);
      ui.setActiveView('lists');
      ui.openEditListItem(row.id);
      return;
    }
    case 'trackerEntry': {
      const entry = useTrackerStore.getState().entries[row.id as never];
      if (!entry) return;
      ui.setActiveView('records');
      ui.setActiveTracker(entry.trackerId);
      ui.openEditEntry(row.id);
      return;
    }
  }
}
