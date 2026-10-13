// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { MathExtensions, loadMathLive, setMathSettings } from './Maths';
import { NoteBlockSelect } from './blockDesigns';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';

// jsdom can't run MathLive's editor: a stand-in <math-field> with the same surface (value, mode,
// setValue, its input and move-out events), and the same timing where it matters (a property that
// throws before the field is in the page). Everything else is real.
vi.mock('mathlive/fonts.css', () => ({}));
vi.mock('mathlive', () => {
  class MathfieldElement extends HTMLElement {
    static fontsDirectory: string | null = './fonts';
    static soundsDirectory: string | null = './sounds';
    value = '';
    mode = 'math';
    placeholder = '';
    private items: unknown[] = [];
    // As MathLive: this property throws until the field is in the page.
    get menuItems() { if (!this.isConnected) throw new Error('Mathfield not mounted'); return this.items; }
    set menuItems(v: unknown[]) { if (!this.isConnected) throw new Error('Mathfield not mounted'); this.items = v; }
    readOnly = false;
    setValue(v: string) { this.value = v; }
    // As MathLive: a command is a selector string, or [selector, ...arguments].
    commands: string[] = [];
    executeCommand(c: string | [string, string]) {
      if (typeof c === 'string') { this.commands.push(c); return true; }
      if (c[0] === 'typedText') this.value += c[1];
      return true;
    }
    connectedCallback() { this.tabIndex = 0; }
  }
  customElements.define('math-field', MathfieldElement);
  return { MathfieldElement };
});

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content = '<p></p>') {
  const element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...MathExtensions, NoteBlockSelect],
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
const find = (name: string) => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === name) p = pos; }); return p; };
const field = () => editor.view.dom.querySelector('math-field') as HTMLElement & { value: string; mode: string };
// The setup's focus('end') lands a frame later; let it, so it doesn't take focus back.
const settle = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const loaded = async () => { await loadMathLive(); await new Promise((r) => setTimeout(r, 0)); };
const typeMaths = (latex: string) => { const f = field(); f.value = latex; f.dispatchEvent(new Event('input')); };

describe('maths', () => {
  // Kept first: MathLive hasn't loaded yet, as on the first maths of a session.
  it('keys typed before the maths editor has focus go into the maths, never replace it', async () => {
    make();
    await settle();
    type('\\maths ');
    const press = (key: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, cancelable: true })));
    press('x');
    press('^');
    type('2');
    expect(find('mathBlock')).toBeGreaterThanOrEqual(0);
    await loaded();
    expect(field().value).toBe('x^2');
    expect(editor.state.doc.nodeAt(find('mathBlock'))!.attrs.latex).toBe('x^2');
    press('y');
    expect(editor.state.doc.nodeAt(find('mathBlock'))!.attrs.latex).toBe('x^2y');
  });

  it('`\\maths` on an empty line makes a maths block, its editor focused; typing stores the LaTeX', async () => {
    make();
    await settle();
    type('\\maths ');
    expect(find('mathBlock')).toBeGreaterThanOrEqual(0);
    await loaded();
    expect(document.activeElement).toBe(field());
    typeMaths('h_0^2+\\alpha');
    expect(editor.state.doc.nodeAt(find('mathBlock'))!.attrs.latex).toBe('h_0^2+\\alpha');
  });

  it('`\\maths` inside a line of text makes inline maths, the text around it kept', async () => {
    make('<p>Energy is</p>');
    type(' \\eq ');
    expect(find('mathBlock')).toBe(-1);
    const pos = find('mathInline');
    expect(pos).toBeGreaterThan(0);
    expect(editor.state.doc.textBetween(0, pos)).toContain('Energy is');
    await loaded();
    typeMaths('E=mc^2');
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('Energy is $E=mc^2$');
  });

  it('Esc in the editor selects the maths; Enter leaves it; Enter on a selected one opens it again', async () => {
    make('<div data-type="math" data-latex="x"></div>');
    await loaded();
    const pos = find('mathBlock');
    field().focus();
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(pos);
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(document.activeElement).toBe(field());
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.from).toBeGreaterThan(pos);
  });

  it('in LaTeX-command mode Esc stays with MathLive', async () => {
    make('<div data-type="math" data-latex="x"></div>');
    await loaded();
    const before = editor.state.selection.toJSON();
    field().mode = 'latex';
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(editor.state.selection.toJSON()).toEqual(before);
  });

  it('plain keys typed in maths never reach the app (its hotkeys)', async () => {
    make('<div data-type="math" data-latex="x"></div>');
    await loaded();
    const seen: string[] = [];
    const listen = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener('keydown', listen);
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    document.removeEventListener('keydown', listen);
    expect(seen).toEqual(['s']);
  });

  it('LaTeX, design and frame round-trip through JSON and HTML; undo reaches the editor', async () => {
    make('<div data-type="math" data-latex="\\int_0^1 x\\,dx" data-variant="numbered" data-shaded="true" data-shade-color="#336699"></div>');
    const attrs = () => editor.state.doc.nodeAt(find('mathBlock'))!.attrs;
    expect(attrs()).toMatchObject({ latex: '\\int_0^1 x\\,dx', variant: 'numbered', shaded: true, shadeColor: '#336699' });
    const json = editor.getJSON();
    const html = editor.getHTML();
    editor.commands.setContent(json);
    expect(attrs()).toMatchObject({ latex: '\\int_0^1 x\\,dx', variant: 'numbered', shadeColor: '#336699' });
    editor.commands.setContent(html);
    expect(attrs()).toMatchObject({ latex: '\\int_0^1 x\\,dx', variant: 'numbered', shadeColor: '#336699' });
    await loaded();
    setMathSettings(editor.view, find('mathBlock'), { latex: 'y' });
    expect(field().value).toBe('y');
    editor.commands.undo();
    expect(field().value).toBe('\\int_0^1 x\\,dx');
  });

  it('arrowing into maths opens it, the cursor at the edge it was entered from', async () => {
    make('<p>Before</p><div data-type="math" data-latex="x+1"></div><p>After</p>');
    await settle();
    await loaded();
    const commands = () => (field() as unknown as { commands: string[] }).commands;
    const press = (key: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, cancelable: true })));
    editor.commands.setTextSelection(find('mathBlock') - 1);   // the end of "Before"
    expect(press('ArrowRight')).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(field());
    expect(commands().at(-1)).toBe('moveToMathfieldStart');
    const after = find('mathBlock') + editor.state.doc.nodeAt(find('mathBlock'))!.nodeSize + 1;
    editor.commands.setTextSelection(after);
    expect(press('ArrowLeft')).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(commands().at(-1)).toBe('moveToMathfieldEnd');
  });
});
