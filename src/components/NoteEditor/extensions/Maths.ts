import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import type { MathfieldElement } from 'mathlive';
import { LABELS } from '@/config/labels';
import { useSettingsStore, type MathSlash } from '@/store/settingsStore';
import { log, errorMessage } from '@/utils/log';
import { applyFrameAttrs, blockFrameAttributes, blockPill, designButtons, frameButtons, registerEnterableBlock, selectButton, typeIntoBlockPlugin, type BlockDesign } from './blockDesigns';

// Maths in a note (`\maths`): typed the way Word's equation editor works — `x^2` gives a
// superscript, `h_0` a subscript, `/` a fraction, `alpha` or `\alpha` gives α, `\int`, `\sum`,
// `\sqrt`… — by MathLive's editor (its own chunk, loaded the first time a note shows maths; until
// then the LaTeX shows as text). What's stored is the LaTeX, so the note stays readable and the
// library could be swapped. On a line of its own it's a block (three designs, frames, selection);
// inside a line of text it's inline. Super/subscripts happen inside maths only, never in prose.

export const MATH_VARIANTS = ['centred', 'left', 'numbered'] as const;
export type MathVariant = typeof MATH_VARIANTS[number];

export const MATH_DESIGNS: BlockDesign<MathVariant>[] = [
  { id: 'centred',  label: LABELS.noteBlocks.maths.designs.centred,  icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4.5 8h7M2 12h12"/></svg>' },
  { id: 'left',     label: LABELS.noteBlocks.maths.designs.left,     icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h7M2 12h12"/></svg>' },
  { id: 'numbered', label: LABELS.noteBlocks.maths.designs.numbered, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h6.5"/><path d="M12 5.5c-.8.7-.8 4.3 0 5M14.2 5.5c.8.7.8 4.3 0 5"/></svg>' },
];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

const latexAttr = {
  default: '',
  parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') ?? el.textContent ?? '',
  renderHTML: (a: Record<string, unknown>) => ({ 'data-latex': a.latex }),
};

// ── Loading MathLive ─────────────────────────────────────────────────────────

type MathLive = typeof import('mathlive');
let loading: Promise<MathLive> | null = null;

export function loadMathLive(): Promise<MathLive> {
  loading ??= Promise.all([import('mathlive'), import('mathlive/fonts.css')]).then(([m]) => {
    // The fonts come from fonts.css (bundled, so they work offline); no keypress sounds.
    m.MathfieldElement.fontsDirectory = null;
    m.MathfieldElement.soundsDirectory = null;
    return m;
  });
  return loading;
}

// ── Typing in maths ──────────────────────────────────────────────────────────

// Words that become a symbol as they're typed, on top of MathLive's own (`alpha`, `~~` for ≈, `xx`
// for ×, `!=`…): the ones people looked for and didn't find (2026-10-16). The same names as the
// `//name` special characters elsewhere in the app.
export const MATH_SHORTCUTS: Record<string, string> = {
  approx: '\\approx',
  cdot:   '\\cdot',
  dot:    '\\cdot',
  neq:    '\\neq',
  equiv:  '\\equiv',
  propto: '\\propto',
};

type KeyBinding = { key: string; ifMode?: string; command: unknown };
const FRACTION = ['insert', '\\frac{#@}{#?}'];
const SLASH = ['insert', '/'];
const SLASH_KEYS = new Set(['/', 'alt+/', '[Slash]', 'alt+[Slash]']);

// What `/` does in maths (Settings → Notes, settingsStore.mathSlash): a fraction (as in Word's
// equation editor) or a plain slash; Alt+/ always gives the other. They take the place of
// MathLive's own bindings for those keys: kept beside them, MathLive reports the pair as ambiguous
// and Alt+/ did nothing (checked in Chromium 2026-10-16).
export function slashBindings(mode: MathSlash): KeyBinding[] {
  const [plain, alt] = mode === 'slash' ? [SLASH, FRACTION] : [FRACTION, SLASH];
  return [
    { key: '/', ifMode: 'math', command: plain },
    { key: 'alt+/', ifMode: 'math', command: alt },
  ];
}

// ── The nodes ────────────────────────────────────────────────────────────────

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      latex: latexAttr,
      variant: { default: 'centred', parseHTML: (el) => oneOf(MATH_VARIANTS, el.getAttribute('data-variant'), 'centred'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="math"]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math', 'data-note-block': '' }), node.attrs.latex as string];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => new MathView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() { return { latex: latexAttr }; },

  parseHTML() { return [{ tag: 'span[data-type="math-inline"]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' }), node.attrs.latex as string];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => new MathView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

// ── Making and changing ──────────────────────────────────────────────────────

// `\maths`: on a line with nothing else, a maths block replaces the line; inside text, inline maths
// takes the place of what was typed. Either way its editor opens (editMathAt).
export function insertMaths(state: EditorState, from: number, to: number): { tr: Transaction; pos: number } | null {
  const $from = state.doc.resolve(from);
  const parent = $from.parent;
  const rest = parent.textBetween(0, $from.parentOffset) + parent.textBetween(state.doc.resolve(to).parentOffset, parent.content.size);
  if (parent.isTextblock && rest.trim() === '' && $from.depth > 0) {
    const type = state.schema.nodes.mathBlock;
    const d = $from.depth;
    if (!type || !$from.node(d - 1).canReplaceWith($from.index(d - 1), $from.index(d - 1) + 1, type)) return null;
    const at = $from.before(d);
    const tr = state.tr.replaceWith(at, $from.after(d), type.create());
    return { tr: tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView(), pos: at };
  }
  const type = state.schema.nodes.mathInline;
  if (!type) return null;
  const tr = state.tr.replaceWith(from, to, type.create());
  return { tr: tr.setSelection(NodeSelection.create(tr.doc, from)).scrollIntoView(), pos: from };
}

export function setMathSettings(view: EditorView, pos: number, attrs: Partial<{ latex: string; variant: MathVariant }>): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'mathBlock' && node?.type.name !== 'mathInline') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

// Opens the maths at `pos` for typing (after `\maths`, Enter on a selected one, the right-click menu).
// `text` is typed into it: keys that reached the note while the maths was selected but its editor
// didn't have focus yet (MathLive takes focus 60 ms late, and loads late the first time).
export function editMathAt(view: EditorView, pos: number, text?: string, edge?: 'start' | 'end'): void {
  (view.nodeDOM(pos) as HTMLElement | null)?.dispatchEvent(new CustomEvent('math-edit', { detail: { text, edge } }));
}

// Arrowing into maths (blockDesigns.ts registerEnterableBlock) opens it with the cursor at that edge.
const enterMath = (view: EditorView, pos: number, edge: 'start' | 'end') => {
  const node = view.state.doc.nodeAt(pos);
  if (node?.isBlock) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  editMathAt(view, pos, undefined, edge);
};
registerEnterableBlock('mathBlock', enterMath);
registerEnterableBlock('mathInline', enterMath);


export function mathPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="math"], [data-type="math-inline"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) {
      const name = view.state.doc.nodeAt(p)?.type.name;
      if (name === 'mathBlock' || name === 'mathInline') return p;
    }
    return null;
  } catch { return null; }
}

// Leaves the maths at `pos`, putting the cursor in the text after (or before) it. A block with no
// text after it gets a new paragraph to type into.
export function leaveMath(view: EditorView, pos: number, forward: boolean): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  const edge = forward ? pos + node.nodeSize : pos;
  let tr = view.state.tr;
  if (node.isInline) {
    tr = tr.setSelection(TextSelection.create(tr.doc, edge));
  } else {
    const found = Selection.findFrom(tr.doc.resolve(edge), forward ? 1 : -1, true);
    if (found) tr = tr.setSelection(found);
    else {
      const paragraph = view.state.schema.nodes.paragraph;
      const $edge = tr.doc.resolve(edge);
      if (!forward || !paragraph || !$edge.parent.canReplaceWith($edge.index(), $edge.index(), paragraph)) return;
      tr = tr.insert(edge, paragraph.create());
      tr = tr.setSelection(TextSelection.create(tr.doc, edge + 1));
    }
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

// ── The view ─────────────────────────────────────────────────────────────────
// One view for both nodes: a MathLive field (the LaTeX as text until it's loaded), plus, for a
// block, the pill (design, frames, select). Typing commits the LaTeX to the node on every change.

class MathView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private pill: HTMLElement | null = null;
  private holder: HTMLElement;
  private field: MathfieldElement | null = null;
  private wantFocus = false;
  private pendingText = '';
  private focusEdge: 'start' | 'end' | null = null;
  private destroyed = false;
  private baseBindings: KeyBinding[] = [];
  private offSettings = useSettingsStore.subscribe((st, prev) => {
    if (st.mathSlash === prev.mathSlash || !this.field) return;
    this.field.keybindings = [...this.baseBindings, ...slashBindings(st.mathSlash)] as typeof this.field.keybindings;
  });

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    const block = node.type.name === 'mathBlock';
    this.dom = document.createElement(block ? 'div' : 'span');
    this.dom.setAttribute('data-type', block ? 'math' : 'math-inline');
    if (block) this.dom.setAttribute('data-note-block', '');
    this.dom.contentEditable = 'false';
    this.holder = document.createElement('span');
    this.holder.setAttribute('data-math-holder', '');
    this.holder.textContent = node.attrs.latex as string;
    if (block) { this.pill = document.createElement('div'); this.dom.append(this.pill); }
    this.dom.append(this.holder);
    this.dom.addEventListener('math-edit', (e) => {
      const detail = (e as CustomEvent<{ text?: string; edge?: 'start' | 'end' }>).detail;
      this.wantFocus = true;
      this.focusEdge = detail?.edge ?? null;
      this.pendingText += detail?.text ?? '';
      this.typePending();
      this.focusField();
    });
    this.render();
    loadMathLive().then((m) => this.mount(m)).catch((e) => log.warn('maths', 'could not load the maths editor', errorMessage(e)));
  }

  private get pos(): number | undefined { return this.getPos(); }

  private mount(m: MathLive) {
    if (this.destroyed) return;
    const field = new m.MathfieldElement();
    // Attached first: MathLive throws ("Mathfield not mounted") on some properties (menuItems) of a
    // field that isn't in the page yet.
    this.holder.replaceChildren(field);
    field.setAttribute('data-math-field', '');
    field.setAttribute('aria-label', LABELS.noteBlocks.maths.fieldLabel);
    field.placeholder = `\\text{${LABELS.noteBlocks.maths.placeholder}}`;
    field.menuItems = [];
    field.inlineShortcuts = { ...field.inlineShortcuts, ...MATH_SHORTCUTS };
    this.baseBindings = (field.keybindings as KeyBinding[]).filter((b) => !SLASH_KEYS.has(b.key));
    field.keybindings = [...this.baseBindings, ...slashBindings(useSettingsStore.getState().mathSlash)] as typeof field.keybindings;
    field.readOnly = !this.editor.isEditable;
    field.value = this.node.attrs.latex as string;
    field.addEventListener('input', () => this.commit(field.value));
    field.addEventListener('move-out', (e) => {
      e.preventDefault();
      const p = this.pos;
      const dir = (e as CustomEvent<{ direction: string }>).detail.direction;
      if (p !== undefined) leaveMath(this.editor.view, p, dir === 'forward' || dir === 'downward');
    });
    // Before MathLive sees them: Esc selects the maths (as in every block; in LaTeX-command mode it
    // stays MathLive's, ending the command); Enter leaves it, forwards.
    field.addEventListener('keydown', (e) => {
      if (field.mode === 'latex' || e.isComposing) return;
      const p = this.pos;
      if (p === undefined) return;
      const view = this.editor.view;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, p)));
        view.focus();
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        leaveMath(view, p, true);
      }
    }, true);
    // Plain keys typed into the maths are the maths', not the app's: the app's hotkeys can't tell
    // a MathLive field (a custom element) from the page, so N, digits… would otherwise fire them.
    field.addEventListener('keydown', (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation(); });
    this.field = field;
    this.typePending();
    this.focusField();
  }

  private typePending() {
    if (!this.field || !this.pendingText) return;
    this.field.executeCommand(['typedText', this.pendingText, {}]);
    this.pendingText = '';
    this.commit(this.field.value);
  }

  private focusField() {
    if (!this.wantFocus || !this.field || !this.field.isConnected) return;
    this.wantFocus = false;
    this.field.focus();
    if (this.focusEdge) this.field.executeCommand(this.focusEdge === 'start' ? 'moveToMathfieldStart' : 'moveToMathfieldEnd');
    this.focusEdge = null;
  }

  private commit(latex: string) {
    const p = this.pos;
    if (p === undefined || latex === this.node.attrs.latex) return;
    setMathSettings(this.editor.view, p, { latex });
  }

  private render() {
    const a = this.node.attrs;
    if (!this.pill) return;
    this.dom.setAttribute('data-variant', a.variant as string);
    applyFrameAttrs(this.dom, a);
    const view = this.editor.view;
    const getPos = () => { const p = this.pos; return p === undefined ? undefined : p + 1; };
    const bar = blockPill('data-math-tools');
    const set = (v: MathVariant) => { const p = this.pos; if (p !== undefined && view.editable) setMathSettings(view, p, { variant: v }); };
    bar.append(designButtons(MATH_DESIGNS, a.variant as MathVariant, set), frameButtons(view, getPos, a), selectButton(view, getPos));
    this.pill.replaceWith(bar);
    this.pill = bar;
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const latex = node.attrs.latex as string;
    if (this.field) {
      if (this.field.value !== latex) this.field.setValue(latex, { silenceNotifications: true });
      this.field.readOnly = !this.editor.isEditable;
    } else {
      this.holder.textContent = latex;
    }
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }

  stopEvent(e: Event) {
    const t = e.target as globalThis.Node | null;
    return !!t && (this.holder.contains(t) || !!this.pill?.contains(t));
  }

  ignoreMutation() { return true; }

  destroy() { this.destroyed = true; this.offSettings(); }
}

// Enter on a selected maths opens it for typing, and typing on a selected maths types into it
// (never replaces it: right after `\maths` the maths is selected until its editor takes focus).
export const MathBehaviour = Extension.create({
  name: 'mathBehaviour',
  priority: 110,
  addProseMirrorPlugins() {
    return [typeIntoBlockPlugin(['mathBlock', 'mathInline'], (view, pos, text) => editMathAt(view, pos, text))];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = this.editor.state.selection;
        if (!(sel instanceof NodeSelection) || (sel.node.type.name !== 'mathBlock' && sel.node.type.name !== 'mathInline')) return false;
        editMathAt(this.editor.view, sel.from);
        return true;
      },
    };
  },
});

export const MathExtensions = [MathBlock, MathInline, MathBehaviour];
