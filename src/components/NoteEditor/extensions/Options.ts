import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, replaceTypedWithBlock, selectButton, type BlockDesign } from './blockDesigns';
import { listDecorations, newLists, pointAt, pointsEnter, textFieldsIn } from './ProsCons';

// Options (`\options`): the different ways to one end — policies for a goal, routes, approaches —
// asked for 2026-10-15 as distinct from the breakdown (parts that make up a whole) and the types
// (kinds of a thing): options are alternatives to choose between. Each can be weighed (its pros and
// cons, the same lists as the pros-and-cons block, a status and a score) or simply listed.
//
//   options      variant (design), frames
//   optionsGoal  what the options are for
//   optionsItem  status attr ('considering' | 'chosen' | 'ruled'), score attr (0–5); then
//   optionsName / optionsNote, and two prosConsLists (pros, cons)
//
// Designs, agreed with the user: weighing them — Fork in the road (the goal splitting into option
// cards; the chosen one stands out, the ruled-out fade), Side by side (equal columns with pros and
// cons), Ranked (best score first, a score bar each); not weighing them (the user: "options that
// you're not weighing up against each other") — Tiles (equal tiles, name and note) and Either / or
// (the options joined by "or"). Designs that don't weigh hide the pros, cons, status and score,
// keeping them.
// Keys: Enter goes goal → name → note → (when weighing) its pros → its cons → the next option's
// name; after the last option, a new one; Enter in an empty option leaves the block (removing it if
// more than two remain); Tab / Shift+Tab move through the fields; Backspace steps back.

export const OPTIONS_VARIANTS = ['fork', 'side', 'ranked', 'tiles', 'either'] as const;
export type OptionsVariant = typeof OPTIONS_VARIANTS[number];
export const UNWEIGHED: readonly OptionsVariant[] = ['tiles', 'either'];
export const OPTION_STATUSES = ['considering', 'chosen', 'ruled'] as const;
export type OptionStatus = typeof OPTION_STATUSES[number];
const MIN_OPTIONS = 2;
const MAX_SCORE = 5;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

const textNode = (name: string, attr: string) => Node.create({
  name,
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: `div[${attr}]`, priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { [attr]: '' }), 0]; },
});

export const Options = Node.create({
  name: 'options',
  group: 'block',
  content: `optionsGoal optionsItem{${MIN_OPTIONS},}`,
  defining: true,
  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'fork', parseHTML: (el) => oneOf(OPTIONS_VARIANTS, el.getAttribute('data-variant'), 'fork'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="options"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'options', 'data-note-block': '' }), 0]; },
});

export const OptionsGoal = textNode('optionsGoal', 'data-op-goal');
export const OptionsName = textNode('optionsName', 'data-op-name');
export const OptionsNote = textNode('optionsNote', 'data-op-note');

export const OptionsItem = Node.create({
  name: 'optionsItem',
  content: 'optionsName optionsNote prosConsList prosConsList',
  defining: true,
  addAttributes() {
    return {
      status: { default: 'considering', parseHTML: (el) => oneOf(OPTION_STATUSES, el.getAttribute('data-status'), 'considering'), renderHTML: (a) => ({ 'data-status': a.status }) },
      score:  { default: 0, parseHTML: (el) => Math.min(MAX_SCORE, Math.max(0, parseInt(el.getAttribute('data-score') ?? '0', 10) || 0)), renderHTML: (a) => ({ 'data-score': String(a.score) }) },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="options-item"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'options-item' }), 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface OpAt { node: PMNode; pos: number }
function optionsAt($pos: ResolvedPos): OpAt | null {
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'options') return { node: $pos.node(d), pos: $pos.before(d) };
  return null;
}
function itemAt($pos: ResolvedPos): { item: PMNode; pos: number; index: number } | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'optionsItem') return { item: $pos.node(d), pos: $pos.before(d), index: $pos.index(d - 1) - 1 };
  }
  return null;
}
export function optionPos(node: PMNode, pos: number, index: number): number {
  let p = pos + 1;
  for (let i = 0; i < index + 1; i++) p += node.child(i).nodeSize;
  return p;
}

export function optionsPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="options"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'options' ? pos : null;
  } catch { return null; }
}

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

const newOption = (state: EditorState) => state.schema.nodes.optionsItem.create(null, [
  state.schema.nodes.optionsName.create(), state.schema.nodes.optionsNote.create(), ...newLists(state),
]);

export function insertOptions(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.options;
  if (!type) return null;
  const made = replaceTypedWithBlock(state, from, to, type.create(null, [state.schema.nodes.optionsGoal.create(), newOption(state), newOption(state), newOption(state)]));
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

export function setOptionsVariant(view: EditorView, pos: number, variant: OptionsVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'options') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

export function setOptionAttrs(view: EditorView, pos: number, attrs: Partial<{ status: OptionStatus; score: number }>): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'optionsItem') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function addOption(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'options') return;
  const at = pos + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, newOption(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

export const canDeleteOption = (state: EditorState, pos: number) => {
  const parent = state.doc.resolve(pos).parent;
  return parent.type.name === 'options' && parent.childCount - 1 > MIN_OPTIONS;
};

export function deleteOption(view: EditorView, pos: number): boolean {
  const item = view.state.doc.nodeAt(pos);
  if (item?.type.name !== 'optionsItem' || !canDeleteOption(view.state, pos)) return false;
  const tr = view.state.tr.delete(pos, pos + item.nodeSize);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(pos), -1)).scrollIntoView());
  view.focus();
  return true;
}

// Rank by score, best first (ties keep their order): what the Ranked design shows.
export function ranks(node: PMNode): number[] {
  const scores: { i: number; s: number }[] = [];
  node.forEach((c, _o, i) => { if (i > 0) scores.push({ i: i - 1, s: c.attrs.score as number }); });
  const order = [...scores].sort((a, b) => b.s - a.s || a.i - b.i);
  const rank: number[] = [];
  order.forEach((o, r) => { rank[o.i] = r; });
  return rank;
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function caretTo(state: EditorState, pos: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  return true;
}

// The fields Enter and Tab walk through: every field, except the pros and cons in a design that
// doesn't weigh the options (they're hidden there).
function walkable(b: OpAt) {
  const weighed = !UNWEIGHED.includes(b.node.attrs.variant as OptionsVariant);
  return textFieldsIn(b.node, b.pos).filter((f) => weighed || f.node.type.name !== 'prosConsPoint');
}
const fieldEnd = (f: { pos: number; node: PMNode }) => f.pos + 1 + f.node.content.size;

function step(state: EditorState, b: OpAt, dir: 1 | -1, dispatch?: (tr: Transaction) => void): boolean {
  const fields = walkable(b);
  const here = state.selection.from;
  const i = fields.findIndex((f) => here > f.pos && here <= fieldEnd(f));
  const next = fields[i + dir];
  return next ? caretTo(state, fieldEnd(next), dispatch) : dir > 0 ? newAtEnd(state, b, dispatch) : true;
}

function newAtEnd(state: EditorState, b: OpAt, dispatch?: (tr: Transaction) => void, tr = state.tr): boolean {
  if (!dispatch) return true;
  const at = tr.mapping.map(b.pos + b.node.nodeSize - 1);
  tr.insert(at, newOption(state));
  dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  return true;
}

function leave(state: EditorState, b: OpAt, index: number, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const tr = state.tr;
  let end = b.pos + b.node.nodeSize;
  if (b.node.childCount - 1 > MIN_OPTIONS) {
    const ip = optionPos(b.node, b.pos, index);
    const size = b.node.child(index + 1).nodeSize;
    tr.delete(ip, ip + size);
    end -= size;
  }
  tr.insert(end, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  return true;
}

export const optionsEnter: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const b = optionsAt($from);
  if (!b) return false;
  const it = itemAt($from);
  if (it && it.item.textContent.trim() === '' && $from.parent.type.name === 'optionsName') return leave(state, b, it.index, dispatch);
  if (pointAt($from)) {
    const end = b.pos + b.node.nodeSize;
    const done = pointsEnter(state, dispatch, end, (tr) => { newAtEnd(state, b, dispatch, tr); });
    if (done !== null) return done;
  }
  return step(state, b, 1, dispatch);
};

export const optionsTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const b = optionsAt(state.selection.$from);
  if (!b) return false;
  const fields = walkable(b);
  const here = state.selection.from;
  const i = fields.findIndex((f) => here > f.pos && here <= fieldEnd(f));
  const next = fields[i + dir];
  return next ? caretTo(state, fieldEnd(next), dispatch) : true;
};

export const optionsBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const b = optionsAt($from);
  if (!b) return false;
  if ($from.parent.type.name === 'optionsGoal') {
    if (b.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(b.pos, b.pos + b.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, b.pos + 1)));
    }
    return true;
  }
  const at = pointAt($from);
  if (at && at.point.content.size === 0 && at.list.childCount > 1) {
    if (dispatch) {
      const tr = state.tr.delete(at.pos, at.pos + at.point.nodeSize);
      dispatch(tr.setSelection(Selection.near(tr.doc.resolve(at.pos), -1)).scrollIntoView());
    }
    return true;
  }
  return optionsTab(-1)(state, dispatch);
};

export const optionsDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!optionsAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<OptionsVariant, string> = {
  fork:   '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="1.5" width="6" height="3" rx="0.8"/><path d="M8 4.5V7M3 10V7h10v3M8 7v3"/><rect x="1" y="10.5" width="4" height="4" rx="0.8"/><rect x="6" y="10.5" width="4" height="4" rx="0.8"/><rect x="11" y="10.5" width="4" height="4" rx="0.8"/></svg>',
  side:   '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2" width="5.5" height="12" rx="1"/><rect x="9" y="2" width="5.5" height="12" rx="1"/><path d="M3 6h2.5M3 9h2.5M10.5 6H13M10.5 9H13"/></svg>',
  ranked: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h1M1.5 8h1M1.5 12.5h1"/><path d="M4.5 3.5h10M4.5 8h7M4.5 12.5h4"/></svg>',
  tiles:  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/></svg>',
  either: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="5.5" width="4.5" height="5" rx="2.2"/><rect x="10.5" y="5.5" width="4.5" height="5" rx="2.2"/><path d="M6.8 8h2.4"/></svg>',
};

export const OPTIONS_DESIGNS: BlockDesign<OptionsVariant>[] = OPTIONS_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.options.designs[id], icon: DESIGN_ICONS[id] }));

// The status chip on an option (weighing designs): a click steps Considering → Chosen → Ruled out.
function statusWidget(view: EditorView, getPos: () => number | undefined, status: OptionStatus): HTMLElement {
  const L = LABELS.noteBlocks.options;
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-op-status', status);
  b.textContent = L.statuses[status];
  b.title = L.statusTitle;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p === undefined || !view.editable) return;
    const next = OPTION_STATUSES[(OPTION_STATUSES.indexOf(status) + 1) % OPTION_STATUSES.length];
    setOptionAttrs(view, p - 1, { status: next });
  });
  return b;
}

// The score bar (Ranked): five segments, a click sets the score (clicking the current one clears it).
function scoreWidget(view: EditorView, getPos: () => number | undefined, score: number): HTMLElement {
  const L = LABELS.noteBlocks.options;
  const el = document.createElement('span');
  el.contentEditable = 'false';
  el.setAttribute('data-op-score', String(score));
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', L.scoreTitle(score));
  for (let i = 1; i <= MAX_SCORE; i++) {
    const seg = document.createElement('button');
    seg.type = 'button';
    seg.title = L.setScore(i);
    seg.setAttribute('aria-label', L.setScore(i));
    if (i <= score) seg.setAttribute('data-on', '');
    seg.addEventListener('mousedown', (e) => e.preventDefault());
    seg.addEventListener('click', (e) => {
      e.preventDefault();
      const p = getPos();
      if (p === undefined || !view.editable) return;
      setOptionAttrs(view, p - 1, { score: score === i ? 0 : i });
    });
    el.append(seg);
  }
  return el;
}

function deleteWidget(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-op-delete', '');
  b.title = LABELS.noteBlocks.options.deleteOption;
  b.setAttribute('aria-label', LABELS.noteBlocks.options.deleteOption);
  b.textContent = '×';
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p !== undefined && view.editable) deleteOption(view, view.state.doc.resolve(p).before());
  });
  return b;
}

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.options;
  const bar = blockPill('data-options-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const add = pillButton(L.addOption, () => { const p = pos(); if (p !== null) addOption(view, p); }, `+ ${L.option}`);
  bar.append(designButtons(OPTIONS_DESIGNS, attrs.variant as OptionsVariant, (v) => { const p = pos(); if (p !== null) setOptionsVariant(view, p, v); }), add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function optionsDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.options;
  const current = optionsAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'options') return !node.isTextblock;
    const k = t++;
    const variant = node.attrs.variant as OptionsVariant;
    const weighed = !UNWEIGHED.includes(variant);
    const editing = current?.pos === pos;
    const n = node.childCount - 1;
    decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `--op-n: ${n}`, ...(editing ? { 'data-op-current': '' } : {}), ...(weighed ? {} : { 'data-op-plain': '' }) }));
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `op-tools-${k}-${variant}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    const goal = node.child(0);
    if (goal.content.size === 0) decos.push(Decoration.node(pos + 1, pos + 1 + goal.nodeSize, { 'data-op-empty': '', 'data-op-placeholder': L.goalPlaceholder }));
    const rank = ranks(node);
    node.forEach((item, offset, ci) => {
      if (ci === 0) return;
      const i = ci - 1;
      const ip = pos + 1 + offset;
      const status = item.attrs.status as OptionStatus;
      decos.push(Decoration.node(ip, ip + item.nodeSize, { style: `--i: ${i}; --rank: ${rank[i]}`, 'data-op-or': L.or, ...(i === n - 1 ? { 'data-op-last': '' } : {}) }));
      if (weighed) {
        decos.push(Decoration.widget(ip + 1, (view, getPos) => statusWidget(view, getPos, status),
          { side: -1, key: `op-status-${k}-${i}-${status}`, ignoreSelection: true, stopEvent: () => true }));
      }
      if (variant === 'ranked') {
        const score = item.attrs.score as number;
        decos.push(Decoration.widget(ip + 1, (view, getPos) => scoreWidget(view, getPos, score),
          { side: -1, key: `op-score-${k}-${i}-${score}`, ignoreSelection: true, stopEvent: () => true }));
      }
      if (n > MIN_OPTIONS) {
        decos.push(Decoration.widget(ip + item.nodeSize - 1, (view, getPos) => deleteWidget(view, getPos),
          { side: 1, key: `op-delete-${k}-${i}`, ignoreSelection: true, stopEvent: () => true }));
      }
      const name = item.child(0);
      const note = item.child(1);
      const namePos = ip + 1;
      const notePos = namePos + name.nodeSize;
      if (name.content.size === 0) decos.push(Decoration.node(namePos, notePos, { 'data-op-empty': '', 'data-op-placeholder': L.namePlaceholder }));
      if (note.content.size === 0) {
        decos.push(Decoration.node(notePos, notePos + note.nodeSize, editing ? { 'data-op-empty': '', 'data-op-placeholder': L.notePlaceholder } : { 'data-op-hide': '' }));
      }
      let lp = notePos + note.nodeSize;
      for (const li of [2, 3]) {
        const list = item.child(li);
        const filled = list.textContent.trim() !== '';
        if (!weighed || (!filled && !editing)) decos.push(Decoration.node(lp, lp + list.nodeSize, { 'data-op-hide': '' }));
        else listDecorations(decos, list, lp, `op-${k}-${i}-${li}`);
        lp += list.nodeSize;
      }
    });
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const optionsKey = new PluginKey('options');

export const OptionsBehaviour = Extension.create({
  name: 'optionsBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(optionsEnter),
      Tab: run(optionsTab(1)),
      'Shift-Tab': run(optionsTab(-1)),
      Backspace: run(optionsBackspace),
      Delete: run(optionsDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: optionsKey, props: { decorations: optionsDecorations } })];
  },
});

export const OptionsExtensions = [Options, OptionsGoal, OptionsItem, OptionsName, OptionsNote, OptionsBehaviour];
