// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { CodeBlockExtensions, colourCode, loadHighlighter, setCodeSettings } from './CodeBlock';
import { NoteBlockSelect } from './blockDesigns';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false, codeBlock: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...CodeBlockExtensions, NoteBlockSelect],
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
const codePos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'codeBlock') p = pos; }); return p; };
const code = () => editor.state.doc.nodeAt(codePos())!;

describe('code block', () => {
  it('`\\code` inserts an empty code block with the cursor in it', () => {
    make();
    type('\\code ');
    expect(codePos()).toBeGreaterThanOrEqual(0);
    expect(editor.state.selection.$from.parent.type.name).toBe('codeBlock');
    type('x = 1');
    expect(code().textContent).toBe('x = 1');
    expect(editor.view.dom.querySelector('[data-type="code-block"][data-note-block]')).not.toBeNull();
  });

  it('``` and a space makes one, as in Markdown', () => {
    make();
    type('```python ');
    expect(code().attrs.language).toBe('python');
  });

  it('`\\` and `//` inside code are just characters', () => {
    make('<pre><code>a</code></pre>');
    editor.commands.setTextSelection(codePos() + 2);
    type(' \\n // done');
    expect(code().textContent).toBe('a \\n // done');
  });

  it('the language is always shown and can be changed there; the gutter counts the lines', () => {
    make('<pre><code class="language-sql">select 1\nfrom t</code></pre>');
    const select = editor.view.dom.querySelector<HTMLSelectElement>('[data-code-language]')!;
    expect(select.value).toBe('sql');
    select.value = 'python';
    select.dispatchEvent(new Event('change'));
    expect(code().attrs.language).toBe('python');
    setCodeSettings(editor.view, codePos(), { variant: 'numbered' });
    expect(editor.view.dom.querySelector('[data-type="code-block"]')!.getAttribute('data-variant')).toBe('numbered');
    expect(editor.view.dom.querySelector('[data-code-gutter]')!.textContent).toBe('1\n2');
  });

  it('design, language and frame round-trip through JSON and HTML; copy gives Markdown', () => {
    make('<pre data-variant="terminal" data-outlined="true" data-outline-color="teal"><code class="language-bash">ls -la</code></pre>');
    expect(code().attrs).toMatchObject({ variant: 'terminal', language: 'bash', outlined: true, outlineColor: 'teal' });
    const json = editor.getJSON();
    const html = editor.getHTML();
    editor.destroy();
    make();
    editor.commands.setContent(json);
    expect(code().attrs).toMatchObject({ variant: 'terminal', language: 'bash', outlineColor: 'teal' });
    editor.commands.setContent(html);
    expect(code().attrs).toMatchObject({ variant: 'terminal', language: 'bash', outlineColor: 'teal' });
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('```bash\nls -la\n```');
  });

  it('Esc inside code selects the whole block', () => {
    make('<pre><code>x</code></pre>');
    editor.commands.setTextSelection(codePos() + 1);
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(editor.state.selection.from).toBe(codePos());
    expect(editor.state.selection.to).toBe(codePos() + code().nodeSize);
  });

  it('colours by language once the highlighter loads, and detects a language when none is set', async () => {
    make('<pre><code class="language-javascript">const a = "x";</code></pre>');
    await loadHighlighter();
    await new Promise((r) => setTimeout(r, 0));
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(editor.view.dom.querySelector('.hljs-string')?.textContent).toBe('"x"');
    setCodeSettings(editor.view, codePos(), { language: null });
    editor.commands.setContent('<pre><code>def greet(name):\n    return f"hi {name}"\n\nclass A:\n    pass</code></pre>');
    expect(colourCode(code()).detected).toBe('python');
    setCodeSettings(editor.view, codePos(), { language: 'plaintext' });
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull();
  });
});
