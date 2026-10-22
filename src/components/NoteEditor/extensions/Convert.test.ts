// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { ConvertExtensions, setConvertAttrs } from './Convert';
import { DesignCycle } from './designCycle';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { useConverterStore } from '@/store/converterStore';

// A conversion in a note (`\convert`, extensions/Convert.ts + ConverterPane/ConvertWidget): made
// through `\`, worked out as you type, the converter changeable, its designs, its text when copied,
// and a custom converter followed when it changes.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
let host: HTMLElement;
beforeEach(() => useConverterStore.setState(useConverterStore.getInitialState(), true));
afterEach(() => { editor?.destroy(); host?.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function make(content = '<p></p>') {
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...ConvertExtensions, DesignCycle],
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
const pos = () => { let p = -1; editor.state.doc.descendants((n, at) => { if (n.type.name === 'convertBlock') p = at; }); return p; };
const node = () => editor.state.doc.nodeAt(pos())!;
const result = () => host.querySelector('output')!.textContent;
const text = () => noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size));

describe('the convert block', () => {
  it('`\\convert` makes a length conversion; typing the amount works it out; the units and converter can change', async () => {
    await make();
    type('\\convert ');
    await flush();
    expect(pos()).toBeGreaterThanOrEqual(0);
    expect(node().attrs).toMatchObject({ variant: 'card', converter: 'length' });
    const amount = host.querySelector<HTMLInputElement>('input[aria-label="Amount"]')!;
    await act(async () => { fireEvent.change(amount, { target: { value: '5' } }); });
    expect(node().attrs.values).toEqual({ amount: '5' });
    expect(text()).toBe('5 m = 16.40419948 ft');
    await act(async () => { fireEvent.change(host.querySelector('select[aria-label="To"]')!, { target: { value: 'km' } }); });
    expect(result()).toBe('0.005');
    await act(async () => { fireEvent.change(host.querySelector('select[aria-label="Converters"]')!, { target: { value: 'temperature' } }); });
    expect(node().attrs).toMatchObject({ converter: 'temperature', from: 'c', to: 'f' });
  });

  it('a custom converter: its inputs, worked out, and followed when it changes; it works back when it has a formula back', async () => {
    const id = useConverterStore.getState().addConverter({ name: 'CO₂ to carbon', icon: null, inputs: [{ key: 'co2', label: 'CO₂', unit: 'kg' }], output: { key: 'c', label: 'Carbon', unit: 'kg' }, formula: 'co2 * 12/44', inverse: 'c * 44/12' });
    await make();
    type('\\convert ');
    await flush();
    act(() => setConvertAttrs(editor.view, pos(), { converter: id, from: null, to: null, values: { co2: '44' } }));
    await flush();
    expect(result()).toBe('12');
    act(() => useConverterStore.getState().updateConverter(id, { formula: 'co2 * 2' }));
    await flush();
    expect(result()).toBe('88');
    await act(async () => { fireEvent.click(host.querySelector('button[aria-label="Swap"]')!); });
    expect(node().attrs.reverse).toBe(true);
  });

  it('designs switch with Ctrl+]; the block round-trips through HTML; typing on it while selected goes into the amount', async () => {
    await make();
    type('\\convert ');
    await flush();
    editor.commands.setNodeSelection(pos());
    const event = new KeyboardEvent('keydown', { key: ']', ctrlKey: true, bubbles: true, cancelable: true });
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, event));
    expect(node().attrs.variant).toBe('compact');
    const html = editor.getHTML();
    await make(html);
    expect(node().attrs).toMatchObject({ variant: 'compact', converter: 'length', values: { amount: '1' } });
    editor.commands.setNodeSelection(pos());
    type('7');
    await flush();
    expect(pos()).toBeGreaterThanOrEqual(0);
    expect(node().attrs.values).toEqual({ amount: '7' });
  });
});
