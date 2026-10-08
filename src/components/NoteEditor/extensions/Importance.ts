import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { addDaysToIso, todayIso } from '@/utils/date';
import { BUILTIN_TAGS } from '../builtinTags';
import { IMPORTANCE_LEVELS, importanceLevel } from './importanceLevels';

// Important passages, built out (2026-10-07): three levels (Important, Very important, Critical),
// a marker in the margin beside each, a Key points list (NoteTOC), and Review later — a light
// spaced-repetition list of passages to come back to (NotesSection/ReviewView). All of it lives
// on the Important tag's own mark (NoteTagMark: level, passageId, reviewDue, reviewStep), so it
// syncs and encrypts with the note and needs no store of its own.

export const IMPORTANT_TAG = BUILTIN_TAGS.find((t) => t.typeKey === 'important')!;

// Days until the next review after each successful one; "Again" starts over at the first.
export const REVIEW_INTERVALS = [1, 3, 7, 16, 35, 90];

export interface ImportantPassage {
  passageId:  string | null;
  level:      1 | 2 | 3;
  text:       string;
  from:       number;
  to:         number;
  reviewDue:  string | null;
  reviewStep: number | null;
}

const isImportant = (m: { type: { name: string }; attrs: Record<string, unknown> }) => m.type.name === 'noteTag' && m.attrs.typeKey === 'important';

// Every Important passage in a document, in order: a run of marked text with one passageId (or,
// for one made before passages had ids, one unbroken run).
export function collectImportantPassages(doc: PMNode): ImportantPassage[] {
  const out: ImportantPassage[] = [];
  let current: ImportantPassage | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find(isImportant);
    if (mark) {
      const id = (mark.attrs.passageId as string | null) ?? null;
      if (current && current.passageId === id && (id !== null || current.to === pos)) {
        current.to = pos + node.nodeSize;
        current.text += node.text;
      } else {
        current = {
          passageId: id, level: importanceLevel(mark.attrs.level).level, text: node.text ?? '', from: pos, to: pos + node.nodeSize,
          reviewDue: (mark.attrs.reviewDue as string | null) ?? null, reviewStep: (mark.attrs.reviewStep as number | null) ?? null,
        };
        out.push(current);
      }
    } else if (node.text?.trim()) {
      current = null;
    }
    return false;
  });
  return out;
}

// The Important mark's attributes already on from..to (the first found), if any.
function importantAttrsIn(state: EditorState, from: number, to: number): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (found || !node.isText) return !found;
    const m = node.marks.find(isImportant);
    if (m) found = m.attrs;
    return false;
  });
  return found;
}

// Marks from..to Important at `level`, keeping its passage id and review schedule if it already
// was; null takes Important off.
export function setImportance(view: EditorView, from: number, to: number, level: 1 | 2 | 3 | null, review?: { due: string | null; step: number | null }): void {
  const type = view.state.schema.marks.noteTag;
  if (!type || from >= to) return;
  const tr = view.state.tr;
  const existing = importantAttrsIn(view.state, from, to);
  if (level === null) {
    view.state.doc.nodesBetween(from, to, (node, pos) => {
      const m = node.isText ? node.marks.find(isImportant) : undefined;
      if (m) tr.removeMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), m);
    });
  } else {
    tr.addMark(from, to, type.create({
      tagId: IMPORTANT_TAG.id, color: IMPORTANT_TAG.color, typeKey: 'important', level,
      passageId: (existing?.passageId as string | null) ?? nanoid(10),
      reviewDue: review ? review.due : (existing?.reviewDue ?? null),
      reviewStep: review ? review.step : (existing?.reviewStep ?? null),
    }));
  }
  view.dispatch(tr);
}

// Ctrl+1 on a selection: Important, then Very important, then Critical, then off.
export function cycleImportance(view: EditorView): void {
  const { from, to } = view.state.selection;
  const existing = importantAttrsIn(view.state, from, to);
  const level = existing ? importanceLevel(existing.level).level : 0;
  setImportance(view, from, to, level >= 3 ? null : ((level + 1) as 1 | 2 | 3));
}

// "Review later": makes the passage Important (if it wasn't) and puts it on the review list,
// first due tomorrow — or takes it off the list if it was on it.
export function toggleReview(view: EditorView, from: number, to: number, today = todayIso()): void {
  const existing = importantAttrsIn(view.state, from, to);
  const level = existing ? importanceLevel(existing.level).level : 1;
  const on = !existing?.reviewDue;
  setImportance(view, from, to, level, on ? { due: addDaysToIso(today, REVIEW_INTERVALS[0]), step: 0 } : { due: null, step: null });
}

export type ReviewAnswer = 'again' | 'good' | 'stop';

// The schedule after reviewing a passage at `step`.
export function nextReview(step: number | null, answer: ReviewAnswer, today = todayIso()): { due: string | null; step: number | null } {
  if (answer === 'stop') return { due: null, step: null };
  if (answer === 'again') return { due: addDaysToIso(today, REVIEW_INTERVALS[0]), step: 0 };
  const next = Math.min((step ?? 0) + 1, REVIEW_INTERVALS.length - 1);
  return { due: addDaysToIso(today, REVIEW_INTERVALS[next]), step: next };
}

// ── The margin markers ───────────────────────────────────────────────────────

// A marker in the left margin beside every line block that holds an Important passage: the
// highest level's icon, and 🔁 when one is on the review list. Absolutely placed at the start of
// the block, so it takes no room in the text.
function markerDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let level = 0;
    let review = false;
    node.forEach((child) => {
      const m = child.marks.find(isImportant);
      if (!m) return;
      level = Math.max(level, importanceLevel(m.attrs.level).level);
      if (m.attrs.reviewDue) review = true;
    });
    if (level > 0) {
      const info = IMPORTANCE_LEVELS[level - 1];
      decos.push(Decoration.widget(pos + 1, () => marker(info.icon, info.label, info.color, review), {
        side: -1, key: `important-${level}-${review}`, ignoreSelection: true, marks: [],
      }));
    }
    return false;
  });
  return decos.length ? DecorationSet.create(state.doc, decos) : null;
}

function marker(icon: string, label: string, color: string, review: boolean): HTMLElement {
  const el = document.createElement('span');
  el.contentEditable = 'false';
  el.setAttribute('data-importance-marker', '');
  el.style.setProperty('--importance-color', color);
  el.textContent = review ? `${icon}🔁` : icon;
  el.title = review ? `${label} · ${LABELS.importance.onReviewList}` : label;
  return el;
}

const importanceKey = new PluginKey('importance');

export const Importance = Extension.create({
  name: 'importance',

  addProseMirrorPlugins() {
    return [new Plugin({ key: importanceKey, props: { decorations: markerDecorations } })];
  },
});
