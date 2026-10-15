import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, selectButton, type BlockDesign, replaceTypedWithBlock } from './blockDesigns';

// An identification key (`\key`): how to tell what something is, a step at a time — the classic
// dichotomous key of a field guide (asked for 2026-10-15). Each step offers choices; each choice
// leads to an answer, or to another step (its result is that step's number, as printed keys write
// it: "1a. Hooked beak ……… Raptor / 1b. Flat bill ……… 2").
//
//   idKey          variant (design: couplets / cards), frames
//   idKeyTitle     what it identifies ("Garden birds")
//   idKeyStep      one step (numbered by order): a question, then two or more choices
//   idKeyQuestion  the step's question (optional; an empty one shows only while editing)
//   idKeyLead      one choice: idKeyChoice (what you see) then idKeyResult (the answer, or a step
//                  number to go to)
//
// Keys: Enter and Tab go forward through the fields (title → question → choice → its result → the
// next choice → …), and at the last result of a step to the next step (a new one at the end);
// Shift+Tab goes back; Enter in an empty step leaves the key (removing the step if another
// remains); Backspace at a field's start steps back rather than merging.

export const IDKEY_VARIANTS = ['couplets', 'cards'] as const;
export type IdKeyVariant = typeof IDKEY_VARIANTS[number];
const MIN_LEADS = 2;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

const textNode = (name: string, attr: string) => Node.create({
  name,
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: `div[${attr}]`, priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { [attr]: '' }), 0]; },
});

export const IdKey = Node.create({
  name: 'idKey',
  group: 'block',
  content: 'idKeyTitle idKeyStep+',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'couplets', parseHTML: (el) => oneOf(IDKEY_VARIANTS, el.getAttribute('data-variant'), 'couplets'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="idkey"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'idkey', 'data-note-block': '' }), 0]; },
});

export const IdKeyTitle = textNode('idKeyTitle', 'data-ik-title');

export const IdKeyStep = Node.create({
  name: 'idKeyStep',
  content: `idKeyQuestion idKeyLead{${MIN_LEADS},}`,
  defining: true,
  parseHTML() { return [{ tag: 'div[data-type="idkey-step"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'idkey-step' }), 0]; },
});

export const IdKeyQuestion = textNode('idKeyQuestion', 'data-ik-question');

export const IdKeyLead = Node.create({
  name: 'idKeyLead',
  content: 'idKeyChoice idKeyResult',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-type="idkey-lead"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'idkey-lead' }), 0]; },
});

export const IdKeyChoice = textNode('idKeyChoice', 'data-ik-choice');
export const IdKeyResult = textNode('idKeyResult', 'data-ik-result');

// A result that's a step number ("2") goes to that step; anything else is an answer.
export const gotoStep = (result: string): number | null => (/^\s*\d+\s*$/.test(result) ? parseInt(result, 10) : null);

// ── Fields, in order ─────────────────────────────────────────────────────────

// Every text field of a key, in reading order, with where it starts and what it is.
interface Field { pos: number; node: PMNode; kind: 'title' | 'question' | 'choice' | 'result'; step: number; lead: number }

function fieldsOf(key: PMNode, keyPos: number): Field[] {
  const out: Field[] = [];
  let p = keyPos + 1;
  key.forEach((child, _o, ci) => {
    if (ci === 0) { out.push({ pos: p, node: child, kind: 'title', step: -1, lead: -1 }); p += child.nodeSize; return; }
    let q = p + 1;
    child.forEach((part, _o2, pi) => {
      if (pi === 0) { out.push({ pos: q, node: part, kind: 'question', step: ci - 1, lead: -1 }); q += part.nodeSize; return; }
      let r = q + 1;
      part.forEach((f, _o3, fi) => { out.push({ pos: r, node: f, kind: fi === 0 ? 'choice' : 'result', step: ci - 1, lead: pi - 1 }); r += f.nodeSize; });
      q += part.nodeSize;
    });
    p += child.nodeSize;
  });
  return out;
}

interface KeyAt { node: PMNode; pos: number; fields: Field[]; index: number }

function keyAt($pos: ResolvedPos): KeyAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'idKey') continue;
    const node = $pos.node(d);
    const pos = $pos.before(d);
    const fields = fieldsOf(node, pos);
    const at = $pos.pos;
    const index = fields.findIndex((f) => at > f.pos && at < f.pos + f.node.nodeSize);
    return { node, pos, fields, index };
  }
  return null;
}

const fieldEnd = (f: Field) => f.pos + 1 + f.node.content.size;

export function stepPos(key: PMNode, keyPos: number, step: number): number {
  let p = keyPos + 1;
  for (let i = 0; i < step + 1; i++) p += key.child(i).nodeSize;
  return p;
}

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

const newLead = (state: EditorState) => state.schema.nodes.idKeyLead.create(null, [state.schema.nodes.idKeyChoice.create(), state.schema.nodes.idKeyResult.create()]);
const newStep = (state: EditorState) => state.schema.nodes.idKeyStep.create(null, [state.schema.nodes.idKeyQuestion.create(), newLead(state), newLead(state)]);

// `\key`: replaces from..to (what was typed and the space before it) with a key of one step of
// two choices, the cursor in its title.
export function insertIdKey(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.idKey;
  if (!type) return null;
  const made = replaceTypedWithBlock(state, from, to, type.create(null, [state.schema.nodes.idKeyTitle.create(), newStep(state)]));
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

export function setIdKeyVariant(view: EditorView, pos: number, variant: IdKeyVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'idKey') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

export function addStep(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'idKey') return;
  const at = pos + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, newStep(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

// Another choice at the end of the step at `step` (a step's position).
export function addChoice(view: EditorView, step: number): void {
  const node = view.state.doc.nodeAt(step);
  if (node?.type.name !== 'idKeyStep') return;
  const at = step + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, newLead(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

export const canDeleteStep = (state: EditorState, pos: number) => {
  const parent = state.doc.resolve(pos).parent;
  return parent.type.name === 'idKey' && parent.childCount - 1 > 1;
};

export function deleteStep(view: EditorView, pos: number): boolean {
  const step = view.state.doc.nodeAt(pos);
  if (step?.type.name !== 'idKeyStep' || !canDeleteStep(view.state, pos)) return false;
  const tr = view.state.tr.delete(pos, pos + step.nodeSize);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(pos), -1)).scrollIntoView());
  view.focus();
  return true;
}

export function idKeyPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="idkey"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'idKey' ? pos : null;
  } catch { return null; }
}

// Puts the cursor at the end of step n's question (1-based, as numbered) and brings it into view.
export function goToStep(view: EditorView, keyPos: number, n: number): void {
  const key = view.state.doc.nodeAt(keyPos);
  if (key?.type.name !== 'idKey' || n < 1 || n > key.childCount - 1) return;
  const sp = stepPos(key, keyPos, n - 1);
  const question = key.child(n).child(0);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, sp + 2 + question.content.size)).scrollIntoView());
  view.focus();
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function caretTo(state: EditorState, pos: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  return true;
}

const stepEmpty = (step: PMNode) => step.textContent.trim() === '';

// Forward to the next field; from the last result of a step, to the next step (a new one at the end).
function forward(state: EditorState, k: KeyAt, dispatch?: (tr: Transaction) => void): boolean {
  const next = k.fields[k.index + 1];
  if (next) return caretTo(state, fieldEnd(next), dispatch);
  if (dispatch) {
    const at = k.pos + k.node.nodeSize - 1;
    const tr = state.tr.insert(at, newStep(state));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  }
  return true;
}

function leave(state: EditorState, k: KeyAt, step: number, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const tr = state.tr;
  let end = k.pos + k.node.nodeSize;
  if (k.node.childCount - 1 > 1) {
    const sp = stepPos(k.node, k.pos, step);
    const size = k.node.child(step + 1).nodeSize;
    tr.delete(sp, sp + size);
    end -= size;
  }
  tr.insert(end, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  return true;
}

export const idKeyEnter: Command = (state, dispatch) => {
  const k = keyAt(state.selection.$from);
  if (!k || k.index < 0) return false;
  const f = k.fields[k.index];
  // A whole step left empty (and not the only thing in the key): done with the key.
  if (f.step >= 0 && stepEmpty(k.node.child(f.step + 1)) && f.kind !== 'question') return leave(state, k, f.step, dispatch);
  // From a step's last result: the next step if it's still empty, else a new one — forward() does both.
  const next = k.fields[k.index + 1];
  if (f.kind === 'result' && next && next.kind === 'question' && !stepEmpty(k.node.child(next.step + 1))) {
    return caretTo(state, fieldEnd(next), dispatch);
  }
  return forward(state, k, dispatch);
};

export const idKeyTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const k = keyAt(state.selection.$from);
  if (!k || k.index < 0) return false;
  if (dir > 0) return k.fields[k.index + 1] ? caretTo(state, fieldEnd(k.fields[k.index + 1]), dispatch) : true;
  return k.index > 0 ? caretTo(state, fieldEnd(k.fields[k.index - 1]), dispatch) : true;
};

export const idKeyBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const k = keyAt($from);
  if (!k || k.index < 0) return false;
  if (k.index === 0) {
    if (k.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(k.pos, k.pos + k.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, k.pos + 1)));
    }
    return true;
  }
  return caretTo(state, fieldEnd(k.fields[k.index - 1]), dispatch);
};

export const idKeyDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!keyAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<IdKeyVariant, string> = {
  couplets: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h4M1.5 7.5h4M1.5 11.5h4"/><path d="M6.5 3.5h5M6.5 7.5h5M6.5 11.5h5" stroke-dasharray="0.6 1.4"/><path d="M12.5 3.5h2M12.5 7.5h2M12.5 11.5h2"/></svg>',
  cards:    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="5" rx="1.2"/><path d="M5 6.5v2.5M11 6.5v2.5"/><rect x="1.5" y="9.5" width="6" height="4.5" rx="1.2"/><rect x="8.5" y="9.5" width="6" height="4.5" rx="2.2"/></svg>',
};

export const IDKEY_DESIGNS: BlockDesign<IdKeyVariant>[] = IDKEY_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.idKey.designs[id], icon: DESIGN_ICONS[id] }));

// The dotted leader between a choice and its result (couplets), a widget so the fields' own
// ::after stays free for their placeholders.
function leaderWidget(): HTMLElement {
  const el = document.createElement('span');
  el.setAttribute('data-ik-leader', '');
  el.setAttribute('aria-hidden', 'true');
  el.contentEditable = 'false';
  return el;
}

// "Go to step n": a small button after a result that names a step, taking the cursor there.
function gotoWidget(view: EditorView, getPos: () => number | undefined, n: number): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-ik-goto-btn', '');
  b.title = LABELS.noteBlocks.idKey.goTo(n);
  b.setAttribute('aria-label', LABELS.noteBlocks.idKey.goTo(n));
  b.textContent = '↘';
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p === undefined) return;
    const $p = view.state.doc.resolve(p);
    for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'idKey') { goToStep(view, $p.before(d), n); return; }
  });
  return b;
}

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.idKey;
  const bar = blockPill('data-idkey-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const add = pillButton(L.addStep, () => { const p = pos(); if (p !== null) addStep(view, p); }, `+ ${L.step}`);
  bar.append(designButtons(IDKEY_DESIGNS, attrs.variant as IdKeyVariant, (v) => { const p = pos(); if (p !== null) setIdKeyVariant(view, p, v); }), add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function idKeyDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.idKey;
  const current = keyAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'idKey') return !node.isTextblock;
    const k = t++;
    const steps = node.childCount - 1;
    const variant = node.attrs.variant as IdKeyVariant;
    const editing = current?.pos === pos;
    if (editing) decos.push(Decoration.node(pos, pos + node.nodeSize, { 'data-ik-current': '' }));
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `idkey-tools-${k}-${variant}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    for (const f of fieldsOf(node, pos)) {
      const end = f.pos + f.node.nodeSize;
      const empty = f.node.content.size === 0;
      if (f.kind === 'title') {
        if (empty) decos.push(Decoration.node(f.pos, end, { 'data-ik-empty': '', 'data-ik-placeholder': L.titlePlaceholder }));
        continue;
      }
      if (f.kind === 'question') {
        const sp = f.pos - 1;
        decos.push(Decoration.node(sp, sp + node.child(f.step + 1).nodeSize, { 'data-ik-num': String(f.step + 1), 'data-ik-step-label': `${L.step} ${f.step + 1}` }));
        // An empty question shows only while the key is being edited.
        if (empty) decos.push(Decoration.node(f.pos, end, editing ? { 'data-ik-empty': '', 'data-ik-placeholder': L.questionPlaceholder } : { 'data-ik-hide': '' }));
        continue;
      }
      if (f.kind === 'choice') {
        const lp = f.pos - 1;
        const lead = state.doc.nodeAt(lp)!;
        decos.push(Decoration.node(lp, lp + lead.nodeSize, { 'data-ik-label': `${f.step + 1}${LETTERS[f.lead] ?? ''}` }));
        if (empty) decos.push(Decoration.node(f.pos, end, { 'data-ik-empty': '', 'data-ik-placeholder': L.choicePlaceholder }));
        if (variant === 'couplets') decos.push(Decoration.widget(end, leaderWidget, { side: -1, key: `idkey-leader-${k}-${f.step}-${f.lead}`, ignoreSelection: true }));
        continue;
      }
      // A result: an answer, or a step to go to (marked bad when there's no such step).
      if (empty) { decos.push(Decoration.node(f.pos, end, { 'data-ik-empty': '', 'data-ik-placeholder': L.resultPlaceholder })); continue; }
      const n = gotoStep(f.node.textContent);
      if (n === null) { decos.push(Decoration.node(f.pos, end, { 'data-ik-answer': '' })); continue; }
      const ok = n >= 1 && n <= steps && n !== f.step + 1;
      decos.push(Decoration.node(f.pos, end, ok ? { 'data-ik-goto': '', title: L.goTo(n) } : { 'data-ik-bad': '', title: L.noSuchStep(n) }));
      if (ok) decos.push(Decoration.widget(end - 1, (view, getPos) => gotoWidget(view, getPos, n), { side: 1, key: `idkey-goto-${k}-${f.step}-${f.lead}-${n}`, ignoreSelection: true, stopEvent: () => true }));
    }
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const idKeyKey = new PluginKey('idKey');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const IdKeyBehaviour = Extension.create({
  name: 'idKeyBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(idKeyEnter),
      Tab: run(idKeyTab(1)),
      'Shift-Tab': run(idKeyTab(-1)),
      Backspace: run(idKeyBackspace),
      Delete: run(idKeyDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: idKeyKey, props: { decorations: idKeyDecorations } })];
  },
});

export const IdKeyExtensions = [IdKey, IdKeyTitle, IdKeyStep, IdKeyQuestion, IdKeyLead, IdKeyChoice, IdKeyResult, IdKeyBehaviour];
