import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { createReviewIcon } from '@/components/Icons';
import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked } from '@/services/noteSecrets';
import { addDaysToIso, formatDate, todayIso } from '@/utils/date';
import { NOTE_BLOCK_NODES } from '../blockNodes';
import { openBlockPopover, pillButton, popoverClass, registerPillAddition } from './blockDesigns';
import { refreshMarginColumns, registerMarginSource } from './MarginColumn';
import { setImportance, collectImportantPassages } from './Importance';

// Review later as a mark of its own (2026-11-05; before, it rode on the Important mark, so a
// passage had to be Important to be reviewed and a whole block couldn't be). A passage of text, a
// whole block or a Glossary card can be on the review list, each with its own schedule:
//
//   text   the `review` mark: reviewId (one mark across the pieces of its passage), reviewDue,
//          reviewStep
//   block  the same three as global attributes on every block but a Glossary card
//   card   its record's `review` field ({ id, due, step }), so every card of a term agrees
//
// The Review view (services/noteReview.ts) reads all three, and the old way (an Important mark
// carrying reviewDue) too, for passages put on the list before; answering one of those moves it
// onto a review mark. Drawn as a light dotted underline and its icon in the margin column.

export const REVIEW_MARK = 'review';

// Days until the next review after each successful one; "Again" starts over at the first.
export const REVIEW_INTERVALS = [1, 3, 7, 16, 35, 90];

export type ReviewAnswer = 'again' | 'good' | 'stop';

// The schedule after reviewing something at `step`.
export function nextReview(step: number | null, answer: ReviewAnswer, today = todayIso()): { due: string | null; step: number | null } {
  if (answer === 'stop') return { due: null, step: null };
  if (answer === 'again') return { due: addDaysToIso(today, REVIEW_INTERVALS[0]), step: 0 };
  const next = Math.min((step ?? 0) + 1, REVIEW_INTERVALS.length - 1);
  return { due: addDaysToIso(today, REVIEW_INTERVALS[next]), step: next };
}
export interface ReviewSchedule { id: string; due: string; step: number }

const firstReview = (today = todayIso()) => ({ due: addDaysToIso(today, REVIEW_INTERVALS[0]), step: 0 });

export const ReviewMarkType = Mark.create({
  name: REVIEW_MARK,
  inclusive: false,
  addAttributes() {
    return {
      reviewId: { default: null, parseHTML: (el) => el.getAttribute('data-review-id'), renderHTML: (a) => (a.reviewId ? { 'data-review-id': a.reviewId } : {}) },
      reviewDue: { default: null, parseHTML: (el) => el.getAttribute('data-review-due'), renderHTML: (a) => (a.reviewDue ? { 'data-review-due': a.reviewDue } : {}) },
      reviewStep: { default: null, parseHTML: (el) => { const n = Number(el.getAttribute('data-review-step')); return Number.isFinite(n) ? n : null; }, renderHTML: (a) => (a.reviewStep != null ? { 'data-review-step': String(a.reviewStep) } : {}) },
    };
  },
  parseHTML() { return [{ tag: 'span[data-review]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-review': '' }), 0]; },
});

export interface ReviewRun extends ReviewSchedule { from: number; to: number }

// The passages on the review list (a review mark with a due date), in order.
export function collectReviewRuns(doc: PMNode): ReviewRun[] {
  const runs = new Map<string, ReviewRun>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const m = node.marks.find((x) => x.type.name === REVIEW_MARK && x.attrs.reviewId && x.attrs.reviewDue);
    if (!m) return false;
    const id = m.attrs.reviewId as string;
    const run = runs.get(id);
    if (run) run.to = pos + node.nodeSize;
    else runs.set(id, { id, due: m.attrs.reviewDue, step: Number(m.attrs.reviewStep ?? 0), from: pos, to: pos + node.nodeSize });
    return false;
  });
  return [...runs.values()];
}

// Whether from..to is on the review list: a review mark, or (from before) an Important mark with a date.
export function reviewingIn(state: EditorState, from: number, to: number): boolean {
  let on = false;
  state.doc.nodesBetween(from, to, (n) => {
    if (on || !n.isText) return !on;
    on = n.marks.some((m) => (m.type.name === REVIEW_MARK && !!m.attrs.reviewDue) || (m.type.name === 'noteTag' && m.attrs.typeKey === 'important' && !!m.attrs.reviewDue));
    return false;
  });
  return on;
}

// Puts from..to on the review list (first due tomorrow), or takes it off if it's on it.
export function toggleReview(view: EditorView, from: number, to: number, today = todayIso()): void {
  const type = view.state.schema.marks[REVIEW_MARK];
  if (!type || from >= to) return;
  if (reviewingIn(view.state, from, to)) {
    const tr = view.state.tr.removeMark(from, to, type);
    view.dispatch(tr);
    // From before: the schedule on an Important mark comes off it; the importance stays.
    const legacy = collectImportantPassages(view.state.doc).find((p) => p.reviewDue && p.from < to && p.to > from);
    if (legacy) setImportance(view, legacy.from, legacy.to, legacy.level, { due: null, step: null });
    return;
  }
  const r = firstReview(today);
  view.dispatch(view.state.tr.addMark(from, to, type.create({ reviewId: nanoid(10), reviewDue: r.due, reviewStep: r.step })));
}

// A review mark's schedule rewritten (or taken off: due null), on every piece of its passage.
export function setReviewRun(tr: Transaction, id: string, due: string | null, step: number | null): boolean {
  const type = tr.doc.type.schema.marks[REVIEW_MARK];
  if (!type) return false;
  const pieces: { from: number; to: number }[] = [];
  tr.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    if (node.marks.some((m) => m.type === type && m.attrs.reviewId === id)) pieces.push({ from: pos, to: pos + node.nodeSize });
    return false;
  });
  for (const p of pieces) {
    tr.removeMark(p.from, p.to, type);
    if (due) tr.addMark(p.from, p.to, type.create({ reviewId: id, reviewDue: due, reviewStep: step }));
  }
  return pieces.length > 0;
}

// ── Whole blocks and cards ──────────────────────────────────────────────────

const RECORD_NODES = new Set(['glossaryCard']);
const ATTR_NODES = [...NOTE_BLOCK_NODES].filter((n) => !RECORD_NODES.has(n));
export const RECORD_REVIEW_FIELD = 'review';

export function recordReview(fields: Record<string, unknown> | undefined): ReviewSchedule | null {
  const v = fields?.[RECORD_REVIEW_FIELD] as { id?: unknown; due?: unknown; step?: unknown } | undefined;
  return v && typeof v.id === 'string' && typeof v.due === 'string' ? { id: v.id, due: v.due, step: Number(v.step ?? 0) } : null;
}
export function nodeReview(attrs: Record<string, unknown>): ReviewSchedule | null {
  return typeof attrs.reviewId === 'string' && typeof attrs.reviewDue === 'string' ? { id: attrs.reviewId, due: attrs.reviewDue, step: Number(attrs.reviewStep ?? 0) } : null;
}
export const reviewAttrs = (r: ReviewSchedule | null) => ({ reviewId: r?.id ?? null, reviewDue: r?.due ?? null, reviewStep: r?.step ?? null });

const recordOf = (entryId: unknown) => {
  const raw = entryId ? useNoteStore.getState().structuredTagEntries[entryId as never] : undefined;
  return raw && !isEntryLocked(raw) ? raw : null;
};

export function setRecordReview(entryId: string, r: ReviewSchedule | null): void {
  const raw = recordOf(entryId);
  if (!raw) return;
  const fields = { ...entryView(raw).fields };
  if (r) fields[RECORD_REVIEW_FIELD] = { id: r.id, due: r.due, step: r.step }; else delete fields[RECORD_REVIEW_FIELD];
  useNoteStore.getState().updateStructuredTagEntry(raw.id, { fields });
}

export function blockReview(state: EditorState, pos: number): ReviewSchedule | null {
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  if (RECORD_NODES.has(node.type.name)) { const r = recordOf(node.attrs.entryId); return r ? recordReview(entryView(r).fields) : null; }
  return nodeReview(node.attrs);
}

export function toggleBlockReview(view: EditorView, pos: number, today = todayIso()): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !NOTE_BLOCK_NODES.has(node.type.name) || !view.editable) return;
  const next = blockReview(view.state, pos) ? null : { id: nanoid(10), ...firstReview(today) };
  if (RECORD_NODES.has(node.type.name)) {
    if (node.attrs.entryId) setRecordReview(node.attrs.entryId as string, next);
    refreshMarginColumns();
    return;
  }
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...reviewAttrs(next) }));
}

// For a block drawn by a node view (applyFrameAttrs) and a Glossary card: shows the pill pressed.
export function applyReviewAttr(dom: HTMLElement, r: ReviewSchedule | null): void {
  if (r) dom.setAttribute('data-block-reviewing', r.due); else dom.removeAttribute('data-block-reviewing');
}

const L = LABELS.importance;
const dueTitle = (due: string) => `${L.reviewLater} · ${L.due(formatDate(due))}`;

function openReviewPopover(anchor: DOMRect, due: string, stop: () => void): void {
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = popoverClass.heading;
    heading.textContent = dueTitle(due);
    const row = document.createElement('div');
    row.className = popoverClass.row;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = popoverClass.choice;
    b.textContent = L.stopReviewing;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { close(); stop(); });
    row.append(b);
    box.append(heading, row);
    return box;
  });
}

// One button in every block's pill, pressed (CSS, from data-block-reviewing) while on the list.
registerPillAddition('review', (view, blockPos) => {
  const b = pillButton(L.reviewLater, () => { const p = blockPos(); if (p !== undefined) toggleBlockReview(view, p); });
  b.setAttribute('data-block-review', '');
  b.append(createReviewIcon());
  return b;
});

// The Review icon in the margin column: a passage on the list, a whole block or card.
registerMarginSource('review', (state) => collectReviewRuns(state.doc).map((r) => ({
  key: `review-${r.id}`,
  from: r.from,
  to: r.to,
  icon: () => createReviewIcon(),
  color: 'var(--color-primary)',
  title: dueTitle(r.due),
  open: (view, anchor) => openReviewPopover(anchor, r.due, () => { const tr = view.state.tr; if (setReviewRun(tr, r.id, null, null)) view.dispatch(tr); }),
})));
registerMarginSource('review-blocks', (state) => {
  const out: ReturnType<Parameters<typeof registerMarginSource>[1]> = [];
  state.doc.descendants((node, pos) => {
    if (!NOTE_BLOCK_NODES.has(node.type.name)) return !node.isTextblock;
    const r = blockReview(state, pos);
    if (r) out.push({ key: `review-block-${r.id}`, from: pos, to: pos + node.nodeSize, icon: () => createReviewIcon(), color: 'var(--color-primary)', title: dueTitle(r.due),
      open: (view, anchor) => openReviewPopover(anchor, r.due, () => toggleBlockReview(view, pos)) });
    return false;
  });
  return out;
});

// The attributes on every block but a Glossary card (whose schedule is its record's).
export const BlockReview = Extension.create({
  name: 'blockReview',
  addGlobalAttributes() {
    const str = (data: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(data) || null,
      renderHTML: () => ({}),
    });
    return [{
      types: ATTR_NODES,
      attributes: {
        // Drawn once, as data-block-reviewing (the due date), for the pill's pressed state.
        reviewId: { ...str('data-block-review-id'), renderHTML: (a: Record<string, unknown>) => (a.reviewId && a.reviewDue ? { 'data-block-review-id': String(a.reviewId), 'data-block-reviewing': String(a.reviewDue) } : {}) },
        reviewDue: { ...str('data-block-reviewing') },
        reviewStep: { default: null, parseHTML: (el: HTMLElement) => { const n = Number(el.getAttribute('data-block-review-step')); return Number.isFinite(n) && el.hasAttribute('data-block-review-step') ? n : null; },
          renderHTML: (a: Record<string, unknown>) => (a.reviewStep != null && a.reviewDue ? { 'data-block-review-step': String(a.reviewStep) } : {}) },
      },
    }];
  },
});

export const ReviewExtensions = [ReviewMarkType, BlockReview];
