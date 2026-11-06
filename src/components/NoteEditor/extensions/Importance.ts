import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { createReviewIcon } from '@/components/Icons';
import { BUILTIN_TAGS } from '../builtinTags';
import { IMPORTANCE_LEVELS, importanceLevel, nextImportance } from './importanceLevels';
import { openBlockPopover, popoverClass } from './blockDesigns';
import { registerMarginSource } from './MarginColumn';

// Important passages, built out (2026-10-07): two levels (Important, Critical; three until
// 2026-11-05), its icon in the margin column (extensions/MarginColumn.ts) and a Key points list
// (NoteTOC). It lives on the Important tag's own mark (NoteTagMark: level, passageId), so it syncs
// and encrypts with the note. Review later was kept on this mark too (reviewDue, reviewStep) until
// it became its own mark (ReviewMark.ts, 2026-11-05); passages put on the list before still carry
// it here, and the Review view still reads and answers them.

export const IMPORTANT_TAG = BUILTIN_TAGS.find((t) => t.typeKey === 'important')!;

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

// Ctrl+1 on a selection: Important, then Critical, then off.
export function cycleImportance(view: EditorView): void {
  const { from, to } = view.state.selection;
  cycleImportanceIn(view, from, to);
}
export function cycleImportanceIn(view: EditorView, from: number, to: number): void {
  const existing = importantAttrsIn(view.state, from, to);
  const next = nextImportance(existing ? importanceLevel(existing.level).level : 0);
  setImportance(view, from, to, next || null);
}

// Whether from..to is marked Important (any level).
export const isImportantIn = (state: EditorState, from: number, to: number): boolean => !!importantAttrsIn(state, from, to);

// ── In the margin column ─────────────────────────────────────────────────────

// Each Important passage in the margin column (extensions/MarginColumn.ts, which replaced the
// markers in the left margin 2026-10-17): its level's icon, and the Review icon when it's on the
// review list from before. A click offers the level, Stop reviewing (from before) and Remove.
registerMarginSource('important', (state) => collectImportantPassages(state.doc).map((p) => {
  const info = importanceLevel(p.level);
  const review = !!p.reviewDue;
  return {
    key: `important-${p.passageId ?? p.from}`,
    from: p.from,
    to: p.to,
    icon: () => {
      const span = document.createElement('span');
      span.textContent = info.icon;
      if (review) span.append(createReviewIcon());
      return span;
    },
    color: info.color,
    title: review ? `${info.label} · ${LABELS.importance.onReviewList}` : info.label,
    open: (view, anchor) => openBlockPopover(anchor, (close) => {
      const I = LABELS.importance;
      const box = document.createElement('div');
      const row = (buttons: [string, boolean, () => void][]) => {
        const r = document.createElement('div');
        r.className = popoverClass.row;
        for (const [text, pressed, run] of buttons) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = popoverClass.choice;
          b.textContent = text;
          b.setAttribute('aria-pressed', String(pressed));
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', () => { close(); run(); view.focus(); });
          r.append(b);
        }
        return r;
      };
      box.append(
        row(IMPORTANCE_LEVELS.map((lv) => [`${lv.icon} ${lv.label}`, lv.level === p.level, () => setImportance(view, p.from, p.to, lv.level)])),
        row([
          ...(review ? [[I.stopReviewing, false, () => setImportance(view, p.from, p.to, p.level, { due: null, step: null })] as [string, boolean, () => void]] : []),
          [LABELS.contextMenu.removeImportant, false, () => setImportance(view, p.from, p.to, null)],
        ]),
      );
      return box;
    }),
  };
}));
