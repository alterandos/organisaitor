// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { DiagramExtensions, setDiagramSettings } from './Diagram';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { normalizeDiagram } from '@/diagrams/diagramSpec';

// jsdom can't run React Flow (it measures the page): a stand-in widget with the same props, which
// records what it was given and can commit a change, as the real one does.
const seen = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/diagrams/DiagramWidget', () => ({
  default: (props: Record<string, unknown>) => { seen.props = props; return null; },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => { editor?.destroy(); seen.props = null; });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...DiagramExtensions],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId: 'n', collectionId: null, now: new Date() });
  editor.commands.focus('end');
  await flush();
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const dPos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'diagram') p = pos; }); return p; };

describe('diagram block', () => {
  it('`\\diagram` makes a diagram with one box; the widget gets its spec and design, and its changes are stored', async () => {
    await make();
    type('\\diagram ');
    await flush();
    await flush();
    expect(dPos()).toBeGreaterThanOrEqual(0);
    expect(seen.props).toMatchObject({ kind: 'free', editable: true });
    expect((seen.props!.spec as { nodes: unknown[] }).nodes).toHaveLength(1);
    const next = normalizeDiagram({ nodes: [{ id: 'a', label: 'Idea' }, { id: 'b', label: 'Plan' }], edges: [{ id: 'e', from: 'a', to: 'b' }] });
    await act(async () => { (seen.props!.onCommit as (s: unknown) => void)(next); });
    expect(normalizeDiagram(editor.state.doc.nodeAt(dPos())!.attrs.spec)).toEqual(next);
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('Idea → Plan');
  });

  it('typing on a selected diagram gives it the keyboard, never replaces it', async () => {
    await make();
    type('\\diagram ');
    await flush();
    await flush();
    editor.commands.setNodeSelection(dPos());
    const before = seen.props!.focusSignal as number;
    const handled = editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: 'x', cancelable: true })));
    await flush();
    expect(handled).toBe(true);
    expect(dPos()).toBeGreaterThanOrEqual(0);
    expect(seen.props!.focusSignal).toBe(before + 1);
  });

  it('design and diagram round-trip through JSON and HTML', async () => {
    await make();
    type('\\diagram ');
    const spec = normalizeDiagram({ nodes: [{ id: 'a', label: 'A', shape: 'diamond' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', from: 'a', to: 'b', label: 'yes' }] });
    setDiagramSettings(editor.view, dPos(), { variant: 'flowchart', spec });
    for (const content of [editor.getJSON(), editor.getHTML()]) {
      editor.commands.setContent(content);
      const node = editor.state.doc.nodeAt(dPos())!;
      expect(node.attrs.variant).toBe('flowchart');
      expect(normalizeDiagram(node.attrs.spec)).toEqual(spec);
    }
  });
});
