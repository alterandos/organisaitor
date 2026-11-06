import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked, isNoteLocked, noteView } from '@/services/noteSecrets';
import { editNoteContent } from '@/services/noteContentEdit';
import { openGlossaryEntry, openNotePassage } from '@/services/notePassage';
import { collectReviewPassages, reviewFinds, updatePassageInContent, type ReviewPassage } from '@/utils/noteContent';
import { NOTE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';
import { REVIEW_MARK, nextReview, recordReview, setRecordReview, type ReviewAnswer } from '@/components/NoteEditor/extensions/ReviewMark';
import { todayIso } from '@/utils/date';

// Review later, across all notes: passages of text, whole blocks and Glossary cards put on the
// review list (extensions/ReviewMark.ts; and passages put on it before 2026-11-05, whose schedule is
// on their Important mark). A passage's or block's schedule lives in its note, so answering rewrites
// it there (services/noteContentEdit.ts: through the editor if that text is open, else in the stored
// note); a card's on its record. Locked encrypted notes and records are skipped until unlocked.

export interface ReviewItem extends Omit<ReviewPassage, 'where'> {
  where:     ReviewPassage['where'] | 'card';
  noteId:    string;          // a card made in the Glossary: ''
  tabId:     string | null;   // null = the main tab
  noteTitle: string;
  entryId:   string | null;   // a card's record
}

export function reviewItems(): ReviewItem[] {
  const { notes, structuredTagEntries } = useNoteStore.getState();
  const out: ReviewItem[] = [];
  for (const raw of Object.values(notes)) {
    if (isNoteLocked(raw)) continue;
    const note = noteView(raw);
    const add = (json: string, tabId: string | null) => {
      for (const p of collectReviewPassages(json)) out.push({ ...p, noteId: note.id, tabId, noteTitle: note.title, entryId: null });
    };
    add(note.content, null);
    for (const tab of note.tabs) add(tab.content, tab.id);
  }
  for (const raw of Object.values(structuredTagEntries)) {
    if (isEntryLocked(raw)) continue;
    const e = entryView(raw);
    const r = recordReview(e.fields);
    if (!r) continue;
    const note = e.noteId ? notes[e.noteId as never] : undefined;
    out.push({
      passageId: r.id, where: 'card', text: e.term, context: '', level: 0, reviewDue: r.due, reviewStep: r.step,
      noteId: e.noteId ?? '', tabId: null, noteTitle: note && !isNoteLocked(note) ? noteView(note).title : '', entryId: e.id,
    });
  }
  return out.sort((a, b) => a.reviewDue.localeCompare(b.reviewDue) || a.noteTitle.localeCompare(b.noteTitle));
}

export const dueReviews = (today = todayIso()) => reviewItems().filter((r) => r.reviewDue <= today);

export function openReviewItem(item: ReviewItem): void {
  if (item.entryId) { openGlossaryEntry(item.entryId); return; }
  openNotePassage(item.noteId, reviewFinds(item.passageId));
}

export function answerReview(item: ReviewItem, answer: ReviewAnswer, today = todayIso()): void {
  const next = nextReview(item.reviewStep, answer, today);
  if (item.entryId) {
    setRecordReview(item.entryId, next.due ? { id: item.passageId, due: next.due, step: next.step ?? 0 } : null);
    return;
  }
  const attrs = { reviewDue: next.due, reviewStep: next.step };
  const id = item.passageId;
  editNoteContent(item.noteId, item.tabId, {
    inEditor: (tr) => {
      const reviewType = tr.doc.type.schema.marks[REVIEW_MARK];
      // A passage from before, on its Important mark: answering moves its schedule onto a review mark.
      const legacy: { from: number; to: number; mark: import('@tiptap/pm/model').Mark }[] = [];
      const pieces: { from: number; to: number }[] = [];
      let block = -1;
      tr.doc.descendants((node, pos) => {
        if (NOTE_BLOCK_NODES.has(node.type.name) && node.attrs.reviewId === id) block = pos;
        if (!node.isText) return true;
        for (const m of node.marks) {
          if (m.type.name === 'noteTag' && m.attrs.passageId === id && m.attrs.reviewDue) legacy.push({ from: pos, to: pos + node.nodeSize, mark: m });
          if (m.type === reviewType && m.attrs.reviewId === id) pieces.push({ from: pos, to: pos + node.nodeSize });
        }
        return false;
      });
      for (const l of legacy) {
        tr.addMark(l.from, l.to, l.mark.type.create({ ...l.mark.attrs, reviewDue: null, reviewStep: null }));
        if (reviewType) pieces.push({ from: l.from, to: l.to });
      }
      if (reviewType) {
        for (const p of pieces) {
          tr.removeMark(p.from, p.to, reviewType);
          if (next.due) tr.addMark(p.from, p.to, reviewType.create({ reviewId: id, ...attrs }));
        }
      }
      if (block >= 0) {
        const node = tr.doc.nodeAt(block)!;
        tr.setNodeMarkup(block, undefined, { ...node.attrs, ...(next.due ? attrs : { reviewId: null, reviewDue: null, reviewStep: null }) });
      }
      return legacy.length + pieces.length > 0 || block >= 0;
    },
    inJson: (json) => {
      const res = updatePassageInContent(json, id, attrs);
      return res.changed ? res.content : null;
    },
  });
}
