import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { createGlyph } from '@/components/Icons';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { sentenceEndingAt } from '@/utils/unsureFlag';
import type { NoteEditorMenuApi } from '../contextMenu';
import { openBlockPopover, popoverClass } from './blockDesigns';
import { registerMarginSource } from './MarginColumn';

// Clarify later (asked for by the user 2026-11-05): a passage you mean to come back and learn (a new
// concept met in a lecture), unlike the Unsure flag (UnsureFlag.ts: doubt that it's right). Made by
// `\clarify` (the sentence before), or `\` / right-click on selected text. Listed in the Clarify
// tool (NotesSection/ClarifyView.tsx, "To learn"), and taken off there or here with "Learned it".
//
//   clarify  the mark: clarifyId (one mark across the pieces of its passage), note (what to look
//            into, optional), learnedAt (when "Learned it" was chosen: the mark stays, undrawn, so
//            what was learned and when is kept for study later; drawn as data-clarify-learned)
//
// Drawn as the Unsure flag is: a text style on the mark, its icon (a graduation cap) ONCE after the
// passage (a decoration), and in the margin column. Clicking the icon opens the note and Learned it.

export const CLARIFY_MARK = 'clarify';

export const ClarifyMarkType = Mark.create({
  name: CLARIFY_MARK,
  inclusive: false,
  addAttributes() {
    return {
      clarifyId: { default: null, parseHTML: (el) => el.getAttribute('data-clarify-id'), renderHTML: (a) => (a.clarifyId ? { 'data-clarify-id': a.clarifyId } : {}) },
      note: { default: null, parseHTML: (el) => el.getAttribute('data-note') || null, renderHTML: (a) => (a.note ? { 'data-note': a.note } : {}) },
      learnedAt: { default: null, parseHTML: (el) => el.getAttribute('data-clarify-learned') || null, renderHTML: (a) => (a.learnedAt ? { 'data-clarify-learned': a.learnedAt } : {}) },
    };
  },
  parseHTML() { return [{ tag: 'span[data-clarify]' }, { tag: 'span[data-clarify-learned]' }]; },
  // A learned passage is plain text to look at: no data-clarify (its style), only its date.
  renderHTML({ mark, HTMLAttributes }) { return ['span', mark.attrs.learnedAt ? HTMLAttributes : mergeAttributes(HTMLAttributes, { 'data-clarify': '' }), 0]; },
});

export interface ClarifyRun { clarifyId: string; note: string | null; learnedAt: string | null; from: number; to: number }

// The passages still to clarify (drawn, listed under To learn); collectLearned for the learned ones.
export const collectClarify = (doc: PMNode): ClarifyRun[] => allClarify(doc).filter((r) => !r.learnedAt);
export const collectLearned = (doc: PMNode): ClarifyRun[] => allClarify(doc).filter((r) => !!r.learnedAt);

function allClarify(doc: PMNode): ClarifyRun[] {
  const runs = new Map<string, ClarifyRun>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const m of node.marks) {
      if (m.type.name !== CLARIFY_MARK || !m.attrs.clarifyId) continue;
      const id = m.attrs.clarifyId as string;
      const run = runs.get(id);
      if (run) run.to = pos + node.nodeSize;
      else runs.set(id, { clarifyId: id, note: m.attrs.note, learnedAt: m.attrs.learnedAt ?? null, from: pos, to: pos + node.nodeSize });
    }
    return false;
  });
  return [...runs.values()];
}

export const clarifyAt = (doc: PMNode, pos: number): ClarifyRun | null =>
  collectClarify(doc).find((r) => pos >= r.from && pos <= r.to) ?? null;

// Marks from..to (selected text) to clarify later; text already marked in that range joins it.
export function clarifyRange(tr: Transaction, from: number, to: number, note: string | null = null): Transaction | null {
  const type = tr.doc.type.schema.marks[CLARIFY_MARK];
  if (!type || from >= to || !tr.doc.textBetween(from, to).trim()) return null;
  return tr.removeMark(from, to, type).addMark(from, to, type.create({ clarifyId: nanoid(10), note }));
}

// `\clarify` typed at from..to: the typed text goes and the sentence before it is marked.
export function clarifySentenceBefore(state: EditorState, from: number, to: number): Transaction {
  const tr = state.tr.delete(from, to);
  const $at = tr.doc.resolve(from);
  if (!$at.parent.isTextblock) return tr;
  const text = $at.parent.textBetween(0, $at.parentOffset, undefined, '￼');
  const s = sentenceEndingAt(text, text.length);
  if (s) clarifyRange(tr, $at.start() + s.from, $at.start() + s.to);
  return tr;
}

// Every piece of one passage's mark (by its id, on any mark type): changed or taken off. Used here
// and by the Clarify tool on a stored note (services/noteClarify.ts), so it works on a Transform.
export function rewriteMarkById(tr: Transform, markName: string, idAttr: string, id: string, attrs: Record<string, unknown> | null): boolean {
  const type = tr.doc.type.schema.marks[markName];
  if (!type) return false;
  const pieces: { from: number; to: number; attrs: Record<string, unknown> }[] = [];
  tr.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const m = node.marks.find((x) => x.type === type && x.attrs[idAttr] === id);
    if (m) pieces.push({ from: pos, to: pos + node.nodeSize, attrs: m.attrs });
    return false;
  });
  for (const p of pieces) {
    tr.removeMark(p.from, p.to, type);
    if (attrs) tr.addMark(p.from, p.to, type.create({ ...p.attrs, ...attrs }));
  }
  return pieces.length > 0;
}

export function setClarifyNote(view: EditorView, clarifyId: string, note: string): void {
  const tr = view.state.tr;
  if (rewriteMarkById(tr, CLARIFY_MARK, 'clarifyId', clarifyId, { note: note.trim() || null })) view.dispatch(tr);
}

// Learned it: the passage is no longer to clarify, and when it was learned is kept on its mark.
export const LEARNED = (at = new Date()) => ({ learnedAt: at.toISOString() });
export function learnedClarify(view: EditorView, clarifyId: string): void {
  const tr = view.state.tr;
  if (rewriteMarkById(tr, CLARIFY_MARK, 'clarifyId', clarifyId, LEARNED())) view.dispatch(tr);
}

const title = (r: Pick<ClarifyRun, 'note'>) => (r.note ? LABELS.clarify.markerNote(r.note) : LABELS.clarify.marker);

// The note and Learned it, from the icon after the passage or in the margin.
export function openClarifyPopover(anchor: DOMRect, opts: { note: string | null; onNote: (note: string) => void; onDone: () => void; doneLabel?: string; noteLabel?: string; noteHint?: string }): void {
  const L = LABELS.clarify;
  openBlockPopover(anchor, (close) => {
    const wrap = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = popoverClass.heading;
    heading.textContent = opts.noteLabel ?? L.note;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = popoverClass.input;
    input.value = opts.note ?? '';
    input.placeholder = opts.noteHint ?? L.noteHint;
    input.setAttribute('aria-label', opts.noteLabel ?? L.note);
    const save = () => { if (input.value !== (opts.note ?? '')) opts.onNote(input.value); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); close(); } });
    input.addEventListener('blur', save);
    const row = document.createElement('div');
    row.className = popoverClass.row;
    const done = document.createElement('button');
    done.type = 'button';
    done.className = popoverClass.choice;
    done.textContent = opts.doneLabel ?? L.learned;
    done.addEventListener('mousedown', (e) => e.preventDefault());
    done.addEventListener('click', () => { close(); opts.onDone(); });
    row.append(done);
    wrap.append(heading, input, row);
    setTimeout(() => input.focus(), 0);
    return wrap;
  });
}

function markerWidget(view: EditorView, r: ClarifyRun): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-clarify-marker', '');
  b.title = title(r);
  b.setAttribute('aria-label', title(r));
  b.append(createGlyph('clarify'));
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    openClarifyPopover(b.getBoundingClientRect(), {
      note: r.note,
      onNote: (note) => setClarifyNote(view, r.clarifyId, note),
      onDone: () => { learnedClarify(view, r.clarifyId); view.focus(); },
    });
  });
  return b;
}

const decorations = (doc: PMNode) => DecorationSet.create(doc, collectClarify(doc).map((r) =>
  Decoration.widget(r.to, (view) => markerWidget(view, r), { side: -1, key: `clarify-${r.clarifyId}-${r.note ?? ''}`, ignoreSelection: true, stopEvent: () => true })));

registerMarginSource('clarify', (state) => collectClarify(state.doc).map((r) => ({
  key: `clarify-${r.clarifyId}`,
  from: r.from,
  to: r.to,
  icon: () => createGlyph('clarify'),
  color: 'var(--color-clarify)',
  title: title(r),
  open: (view, anchor) => openClarifyPopover(anchor, {
    note: r.note,
    onNote: (note) => setClarifyNote(view, r.clarifyId, note),
    onDone: () => learnedClarify(view, r.clarifyId),
  }),
})));

// Right-click on marked text: Learned it, the clicked thing's action first. Clarify later on
// selected text is in Mark as ▸ (objects/selectionActions.ts).
registerContextMenuProvider({
  id: 'note-editor.clarify',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('[data-clarify]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    let pos: number;
    try { pos = view.posAtDOM(ctx.target.closest('[data-clarify]')!, 0); } catch { return []; }
    const r = clarifyAt(view.state.doc, pos);
    if (!r) return [];
    return [{ id: 'clarify-learned', label: LABELS.clarify.learned, icon: '✓', run: () => learnedClarify(view, r.clarifyId) }];
  },
});

const decoKey = new PluginKey<DecorationSet>('clarifyMarkers');

export const ClarifyTools = Extension.create({
  name: 'clarifyTools',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: decoKey,
      state: { init: (_, state) => decorations(state.doc), apply: (tr, old) => (tr.docChanged ? decorations(tr.doc) : old) },
      props: { decorations: (state) => decoKey.getState(state) },
    })];
  },
});

export const ClarifyExtensions = [ClarifyMarkType, ClarifyTools];
