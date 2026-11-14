import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { freshRun, nextRun, promptData, promptRuns, type PromptData } from '@/utils/aiPrompt';
import type { NoteEditorMenuApi } from '../contextMenu';
import { applyFrameAttrs, blockFrameAttributes, blockPill, designButtons, designMenuItem, frameButtons, frameMenuItem, leaveBlockBelow, pillButton, replaceTypedWithBlock, selectButton, typeIntoBlockPlugin, type BlockDesign } from './blockDesigns';
import { blockResizeHandle, blockWidth, blockWidthAttributes, showBlockWidth, widthMenuItem } from './blockWidth';
import { PromptBody, type PromptFocus } from './PromptBody';

// An AI prompt kept in a note (`\prompt`, agreed with the user 2026-11-11): a skeleton reused run
// after run, so the background an agent always needs isn't written out again. One atom node
// holding the prompt (title, sections, fill-ins, whether it's a template, when it was last sent);
// the body is PromptBody.tsx, the rules utils/aiPrompt.ts, and where it goes services/
// aiPromptTargets.ts (copy today; the agent, once built, plugs in there). Not a Glossary record:
// the Glossary is for what you've learnt (the user's call), and a template is just a prompt
// marked as one, found in the notes when asked.
//
// Designs: Tile (small: its name, what it holds, the main send and New run; a click opens it to
// edit, Escape or Close folds it back) and Full (always open). Open, it's as wide as what it holds
// (Fit text) until given a width by its right edge ("Block widths"), as cards are.

export type PromptDesign = 'tile' | 'full';
const PROMPT_VARIANTS: readonly PromptDesign[] = ['tile', 'full'];
export const PROMPT_DESIGNS: BlockDesign<PromptDesign>[] = [
  { id: 'tile', label: LABELS.noteBlocks.prompt.designs.tile, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="2"/><path d="M5 7h6M5 9.5h3"/></svg>' },
  { id: 'full', label: LABELS.noteBlocks.prompt.designs.full, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2"/><path d="M4 4.5h8M4 7.5h8M4 10.5h5"/></svg>' },
];

const json = <T>(text: string | null, fallback: T): T => { try { return (text ? JSON.parse(text) : fallback) ?? fallback; } catch { return fallback; } };
const jsonAttr = <T>(name: string, fallback: T) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => json(el.getAttribute(`data-${name}`), fallback),
  renderHTML: (a: Record<string, unknown>) => ({ [`data-${name}`]: JSON.stringify(a[name] ?? fallback) }),
});

export const PromptBlock = Node.create({
  name: 'promptBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      ...blockWidthAttributes(),
      variant:  { default: 'tile', parseHTML: (el) => (PROMPT_VARIANTS as readonly string[]).includes(el.getAttribute('data-variant') ?? '') ? el.getAttribute('data-variant') : 'tile', renderHTML: (a) => ({ 'data-variant': a.variant }) },
      title:    { default: '', parseHTML: (el) => el.getAttribute('data-title') ?? '', renderHTML: (a) => (a.title ? { 'data-title': a.title } : {}) },
      sections: jsonAttr('sections', [] as unknown[]),
      fills:    jsonAttr('fills', [] as unknown[]),
      template: { default: false, parseHTML: (el) => el.hasAttribute('data-template'), renderHTML: (a) => (a.template ? { 'data-template': '' } : {}) },
      sentAt:   { default: null, parseHTML: (el) => el.getAttribute('data-sent-at'), renderHTML: (a) => (a.sentAt ? { 'data-sent-at': a.sentAt } : {}) },
      // Which run it's on, and the earlier ones (utils/aiPrompt.ts promptRuns), and whether a tile
      // was left open (so it's as it was on coming back to the note: 2026-11-13).
      run:      { default: 1, parseHTML: (el) => Number(el.getAttribute('data-run')) || 1, renderHTML: (a) => ((a.run as number) > 1 ? { 'data-run': String(a.run) } : {}) },
      runs:     jsonAttr('runs', [] as unknown[]),
      open:     { default: false, parseHTML: (el) => el.hasAttribute('data-open'), renderHTML: (a) => (a.open ? { 'data-open': '' } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="prompt"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'prompt', 'data-note-block': '' })]; },

  addNodeView() {
    return ({ node, editor, getPos }) => new PromptView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

// A new prompt starts with one section, kept, ready to write in.
export const emptyPrompt = (): Partial<PromptData> => ({ sections: [{ id: nanoid(6), name: '', text: '', perRun: false }] });

// `\prompt`: an empty prompt in place of what was typed, open, its title ready to type.
export function insertPrompt(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.promptBlock;
  if (!type) return null;
  const made = replaceTypedWithBlock(state, from, to, type.create(emptyPrompt()));
  if (!made) return null;
  return made.tr.setSelection(NodeSelection.create(made.tr.doc, made.at)).scrollIntoView();
}

export function setPromptAttrs(view: EditorView, pos: number, attrs: Record<string, unknown>, opts: { history?: boolean } = {}): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'promptBlock') return;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
  if (opts.history === false) tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}

// A new run, in place (2026-11-13; it used to put a fresh copy after this one, which left this one
// looking unchanged): this run goes into the run list, the each-run sections and fill-ins are
// emptied, and it opens at its first each-run section. A template stays as it is: using it makes a
// fresh prompt after it.
export function newPromptRun(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'promptBlock' || !view.editable) return;
  if (!node.attrs.template) {
    const next = nextRun(promptData(node.attrs), promptRuns(node.attrs), new Date().toISOString());
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next, sentAt: null, open: true }));
    openPrompt(view, pos, { where: 'run' });
    return;
  }
  const fresh = freshRun(promptData(node.attrs));
  const at = pos + node.nodeSize;
  const copy = node.type.create({ ...node.attrs, ...fresh, sections: fresh.sections.map((s) => ({ ...s, id: nanoid(6) })), sentAt: null, run: 1, runs: [], open: true });
  const tr = view.state.tr.insert(at, copy);
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
  openPrompt(view, at, { where: 'run' });
}

export function promptPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="prompt"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) if (view.state.doc.nodeAt(p)?.type.name === 'promptBlock') return p;
    return null;
  } catch { return null; }
}

// Opens a prompt to edit and puts the cursor in it (a request held until it has drawn itself).
export function openPrompt(view: EditorView, pos: number, focus: Omit<PromptFocus, 'n'> = {}): void {
  (view.nodeDOM(pos) as HTMLElement | null)?.dispatchEvent(new CustomEvent('prompt-open', { detail: focus }));
}

class PromptView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private pill: HTMLElement;
  private body: HTMLElement;
  private handle: HTMLElement;
  private root: Root;
  private destroyed = false;
  private open: boolean;
  private focus: PromptFocus = { n: 0 };

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    this.open = !!node.attrs.open;
    this.dom = document.createElement('div');
    this.dom.setAttribute('data-type', 'prompt');
    this.dom.setAttribute('data-note-block', '');
    this.dom.contentEditable = 'false';
    this.pill = document.createElement('div');
    this.body = document.createElement('div');
    this.handle = blockResizeHandle(() => this.editor.view, () => this.getPos(), () => 'auto', (w) => showBlockWidth(this.dom, w));
    this.dom.append(this.pill, this.body, this.handle);
    this.root = createRoot(this.body);
    this.dom.addEventListener('prompt-open', (e) => {
      this.remember(true);
      this.focus = { ...(e as CustomEvent<Omit<PromptFocus, 'n'>>).detail, n: this.focus.n + 1 };
      this.render();
    });
    // A new, empty prompt opens straight away.
    if (!promptData(node.attrs).title && promptData(node.attrs).sections.every((s) => !s.text)) { this.open = true; this.focus = { n: 1, where: 'title' }; }
    this.render();
  }

  private pos = () => { const p = this.getPos(); return p === undefined || !this.editor.isEditable ? null : p; };

  private change = (patch: Partial<PromptData> & { sentAt?: string }, history = true) => {
    const p = this.pos();
    if (p !== null) setPromptAttrs(this.editor.view, p, patch, { history });
  };

  // Open or folded, kept on the block (outside the undo history), so coming back to the note finds it as it was left.
  private remember(open: boolean) {
    this.open = open;
    const p = this.pos();
    if (p !== null && !!this.node.attrs.open !== open) setPromptAttrs(this.editor.view, p, { open }, { history: false });
  }

  private setOpen = (open: boolean) => {
    if (this.open === open) return;
    this.remember(open);
    this.render();
    if (!open) this.selectSelf();
  };

  // Ctrl+Enter, or Enter from its last field: left as it is, onto a new line below (a tile folds).
  private leave = () => {
    const pos = this.getPos();
    if (pos === undefined) return;
    if (this.open && this.node.attrs.variant === 'tile') { this.remember(false); this.render(); }
    leaveBlockBelow(this.editor.view, pos);
  };

  private selectSelf = () => {
    const pos = this.getPos();
    if (pos === undefined) return;
    const view = this.editor.view;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  };

  private render() {
    if (this.destroyed) return;
    const a = this.node.attrs;
    const view = this.editor.view;
    const variant = a.variant as PromptDesign;
    const isOpen = variant === 'full' || this.open;
    this.dom.setAttribute('data-variant', variant);
    this.dom.toggleAttribute('data-prompt-open', isOpen);
    // Its width while open (a folded tile keeps its own small size).
    if (isOpen) showBlockWidth(this.dom, blockWidth(a, 'auto'));
    else { this.dom.removeAttribute('data-block-width-shown'); this.dom.style.removeProperty('--block-w'); }
    applyFrameAttrs(this.dom, { ...a, outlined: false });   // drawn as a tile with its own border: no Outline
    const getPos = () => { const p = this.getPos(); return p === undefined ? undefined : p + 1; };
    const bar = blockPill('data-prompt-tools');
    const pick = (v: PromptDesign) => { const p = this.pos(); if (p !== null) setPromptAttrs(view, p, { variant: v }); };
    const tmpl = pillButton(LABELS.noteBlocks.prompt.makeTemplate, () => { const p = this.pos(); if (p !== null) setPromptAttrs(view, p, { template: !a.template }); }, LABELS.noteBlocks.prompt.template);
    tmpl.setAttribute('data-prompt-template', '');
    tmpl.setAttribute('aria-pressed', String(!!a.template));
    bar.append(designButtons(PROMPT_DESIGNS, variant, pick), tmpl, frameButtons(view, getPos, a), selectButton(view, getPos));
    this.pill.replaceWith(bar);
    this.pill = bar;
    this.root.render(createElement(PromptBody, {
      data: promptData(a), sentAt: (a.sentAt as string | null) ?? null, open: variant === 'full' || this.open, canFold: variant === 'tile',
      editable: this.editor.isEditable, focus: this.focus,
      onChange: this.change, onOpen: this.setOpen, onEscape: this.selectSelf, onLeave: this.leave,
      onNewRun: () => { const p = this.pos(); if (p !== null) newPromptRun(view, p); },
      runs: promptRuns(a),
      onClearRuns: () => { const p = this.pos(); if (p !== null) setPromptAttrs(view, p, { runs: [] }); },
    }));
  }

  update(node: PMNode) {
    if (node.type.name !== 'promptBlock') return false;
    if (!!node.attrs.open !== !!this.node.attrs.open) this.open = !!node.attrs.open;
    this.node = node;
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }

  stopEvent(e: Event) {
    const t = e.target as globalThis.Node | null;
    return !!t && (this.body.contains(t) || this.pill.contains(t) || this.handle.contains(t));
  }

  ignoreMutation() { return true; }

  destroy() { this.destroyed = true; const root = this.root; setTimeout(() => root.unmount(), 0); }
}

// Typing on a selected prompt (or Enter) opens it and types into it, never replaces it.
export const PromptBehaviour = Extension.create({
  name: 'promptBehaviour',
  priority: 110,
  addProseMirrorPlugins() {
    return [typeIntoBlockPlugin(['promptBlock'], (view, pos, text) => openPrompt(view, pos, { text }))];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = this.editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'promptBlock') return false;
        openPrompt(this.editor.view, sel.from);
        return true;
      },
    };
  },
});

export const PromptExtensions = [PromptBlock, PromptBehaviour];

// Right-click on a prompt: open it, a new run, template, its design and frame.
registerContextMenuProvider({
  id: 'note-editor.prompt',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="prompt"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = promptPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.prompt;
    return [
      { id: 'prompt-open', label: L.open, run: () => openPrompt(view, pos) },
      { id: 'prompt-new-run', label: node.attrs.template ? L.useTemplate : L.newRun, run: () => newPromptRun(view, pos) },
      { id: 'prompt-template', label: L.makeTemplate, icon: node.attrs.template ? '✓' : undefined, run: () => setPromptAttrs(view, pos, { template: !node.attrs.template }) },
      designMenuItem(PROMPT_DESIGNS, node.attrs.variant as PromptDesign, (v) => setPromptAttrs(view, pos, { variant: v })),
      widthMenuItem(view, pos, node.attrs, 'auto'),
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});
