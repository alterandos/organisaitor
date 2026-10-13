import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { createElement, lazy, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LABELS } from '@/config/labels';
import { DIAGRAM_KINDS, emptyDiagram, normalizeDiagram, type DiagramKind, type DiagramSpec } from '@/diagrams/diagramSpec';
import { applyFrameAttrs, blockFrameAttributes, blockPill, designButtons, frameButtons, replaceTypedWithBlock, selectButton, typeIntoBlockPlugin, type BlockDesign } from './blockDesigns';

// A diagram in a note (`\diagram`): boxes and arrows, for a process, a mind map or a flowchart
// (agreed with the user 2026-10-13). One atom node holding a library-neutral DiagramSpec (`spec`)
// and the arrangement (`variant`, its design): Free, Flow or Flowchart. Like the chart block, the
// diagram itself is the shared src/diagrams/ widget (loaded the first time one is shown, with its
// libraries); this file is the block around it: its node, `\diagram`, the pill, frames, selection.

const DiagramWidget = lazy(() => import('@/diagrams/DiagramWidget'));

const ICONS: Record<DiagramKind, string> = {
  free:      '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="4.5" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><path d="M5.7 5.6 6.8 10.3M10.3 5.4 9 10.3"/></svg>',
  flow:      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="6" width="4" height="4" rx="1"/><rect x="11" y="6" width="4" height="4" rx="1"/><path d="M5 8h5.5M9 6.5 10.5 8 9 9.5"/></svg>',
  flowchart: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="1" width="6" height="3" rx="1.5"/><path d="M8 4v2M8 6l3 2.5L8 11 5 8.5Z"/><path d="M8 11v2"/><rect x="5.5" y="13" width="5" height="2" rx=".5"/></svg>',
};
export const DIAGRAM_DESIGNS: BlockDesign<DiagramKind>[] = DIAGRAM_KINDS.map((id) => ({ id, label: LABELS.diagrams.kinds[id], icon: ICONS[id] }));

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Diagram = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'free', parseHTML: (el) => oneOf(DIAGRAM_KINDS, el.getAttribute('data-variant'), 'free'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      spec: {
        default: null,
        parseHTML: (el) => { try { return normalizeDiagram(JSON.parse(el.getAttribute('data-spec') ?? 'null')); } catch { return emptyDiagram(); } },
        renderHTML: (a) => ({ 'data-spec': JSON.stringify(normalizeDiagram(a.spec)) }),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="diagram"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram', 'data-note-block': '' })]; },

  addNodeView() {
    return ({ node, editor, getPos }) => new DiagramView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

// ── Making and changing ──────────────────────────────────────────────────────

// `\diagram`: one empty box, ready to name.
export function insertDiagram(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.diagram;
  if (!type) return null;
  const made = replaceTypedWithBlock(state, from, to, type.create({ spec: emptyDiagram() }));
  if (!made) return null;
  return made.tr.setSelection(NodeSelection.create(made.tr.doc, made.at)).scrollIntoView();
}

export function setDiagramSettings(view: EditorView, pos: number, attrs: Partial<{ variant: DiagramKind; spec: DiagramSpec }>): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'diagram') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function diagramPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="diagram"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) if (view.state.doc.nodeAt(p)?.type.name === 'diagram') return p;
    return null;
  } catch { return null; }
}

export function focusDiagram(view: EditorView, pos: number): void {
  (view.nodeDOM(pos) as HTMLElement | null)?.dispatchEvent(new CustomEvent('diagram-focus'));
}

// ── The view ─────────────────────────────────────────────────────────────────

class DiagramView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private pill: HTMLElement;
  private body: HTMLElement;
  private root: Root;
  private focusSignal = 0;

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.setAttribute('data-type', 'diagram');
    this.dom.setAttribute('data-note-block', '');
    this.dom.contentEditable = 'false';
    this.pill = document.createElement('div');
    this.body = document.createElement('div');
    this.body.setAttribute('data-diagram-body', '');
    this.dom.append(this.pill, this.body);
    this.root = createRoot(this.body);
    this.dom.addEventListener('diagram-focus', () => { this.focusSignal++; this.render(); });
    this.render();
  }

  private selectSelf = () => {
    const pos = this.getPos();
    if (pos === undefined) return;
    const view = this.editor.view;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  };

  private commit = (spec: DiagramSpec) => {
    const pos = this.getPos();
    if (pos !== undefined) setDiagramSettings(this.editor.view, pos, { spec });
  };

  private render() {
    const a = this.node.attrs;
    this.dom.setAttribute('data-variant', a.variant as string);
    applyFrameAttrs(this.dom, a);
    const view = this.editor.view;
    const getPos = () => { const p = this.getPos(); return p === undefined ? undefined : p + 1; };
    const bar = blockPill('data-diagram-tools');
    const pick = (v: DiagramKind) => { const p = this.getPos(); if (p !== undefined && view.editable) setDiagramSettings(view, p, { variant: v }); };
    bar.append(designButtons(DIAGRAM_DESIGNS, a.variant as DiagramKind, pick), frameButtons(view, getPos, a), selectButton(view, getPos));
    this.pill.replaceWith(bar);
    this.pill = bar;
    this.root.render(createElement(Suspense, { fallback: createElement('div', { 'data-diagram-loading': '' }, LABELS.diagrams.loading) },
      createElement(DiagramWidget, {
        spec: normalizeDiagram(a.spec), kind: a.variant as DiagramKind, editable: this.editor.isEditable,
        onCommit: this.commit, onEscape: this.selectSelf, focusSignal: this.focusSignal,
      })));
  }

  update(node: PMNode) {
    if (node.type.name !== 'diagram') return false;
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

// Typing on a selected diagram (or Enter) gives it the keyboard, never replaces it.
export const DiagramBehaviour = Extension.create({
  name: 'diagramBehaviour',
  priority: 110,
  addProseMirrorPlugins() {
    return [typeIntoBlockPlugin(['diagram'], (view, pos) => focusDiagram(view, pos))];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = this.editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'diagram') return false;
        focusDiagram(this.editor.view, sel.from);
        return true;
      },
    };
  },
});

export const DiagramExtensions = [Diagram, DiagramBehaviour];
