// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { ChartExtensions, setChartSettings } from './Chart';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { normalizeChart } from '@/charts/chartSpec';

// jsdom has no canvas: the drawing is faked, everything else is real.
const drawn = vi.hoisted(() => ({ calls: [] as { kind: string; title: string }[] }));
vi.mock('@/charts/chartAdapter', async (orig) => ({
  ...(await orig<typeof import('@/charts/chartAdapter')>()),
  readChartTheme: () => ({}),
  drawChart: async (_c: unknown, spec: { title: string }, kind: string) => {
    drawn.calls.push({ kind, title: spec.title });
    return { update: (s: { title: string }, k: string) => drawn.calls.push({ kind: k, title: s.title }), destroy: () => {} };
  },
}));

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => { editor?.destroy(); drawn.calls = []; });

function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...ChartExtensions],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId: 'n', collectionId: null, now: new Date() });
  editor.commands.focus('end');
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const chartPos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'chart') p = pos; }); return p; };
const cell = (id: string) => editor.view.dom.querySelector<HTMLInputElement>(`input[data-chart-cell="${id}"]`)!;
const typeInto = (id: string, value: string) => { const el = cell(id); el.value = value; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('blur')); };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('chart block', () => {
  it('`\\chart` inserts an empty chart with its table open; typing fills it and draws it', async () => {
    make();
    type('\\chart ');
    expect(chartPos()).toBeGreaterThanOrEqual(0);
    expect(editor.view.dom.querySelector('[data-type="chart"] table')).not.toBeNull();
    expect(cell('0:1')).not.toBeNull();
    typeInto('title', 'Revenue');
    typeInto('0:0', 'Q1');
    typeInto('0:1', '1,200');
    const spec = normalizeChart(editor.state.doc.nodeAt(chartPos())!.attrs.spec);
    expect(spec).toMatchObject({ title: 'Revenue', labels: ['Q1', 'B', 'C'], series: [{ values: [1200, null, null] }] });
    await flush();
    expect(drawn.calls.at(-1)).toEqual({ kind: 'column', title: 'Revenue' });
  });

  it('a table pasted into the headings replaces the data; copy gives it back as a table', () => {
    make();
    type('\\chart ');
    const text = 'Quarter\tNorth\tSouth\nQ1\t1\t3\nQ2\t2\t4';
    const data = { getData: (t: string) => (t === 'text/plain' ? text : '') };
    cell('xtitle').dispatchEvent(Object.assign(new Event('paste', { cancelable: true }), { clipboardData: data }));
    const spec = normalizeChart(editor.state.doc.nodeAt(chartPos())!.attrs.spec);
    expect(spec).toMatchObject({ xTitle: 'Quarter', labels: ['Q1', 'Q2'], series: [{ name: 'North', values: [1, 2] }, { name: 'South', values: [3, 4] }] });
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('Quarter\tNorth\tSouth\nQ1\t1\t3\nQ2\t2\t4');
  });

  it('type, stacking and data round-trip through JSON and HTML', () => {
    make();
    type('\\chart ');
    const spec = normalizeChart({ title: 'T', labels: ['a', 'b'], series: [{ name: 's', values: [1, -2] }, { name: 't', values: [3, 4] }], stacking: 'percent' });
    setChartSettings(editor.view, chartPos(), { variant: 'area', spec });
    for (const content of [editor.getJSON(), editor.getHTML()]) {
      editor.commands.setContent(content);
      const node = editor.state.doc.nodeAt(chartPos())!;
      expect(node.attrs.variant).toBe('area');
      expect(normalizeChart(node.attrs.spec)).toEqual(spec);
    }
    // Stacking is offered in the pill once there are two series.
    expect(editor.view.dom.querySelector('[data-chart-tool="stacking"]')?.textContent).toBe('100% stacked');
  });
});
