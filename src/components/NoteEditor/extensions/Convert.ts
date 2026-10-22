import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LABELS } from '@/config/labels';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { ConvertWidget } from '@/components/ConverterPane/ConvertWidget';
import type { ConvertDesign, ConvertValue } from '@/components/ConverterPane/convertValue';
import type { NoteEditorMenuApi } from '../contextMenu';
import { applyFrameAttrs, blockFrameAttributes, blockPill, designButtons, designMenuItem, frameButtons, frameMenuItem, replaceTypedWithBlock, selectButton, typeIntoBlockPlugin, type BlockDesign } from './blockDesigns';

// A conversion in a note (`\convert`, asked for by the user 2026-10-23): one converter, built-in
// units or the person's own (components/ConverterPane), with the amount on the left and the
// answer on the right, worked out as you type. One atom node holding only the choice and what was
// typed (`converter`, `from`, `to`, `values`, `reverse`), never the answer. The conversion itself
// is the shared ConvertWidget; this file is the block around it: its node, `\convert`, the pill,
// designs (Card, Compact), frames, selection. A card-like block (CARD_BLOCK_NODES): no Outline.

const CONVERT_VARIANTS = ['card', 'compact'] as const;
export const CONVERT_DESIGNS: BlockDesign<ConvertDesign>[] = [
  { id: 'card',    label: LABELS.noteBlocks.convert.designs.card,    icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M4 6h3M4 10h2M9.5 10h2.5"/></svg>' },
  { id: 'compact', label: LABELS.noteBlocks.convert.designs.compact, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="5.5" width="13" height="5" rx="1.5"/><path d="M4 8h2M8.5 8h3.5"/></svg>' },
];

const json = <T>(text: string | null, fallback: T): T => { try { return (text ? JSON.parse(text) : fallback) ?? fallback; } catch { return fallback; } };

export const ConvertBlock = Node.create({
  name: 'convertBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant:   { default: 'card', parseHTML: (el) => (CONVERT_VARIANTS as readonly string[]).includes(el.getAttribute('data-variant') ?? '') ? el.getAttribute('data-variant') : 'card', renderHTML: (a) => ({ 'data-variant': a.variant }) },
      converter: { default: 'length', parseHTML: (el) => el.getAttribute('data-converter') || 'length', renderHTML: (a) => ({ 'data-converter': a.converter }) },
      from:      { default: null, parseHTML: (el) => el.getAttribute('data-from'), renderHTML: (a) => (a.from ? { 'data-from': a.from } : {}) },
      to:        { default: null, parseHTML: (el) => el.getAttribute('data-to'), renderHTML: (a) => (a.to ? { 'data-to': a.to } : {}) },
      values:    { default: { amount: '1' }, parseHTML: (el) => json(el.getAttribute('data-values'), { amount: '1' }), renderHTML: (a) => ({ 'data-values': JSON.stringify(a.values ?? {}) }) },
      reverse:   { default: false, parseHTML: (el) => el.getAttribute('data-reverse') === 'true', renderHTML: (a) => (a.reverse ? { 'data-reverse': 'true' } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="convert"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'convert', 'data-note-block': '' })]; },

  addNodeView() {
    return ({ node, editor, getPos }) => new ConvertView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

const valueOf = (a: PMNode['attrs']): ConvertValue => ({ converter: a.converter, from: a.from, to: a.to, values: a.values ?? {}, reverse: !!a.reverse });

// `\convert`: lengths, 1 of the default unit, the amount ready to type over.
export function insertConvert(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.convertBlock;
  if (!type) return null;
  const made = replaceTypedWithBlock(state, from, to, type.create());
  if (!made) return null;
  return made.tr.setSelection(NodeSelection.create(made.tr.doc, made.at)).scrollIntoView();
}

export function setConvertAttrs(view: EditorView, pos: number, attrs: Partial<ConvertValue & { variant: ConvertDesign }>): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'convertBlock') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function convertPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="convert"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) if (view.state.doc.nodeAt(p)?.type.name === 'convertBlock') return p;
    return null;
  } catch { return null; }
}

export function focusConvert(view: EditorView, pos: number, text = ''): void {
  (view.nodeDOM(pos) as HTMLElement | null)?.dispatchEvent(new CustomEvent('convert-focus', { detail: text }));
}

class ConvertView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private pill: HTMLElement;
  private body: HTMLElement;
  private root: Root;
  private focus = { n: 0, text: '' };

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.setAttribute('data-type', 'convert');
    this.dom.setAttribute('data-note-block', '');
    this.dom.contentEditable = 'false';
    this.pill = document.createElement('div');
    this.body = document.createElement('div');
    this.dom.append(this.pill, this.body);
    this.root = createRoot(this.body);
    this.dom.addEventListener('convert-focus', (e) => { this.focus = { n: this.focus.n + 1, text: (e as CustomEvent<string>).detail ?? '' }; this.render(); });
    this.render();
  }

  private selectSelf = () => {
    const pos = this.getPos();
    if (pos === undefined) return;
    const view = this.editor.view;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  };

  private change = (v: ConvertValue) => {
    const pos = this.getPos();
    if (pos !== undefined && this.editor.isEditable) setConvertAttrs(this.editor.view, pos, v);
  };

  private render() {
    const a = this.node.attrs;
    this.dom.setAttribute('data-variant', a.variant as string);
    applyFrameAttrs(this.dom, { ...a, outlined: false });   // a card has its own border: no Outline
    const view = this.editor.view;
    const getPos = () => { const p = this.getPos(); return p === undefined ? undefined : p + 1; };
    const bar = blockPill('data-convert-tools');
    const pick = (v: ConvertDesign) => { const p = this.getPos(); if (p !== undefined && view.editable) setConvertAttrs(view, p, { variant: v }); };
    bar.append(designButtons(CONVERT_DESIGNS, a.variant as ConvertDesign, pick), frameButtons(view, getPos, a), selectButton(view, getPos));
    this.pill.replaceWith(bar);
    this.pill = bar;
    this.root.render(createElement(ConvertWidget, {
      value: valueOf(a), design: a.variant as ConvertDesign, editable: this.editor.isEditable,
      onChange: this.change, focusSignal: this.focus, onEscape: this.selectSelf,
    }));
  }

  update(node: PMNode) {
    if (node.type.name !== 'convertBlock') return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }

  stopEvent(e: Event) {
    const t = e.target as globalThis.Node | null;
    return !!t && (this.body.contains(t) || this.pill.contains(t));
  }

  ignoreMutation() { return true; }

  destroy() { const root = this.root; setTimeout(() => root.unmount(), 0); }
}

// Typing on a selected conversion (or Enter) types into its amount, never replaces it.
export const ConvertBehaviour = Extension.create({
  name: 'convertBehaviour',
  priority: 110,
  addProseMirrorPlugins() {
    return [typeIntoBlockPlugin(['convertBlock'], (view, pos, text) => focusConvert(view, pos, text))];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = this.editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'convertBlock') return false;
        focusConvert(this.editor.view, sel.from);
        return true;
      },
    };
  },
});

export const ConvertExtensions = [ConvertBlock, ConvertBehaviour];

// Right-click on a conversion: its design and frame.
registerContextMenuProvider({
  id: 'note-editor.convert',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="convert"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = convertPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    return [
      designMenuItem(CONVERT_DESIGNS, node.attrs.variant as ConvertDesign, (v) => setConvertAttrs(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});
