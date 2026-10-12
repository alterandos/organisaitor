import { useNoteStore } from '@/store/noteStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { editNoteContent } from '@/services/noteContentEdit';
import { collectReviewPassages, updatePassageInContent, type ReviewPassage } from '@/utils/noteContent';
import { nextReview, type ReviewAnswer } from '@/components/NoteEditor/extensions/Importance';
import { todayIso } from '@/utils/date';

// Review later: Important passages put on the review list (extensions/Importance.ts), across all
// notes. Their schedule lives on the passage's own mark, so answering rewrites that mark (services/noteContentEdit.ts: through
// the editor if the passage's text is open there, else in the stored note). Locked encrypted notes are skipped until unlocked.

export interface ReviewItem extends ReviewPassage {
  noteId:    string;
  tabId:     string | null;   // null = the main tab
  noteTitle: string;
}

export function reviewItems(): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const raw of Object.values(useNoteStore.getState().notes)) {
    if (isNoteLocked(raw)) continue;
    const note = noteView(raw);
    const add = (json: string, tabId: string | null) => {
      for (const p of collectReviewPassages(json)) out.push({ ...p, noteId: note.id, tabId, noteTitle: note.title });
    };
    add(note.content, null);
    for (const tab of note.tabs) add(tab.content, tab.id);
  }
  return out.sort((a, b) => a.reviewDue.localeCompare(b.reviewDue) || a.noteTitle.localeCompare(b.noteTitle));
}

export const dueReviews = (today = todayIso()) => reviewItems().filter((r) => r.reviewDue <= today);

export function answerReview(item: ReviewItem, answer: ReviewAnswer, today = todayIso()): void {
  const next = nextReview(item.reviewStep, answer, today);
  const attrs = { reviewDue: next.due, reviewStep: next.step };
  editNoteContent(item.noteId, item.tabId, {
    inEditor: (tr) => {
      tr.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        const m = node.marks.find((mk) => mk.type.name === 'noteTag' && mk.attrs.passageId === item.passageId);
        if (m) tr.addMark(pos, pos + node.nodeSize, m.type.create({ ...m.attrs, ...attrs }));
        return false;
      });
      return true;
    },
    inJson: (json) => {
      const res = updatePassageInContent(json, item.passageId, attrs);
      return res.changed ? res.content : null;
    },
  });
}
