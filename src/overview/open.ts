import { useUIStore } from '@/store/uiStore';
import { openItem } from '@/services/openItem';
import { openInboxItem } from '@/services/noteInbox';
import { openNotePassage } from '@/services/notePassage';
import { reviewFinds } from '@/utils/noteContent';
import type { OverviewRow } from '@/types/overview';

// Opens an Overview row in its own app — the same places a link goes (services/openItem.ts) where
// one exists, plus the kinds links don't cover yet.
export function openOverviewRow(row: OverviewRow): void {
  const ui = useUIStore.getState();
  switch (row.source) {
    case 'task': case 'event': case 'reminder': case 'deadline': case 'list':
    case 'note': case 'listItem': case 'trackerEntry':
      // A repeating item's row stands for one of its dates: open that date, not the series' first.
      openItem(row.source, row.id, { occurrence: row.occurrence });
      return;
    case 'inboxItem': {
      const [noteId, itemId] = row.id.split(':');
      openInboxItem(noteId, itemId);
      return;
    }
    case 'question': {
      const [noteId, qid] = row.id.split(':');
      openNotePassage(noteId, { node: 'questionBlock', attr: 'qid', value: qid });
      return;
    }
    case 'review': {
      const [noteId, , passageId] = row.id.split(':');
      openNotePassage(noteId, reviewFinds(passageId));
      return;
    }
    case 'rhythm': {
      // id is the occurrence's tickKey: rhythm|stream|date. Its rhythm, in Records.
      ui.setActiveView('records');
      ui.setActiveRoutine(row.id.split('|')[0]);
      return;
    }
  }
}
