import { createElement, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { NoteTag } from '@/types/notes';
import { LABELS } from '@/config/labels';
import { ClarifyIcon, ReviewIcon, UnsureIcon } from '@/components/Icons';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { TEXT_TAGS } from './builtinTags';
import { annotationTags } from '@/utils/notes';
import { ANNOTATION_ICON } from '@/config/itemIcons';
import { collectImportantPassages, cycleImportanceIn, isImportantIn, setImportance } from './extensions/Importance';
import { blockImportance, cycleBlockImportance, levelLabel, setBlockImportance } from './extensions/BlockImportance';
import { IMPORTANCE_LEVELS } from './extensions/importanceLevels';
import { blockPosAt } from './extensions/blockDesigns';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { ContextMenuItem } from '@/contextMenu/types';
import { blockFlag, toggleBlockFlag } from './extensions/BlockFlags';
import { CLARIFY_MARK, clarifyAt, clarifyRange, collectClarify, rewriteMarkById } from './extensions/ClarifyMark';
import { collectFlags, flagAt, flagRange } from './extensions/UnsureFlag';
import { blockReview, reviewingIn, toggleBlockReview, toggleReview } from './extensions/ReviewMark';

// Marking text (CLAUDE.md "Marking, making, linking, sending", agreed with the user 2026-11-05): the
// text stays text and gains a mark. THE list of marks, in ONE order, read by the tag picker
// (Ctrl+Space), Ctrl+1…9 (the same numbers), right-click's Annotate ▸ and the `\` selection menu
// (objects/selectionActions.ts), and a block's right-click Annotate ▸ (contextMenu.ts). A new mark is one
// entry here. Making a block from text (a card, a quote…) is not a mark: that's Turn into.
//
//   status  a mark with a tool or behaviour of its own: Important (two levels), Clarify later,
//           Not sure, Review later. Each also goes on a whole block or card.
//   tag     a label to find things by: Example, Reference, then the person's own annotation tags
//           (notebooks are linked to, never put on text). On text only.
//
// In the UI they're all "annotations" (the user, 2026-11-06): Annotate ▸ on right-click and in `\`,
// the annotation picker on Ctrl+Space. What those menus list is `markChoices` below, one list.

export type TextMarkFamily = 'status' | 'tag';

export interface TextMark {
  id:     string;
  family: TextMarkFamily;
  name:   string;
  icon:   ReactNode;
  color:  string;
  on:     (state: EditorState, from: number, to: number) => boolean;
  toggle: (view: EditorView, from: number, to: number) => void;
  // A whole block or card (a status only).
  block?: { on: (state: EditorState, pos: number) => boolean; toggle: (view: EditorView, pos: number) => void };
}

// Takes every piece of one kind of passage mark in from..to off (Clarify later, Not sure).
const offIn = (view: EditorView, runs: { from: number; to: number; id: string }[], mark: string, attr: string) => {
  const tr = view.state.tr;
  let changed = false;
  for (const r of runs) changed = rewriteMarkById(tr, mark, attr, r.id, null) || changed;
  if (changed) view.dispatch(tr);
};
const overlapping = <T extends { from: number; to: number }>(runs: T[], from: number, to: number) => runs.filter((r) => r.from < to && r.to > from);

export const STATUS_MARKS: TextMark[] = [
  {
    id: 'important', family: 'status', name: LABELS.importance.levels[1], icon: '⭐', color: 'var(--color-important-1)',
    on: isImportantIn,
    toggle: (view, from, to) => cycleImportanceIn(view, from, to),
    block: { on: (s, pos) => blockImportance(s, pos) > 0, toggle: cycleBlockImportance },
  },
  {
    id: 'clarify', family: 'status', name: LABELS.clarify.mark, icon: createElement(ClarifyIcon), color: 'var(--color-clarify)',
    on: (s, from, to) => !!(clarifyAt(s.doc, from) && clarifyAt(s.doc, to)),
    toggle: (view, from, to) => {
      const runs = overlapping(collectClarify(view.state.doc), from, to);
      if (runs.length && STATUS_MARKS[1].on(view.state, from, to)) { offIn(view, runs.map((r) => ({ ...r, id: r.clarifyId })), CLARIFY_MARK, 'clarifyId'); return; }
      const tr = clarifyRange(view.state.tr, from, to);
      if (tr) view.dispatch(tr);
    },
    block: { on: (s, pos) => !!blockFlag(s, pos, 'clarify'), toggle: (view, pos) => toggleBlockFlag(view, pos, 'clarify') },
  },
  {
    id: 'unsure', family: 'status', name: LABELS.unsureFlag.flag, icon: createElement(UnsureIcon), color: 'var(--color-muted)',
    on: (s, from, to) => !!(flagAt(s.doc, from) && flagAt(s.doc, to)),
    toggle: (view, from, to) => {
      const runs = overlapping(collectFlags(view.state.doc), from, to);
      if (runs.length && STATUS_MARKS[2].on(view.state, from, to)) { offIn(view, runs.map((r) => ({ ...r, id: r.flagId })), 'unsureFlag', 'flagId'); return; }
      const tr = flagRange(view.state.tr, from, to);
      if (tr) view.dispatch(tr);
    },
    block: { on: (s, pos) => !!blockFlag(s, pos, 'unsure'), toggle: (view, pos) => toggleBlockFlag(view, pos, 'unsure') },
  },
  {
    id: 'review', family: 'status', name: LABELS.importance.reviewLater, icon: createElement(ReviewIcon), color: 'var(--color-primary)',
    on: reviewingIn,
    toggle: (view, from, to) => toggleReview(view, from, to),
    block: { on: (s, pos) => !!blockReview(s, pos), toggle: (view, pos) => toggleBlockReview(view, pos) },
  },
];

// A tag on text: on or off over from..to (another tag there is replaced, as a tag mark holds one).
function tagMark(id: string, name: string, icon: string | null | undefined, color: string, typeKey: string | null): TextMark {
  const hasTag = (s: EditorState, from: number, to: number) => {
    let on = false;
    s.doc.nodesBetween(from, to, (n) => { if (!on && n.isText) on = n.marks.some((m) => m.type.name === 'noteTag' && m.attrs.tagId === id); return !on; });
    return on;
  };
  return {
    id, family: 'tag', name, color, icon: createElement(ItemIcon, { icon: icon ?? '📁' }),
    on: hasTag,
    toggle: (view, from, to) => {
      const type = view.state.schema.marks.noteTag;
      if (!type || from >= to) return;
      const tr = view.state.tr;
      if (hasTag(view.state, from, to)) tr.removeMark(from, to, type);
      else tr.addMark(from, to, type.create({ tagId: id, color, typeKey }));
      view.dispatch(tr);
    },
  };
}

// Every mark, in its order: the statuses, the built-in tags, the person's own tags.
export function textMarks(noteTags: Record<string, NoteTag>): TextMark[] {
  return [
    ...STATUS_MARKS,
    // Important is a status above, not a tag.
    ...TEXT_TAGS.filter((t) => t.typeKey !== 'important').map((t) => tagMark(t.id, t.name, t.icon, t.color, t.typeKey)),
    ...annotationTags(noteTags).map((t) => tagMark(t.id, t.name, t.icon || ANNOTATION_ICON, t.color ?? '#6b7280', null)),
  ];
}

// Ctrl+N's mark: the Nth in the list (1–9).
export const markForDigit = (noteTags: Record<string, NoteTag>, digit: number): TextMark | undefined =>
  digit >= 1 && digit <= 9 ? textMarks(noteTags)[digit - 1] : undefined;

// The number a mark answers to (1–9), or null past nine. The Important tag's id is Important's.
export const markDigit = (noteTags: Record<string, NoteTag>, id: string): number | null => {
  const want = id === 'builtin-important' ? 'important' : id;
  const n = textMarks(noteTags).findIndex((m) => m.id === want) + 1;
  return n >= 1 && n <= 9 ? n : null;
};

// What a mark goes on with no block chosen: the selected text, else the line the cursor (or `at`,
// a right-click) is in. Null when that line holds no text.
export function markRange(state: EditorState, at?: number): { from: number; to: number } | null {
  const { from, to, empty } = state.selection;
  if (!empty && at === undefined) return { from, to };
  const $at = state.doc.resolve(at ?? from);
  if (!$at.parent.isTextblock || !$at.parent.textContent.trim()) return null;
  return { from: $at.start(), to: $at.end() };
}

// A mark on what's selected: the selected text, else the block selected whole (statuses), else the
// paragraph the cursor is in.
export function applyTextMark(editor: Editor, mark: TextMark, blockPos: number | null = null): void {
  const view = editor.view;
  if (blockPos !== null) { mark.block?.toggle(view, blockPos); return; }
  const range = markRange(view.state);
  if (range) mark.toggle(view, range.from, range.to);
}

// One entry of the annotation menus (the Ctrl+Space picker, Annotate ▸ on right-click and in `\`):
// the marks in their order, Important as its two levels. Both menus read this, so they can't drift
// apart again (2026-11-06: the picker had one Important, right-click had Important and Critical).
export interface MarkChoice {
  key:    string;
  family: TextMarkFamily;
  set:    'important' | 'status' | 'tags';
  label:  string;
  icon:   ReactNode;
  color:  string;
  on:     boolean;
  // Its Ctrl+1…9 number, or null.
  digit:  number | null;
  run:    (view: EditorView) => void;
}

export function markChoices(noteTags: Record<string, NoteTag>, state: EditorState, from: number, to: number): MarkChoice[] {
  const level = collectImportantPassages(state.doc).find((p) => p.from < to && p.to > from)?.level ?? 0;
  const out: MarkChoice[] = [];
  textMarks(noteTags).forEach((m, i) => {
    const digit = i < 9 ? i + 1 : null;
    if (m.id === 'important') {
      for (const lv of IMPORTANCE_LEVELS) out.push({
        key: `important-${lv.level}`, family: 'status', set: 'important', label: lv.label, icon: lv.icon, color: lv.color,
        on: level === lv.level, digit: lv.level === 1 ? digit : null,
        run: (view) => setImportance(view, from, to, level === lv.level ? null : lv.level),
      });
      return;
    }
    out.push({
      key: m.family === 'status' ? m.id : `tag-${m.id}`, family: m.family, set: m.family === 'status' ? 'status' : 'tags',
      label: m.name, icon: m.icon, color: m.color, on: m.on(state, from, to), digit,
      run: (view) => m.toggle(view, from, to),
    });
  });
  return out;
}

// Right-click on a block: Mark as ▸, the statuses for the whole block (or card), each ✓ while on;
// Important offers its two levels. The same list as on text.
registerContextMenuProvider({
  id: 'note-editor.block-marks',
  kind: 'note-editor',
  order: 7,
  when: (ctx) => !!ctx.target.closest('[data-note-block]'),
  items: (ctx, scope) => {
    const view = (scope.data as { editor: { view: EditorView } }).editor.view;
    const pos = blockPosAt(view, ctx.target);
    if (pos === null || !view.editable) return [];
    const level = blockImportance(view.state, pos);
    const levels: ContextMenuItem[] = IMPORTANCE_LEVELS.map((lv) => ({
      id: `block-important-${lv.level}`, label: levelLabel(view.state, pos, lv.level), icon: level === lv.level ? '✓' : lv.icon,
      run: () => setBlockImportance(view, pos, level === lv.level ? 0 : lv.level),
    }));
    const rest: ContextMenuItem[] = STATUS_MARKS.filter((m) => m.id !== 'important' && m.block).map((m) => ({
      id: `block-mark-${m.id}`, label: m.name, icon: m.block!.on(view.state, pos) ? '✓' : m.icon,
      run: () => m.block!.toggle(view, pos),
    }));
    return [{ id: 'block-mark-as', label: LABELS.contextMenu.markAs, icon: '⭐', submenu: [levels, rest] }];
  },
});
