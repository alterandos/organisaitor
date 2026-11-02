import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, selectButton, type BlockDesign, replaceTypedWithBlock, spectrumColour } from './blockDesigns';
import { iconSlot } from './blockIcons';
import { createGlyph } from '@/components/Icons';

// The steps of something, in order (`\steps`, asked for by the user 2026-11-02): data preprocessing
// in six steps, a recipe, a method. Not a cycle (it doesn't come back round) and not a timeline (no
// dates). At least two steps.
//
//   steps        variant (design: stepper / chevrons / cards / stairs), colours (accent / spectrum), frames
//   stepsName    what these are the steps of ("Data preprocessing"); hidden while empty and not edited
//   stepsStep    one step: its label, then a short note. Optional icon (an emoji) or picture,
//                from the shared icon slot (blockIcons.ts)
//   stepsLabel / stepsText   the step's two lines
//
// Keys, as a pyramid's: Enter goes name → the first step, label → its note → the next step (an
// empty one if it's waiting, else a new one); Enter in an empty step leaves (removing the step if
// more than two would remain); Tab / Shift+Tab between steps; Backspace steps back.

export const STEPS_VARIANTS = ['stepper', 'chevrons', 'cards', 'stairs'] as const;
export type StepsVariant = typeof STEPS_VARIANTS[number];
export const MIN_STEPS = 2;
const DEFAULT_STEPS = 3;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Steps = Node.create({
  name: 'steps',
  group: 'block',
  content: `stepsName stepsStep{${MIN_STEPS},}`,
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'stepper', parseHTML: (el) => oneOf(STEPS_VARIANTS, el.getAttribute('data-variant'), 'stepper'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      colours: { default: 'accent', parseHTML: (el) => oneOf(['accent', 'spectrum'] as const, el.getAttribute('data-colours'), 'accent'), renderHTML: (a) => ({ 'data-colours': a.colours }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="steps"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'steps', 'data-note-block': '' }), 0]; },
});

export const StepsName = Node.create({
  name: 'stepsName',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-steps-name]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-steps-name': '' }), 0]; },
});

export const StepsStep = Node.create({
  name: 'stepsStep',
  content: 'stepsLabel stepsText',
  defining: true,
  addAttributes() {
    return {
      icon:  { default: null, parseHTML: (el) => el.getAttribute('data-icon'), renderHTML: (a) => (a.icon ? { 'data-icon': a.icon } : {}) },
      image: { default: null, parseHTML: (el) => el.getAttribute('data-image'), renderHTML: (a) => (a.image ? { 'data-image': a.image } : {}) },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="steps-step"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'steps-step' }), 0]; },
});

export const StepsLabel = Node.create({
  name: 'stepsLabel',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-st-label]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-st-label': '' }), 0]; },
});

export const StepsText = Node.create({
  name: 'stepsText',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-st-text]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-st-text': '' }), 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface StepsAt {
  node:  PMNode;
  pos:   number;
  part:  'name' | 'label' | 'text';
  index: number;          // which step (-1 in the name)
}

function stepsAt($pos: ResolvedPos): StepsAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'steps') continue;
    const child = d < $pos.depth ? $pos.index(d) : 0;
    if (child === 0) return { node: $pos.node(d), pos: $pos.before(d), part: 'name', index: -1 };
    const inStep = d + 1 < $pos.depth ? $pos.index(d + 1) : 0;
    return { node: $pos.node(d), pos: $pos.before(d), part: inStep === 0 ? 'label' : 'text', index: child - 1 };
  }
  return null;
}

const stepCount = (node: PMNode) => node.childCount - 1;
const stepAt = (node: PMNode, index: number) => node.child(index + 1);
function stepPos(node: PMNode, pos: number, index: number): number {
  let p = pos + 1 + node.child(0).nodeSize;
  for (let i = 0; i < index; i++) p += stepAt(node, i).nodeSize;
  return p;
}
const isEmptyStep = (step: PMNode) => step.textContent.trim() === '';
const nameEnd = (node: PMNode, pos: number) => pos + 2 + node.child(0).content.size;
const labelEnd = (node: PMNode, pos: number, index: number) => stepPos(node, pos, index) + 2 + stepAt(node, index).child(0).content.size;
const textEnd = (node: PMNode, pos: number, index: number) => {
  const step = stepAt(node, index);
  return stepPos(node, pos, index) + 1 + step.child(0).nodeSize + 1 + step.child(1).content.size;
};

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

const newStep = (state: EditorState) => state.schema.nodes.stepsStep.create(null, [
  state.schema.nodes.stepsLabel.create(),
  state.schema.nodes.stepsText.create(),
]);

// `\steps`: replaces from..to (what was typed and the space before it) with three empty steps,
// the cursor in the name ("Data preprocessing"), Enter going on to the first step.
export function insertSteps(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.steps;
  if (!type) return null;
  const node = type.create(null, [state.schema.nodes.stepsName.create(), ...Array.from({ length: DEFAULT_STEPS }, () => newStep(state))]);
  const made = replaceTypedWithBlock(state, from, to, node);
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

export type StepsSettings = Partial<{ variant: StepsVariant; colours: 'accent' | 'spectrum' }>;

export function setStepsSettings(view: EditorView, pos: number, attrs: StepsSettings): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'steps') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function setStepAttrs(view: EditorView, pos: number, attrs: Partial<{ icon: string | null; image: string | null }>): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'stepsStep') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

// A new step at the end (or the start, with atStart).
export function addStep(view: EditorView, pos: number, atStart = false): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'steps') return;
  const at = atStart ? stepPos(node, pos, 0) : pos + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, newStep(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

export const canDeleteStep = (state: EditorState, pos: number) => {
  const parent = state.doc.resolve(pos).parent;
  return parent.type.name === 'steps' && stepCount(parent) > MIN_STEPS;
};

export function deleteStep(view: EditorView, pos: number): boolean {
  const step = view.state.doc.nodeAt(pos);
  if (step?.type.name !== 'stepsStep' || !canDeleteStep(view.state, pos)) return false;
  const tr = view.state.tr.delete(pos, pos + step.nodeSize);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(pos), -1)).scrollIntoView());
  view.focus();
  return true;
}

export function stepsPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="steps"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'steps' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function caretTo(state: EditorState, pos: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  return true;
}

function leave(state: EditorState, s: StepsAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const tr = state.tr;
  let end = s.pos + s.node.nodeSize;
  if (s.index >= 0 && stepCount(s.node) > MIN_STEPS) {
    const sp = stepPos(s.node, s.pos, s.index);
    const size = stepAt(s.node, s.index).nodeSize;
    tr.delete(sp, sp + size);
    end -= size;
  }
  tr.insert(end, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  return true;
}

export const stepsEnter: Command = (state, dispatch) => {
  const s = stepsAt(state.selection.$from);
  if (!s) return false;
  if (s.part === 'name') return caretTo(state, labelEnd(s.node, s.pos, 0), dispatch);
  const step = stepAt(s.node, s.index);
  if (isEmptyStep(step)) return leave(state, s, dispatch);
  if (s.part === 'label') return caretTo(state, textEnd(s.node, s.pos, s.index), dispatch);
  if (s.index + 1 < stepCount(s.node) && isEmptyStep(stepAt(s.node, s.index + 1))) return caretTo(state, labelEnd(s.node, s.pos, s.index + 1), dispatch);
  if (dispatch) {
    const at = stepPos(s.node, s.pos, s.index) + step.nodeSize;
    const tr = state.tr.insert(at, newStep(state));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  }
  return true;
};

export const stepsTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const s = stepsAt(state.selection.$from);
  if (!s) return false;
  const next = s.index + dir;
  if (next < 0) return s.index === 0 ? caretTo(state, nameEnd(s.node, s.pos), dispatch) : true;
  if (next >= stepCount(s.node)) return true;
  return caretTo(state, labelEnd(s.node, s.pos, next), dispatch);
};

export const stepsBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const s = stepsAt($from);
  if (!s) return false;
  if (s.part === 'name') {
    if (s.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(s.pos, s.pos + s.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, s.pos + 1)));
    }
    return true;
  }
  if (s.part === 'text') return caretTo(state, labelEnd(s.node, s.pos, s.index), dispatch);
  if (s.index === 0) return caretTo(state, nameEnd(s.node, s.pos), dispatch);
  const step = stepAt(s.node, s.index);
  const prevEnd = textEnd(s.node, s.pos, s.index - 1);
  if (isEmptyStep(step) && stepCount(s.node) > MIN_STEPS) {
    if (dispatch) {
      const sp = stepPos(s.node, s.pos, s.index);
      const tr = state.tr.delete(sp, sp + step.nodeSize);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, prevEnd)).scrollIntoView());
    }
    return true;
  }
  return caretTo(state, prevEnd, dispatch);
};

export const stepsDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!stepsAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

function deleteWidget(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-st-delete', '');
  b.title = LABELS.noteBlocks.steps.deleteStep;
  b.setAttribute('aria-label', LABELS.noteBlocks.steps.deleteStep);
  b.append(createGlyph('trash'));
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p !== undefined && view.editable) deleteStep(view, view.state.doc.resolve(p).before());
  });
  return b;
}

// The step's icon slot (blockIcons.ts). The widget sits at the start of the step's content.
function iconWidget(view: EditorView, getPos: () => number | undefined, icon: string | null, image: string | null): HTMLElement {
  const stepAtPos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  return iconSlot({ icon, image, attr: 'data-steps-icon', partPos: stepAtPos, set: (sp, v) => setStepAttrs(view, sp, v) }, () => view.focus());
}

const DESIGN_ICONS: Record<StepsVariant, string> = {
  stepper:  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="3" r="1.7"/><circle cx="3.5" cy="8" r="1.7"/><circle cx="3.5" cy="13" r="1.7"/><path d="M3.5 4.7v1.6M3.5 9.7v1.6M7 3h7.5M7 8h7.5M7 13h5"/></svg>',
  chevrons: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 5h3.6L6.4 8 4.6 11H1l1.8-3Z"/><path d="M6.2 5h3.6L11.6 8 9.8 11H6.2L8 8Z"/><path d="M11.4 5H15v6h-3.6L13.2 8Z"/></svg>',
  cards:    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="4" width="4" height="8" rx="1"/><rect x="11" y="4" width="4" height="8" rx="1"/><path d="M6 8h3.4M8.2 6.6 9.6 8 8.2 9.4"/></svg>',
  stairs:   '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 14.5h13M2 14.5v-3h4v-3h4v-3h4v9"/></svg>',
};

export const STEPS_DESIGNS: BlockDesign<StepsVariant>[] = STEPS_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.steps.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.steps;
  const C = LABELS.noteBlocks.cycle;
  const bar = blockPill('data-steps-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const set = (a: StepsSettings) => { const p = pos(); if (p !== null) setStepsSettings(view, p, a); };
  const spectrum = attrs.colours === 'spectrum';
  const colours = pillButton(C.colourTitle(spectrum ? C.colours.spectrum : C.colours.accent), () => set({ colours: spectrum ? 'accent' : 'spectrum' }));
  colours.setAttribute('data-st-tool', 'colours');
  colours.setAttribute('aria-pressed', String(spectrum));
  const add = pillButton(L.addStep, () => { const p = pos(); if (p !== null) addStep(view, p); }, `+ ${L.addStep}`);
  add.setAttribute('data-st-tool', 'add');
  bar.append(designButtons(STEPS_DESIGNS, attrs.variant as StepsVariant, (v) => set({ variant: v })), colours, add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function stepsDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.steps;
  const current = stepsAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'steps') return !node.isTextblock;
    const k = t++;
    const n = stepCount(node);
    const editing = current?.pos === pos;
    const spectrum = node.attrs.colours === 'spectrum';
    decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `--st-n: ${n}`, ...(editing ? { 'data-st-current': '' } : {}) }));
    const key = `${node.attrs.variant}-${node.attrs.colours}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `steps-tools-${k}-${key}`, ignoreSelection: true, stopEvent: () => true }));
    const name = node.child(0);
    if (name.content.size === 0) {
      decos.push(Decoration.node(pos + 1, pos + 1 + name.nodeSize, editing
        ? { 'data-st-empty': '', 'data-st-placeholder': L.namePlaceholder }
        : { 'data-st-hide': '' }));
    }
    let offset = pos + 1 + name.nodeSize;
    for (let i = 0; i < n; i++) {
      const step = stepAt(node, i);
      const sp = offset;
      offset += step.nodeSize;
      const colour = spectrum ? `--step-color: ${spectrumColour(i / Math.max(1, n - 1), 300)}` : `--step-mix: ${Math.round(14 + (30 * i) / Math.max(1, n - 1))}%`;
      decos.push(Decoration.node(sp, sp + step.nodeSize, { style: `--i: ${i}; ${colour}`, ...(i === 0 ? { 'data-st-first': '' } : {}) }));
      decos.push(Decoration.widget(sp + 1, (view, getPos) => iconWidget(view, getPos, step.attrs.icon, step.attrs.image),
        { side: -1, key: `steps-icon-${k}-${i}-${step.attrs.icon ?? ''}-${(step.attrs.image ?? '').length}`, ignoreSelection: true, stopEvent: () => true }));
      if (n > MIN_STEPS) {
        decos.push(Decoration.widget(sp + step.nodeSize - 1, (view, getPos) => deleteWidget(view, getPos),
          { side: 1, key: `steps-delete-${k}-${i}`, ignoreSelection: true, stopEvent: () => true }));
      }
      const label = step.child(0);
      const text = step.child(1);
      const labelPos = sp + 1;
      const textPos = labelPos + label.nodeSize;
      if (label.content.size === 0) decos.push(Decoration.node(labelPos, textPos, { 'data-st-empty': '', 'data-st-placeholder': i === 0 ? L.firstPlaceholder : L.stepPlaceholder }));
      if (text.content.size === 0) {
        decos.push(Decoration.node(textPos, textPos + text.nodeSize, editing
          ? { 'data-st-empty': '', 'data-st-placeholder': L.textPlaceholder }
          : { 'data-st-hide': '' }));
      }
    }
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const stepsKey = new PluginKey('steps');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const StepsBehaviour = Extension.create({
  name: 'stepsBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(stepsEnter),
      Tab: run(stepsTab(1)),
      'Shift-Tab': run(stepsTab(-1)),
      Backspace: run(stepsBackspace),
      Delete: run(stepsDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: stepsKey, props: { decorations: stepsDecorations } })];
  },
});

export const StepsExtensions = [Steps, StepsName, StepsStep, StepsLabel, StepsText, StepsBehaviour];
