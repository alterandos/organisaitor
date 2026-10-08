import { useNoteStore } from '@/store/noteStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { liveNoteEditorFor } from '@/services/liveNoteEditor';
import { collectReviewPassages, updatePassageInContent, type ReviewPassage } from '@/utils/noteContent';
import { nextReview, type ReviewAnswer } from '@/components/NoteEditor/extensions/Importance';
import { todayIso } from '@/utils/date';
import type { NoteId } from '@/types';

// Review later: Important passages put on the review list (extensions/Importance.ts), across all
// notes. Their schedule lives on the passage's own mark, so answering rewrites that mark — through
// the editor if the passage's text is open there (services/liveNoteEditor.ts), else in the stored
// note. Locked encrypted notes are skipped until unlocked.

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
  const view = liveNoteEditorFor(item.noteId, item.tabId);
  if (view) {
    const tr = view.state.tr;
    view.state.doc.descendants((node, pos) => {
      if (!node.isText) return true;
      const m = node.marks.find((mk) => mk.type.name === 'noteTag' && mk.attrs.passageId === item.passageId);
      if (m) tr.addMark(pos, pos + node.nodeSize, m.type.create({ ...m.attrs, ...attrs }));
      return false;
    });
    if (tr.docChanged) view.dispatch(tr);
    return;
  }
  const store = useNoteStore.getState();
  const raw = store.notes[item.noteId as NoteId];
  if (!raw || isNoteLocked(raw)) return;
  const note = noteView(raw);
  if (item.tabId === null) {
    const res = updatePassageInContent(note.content, item.passageId, attrs);
    if (res.changed) store.updateNote(note.id, { content: res.content });
  } else {
    const tab = note.tabs.find((t) => t.id === item.tabId);
    const res = tab ? updatePassageInContent(tab.content, item.passageId, attrs) : null;
    if (res?.changed) store.updateNoteTabContent(note.id, item.tabId, res.content);
  }
}
