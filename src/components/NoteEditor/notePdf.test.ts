// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { buildPrintRoot } from './notePdf';

function mount(html: string): HTMLElement {
  const area = document.createElement('div');
  area.className = 'editorArea';
  area.style.setProperty('zoom', '1.2');
  const content = document.createElement('div');
  content.className = 'editor';
  content.innerHTML = html;
  area.append(content);
  document.body.append(area);
  return content;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('buildPrintRoot', () => {
  it('copies the note inside its wrappers, with the title above', () => {
    const content = mount('<div class="ProseMirror" contenteditable="true"><p>Hello</p></div>');
    const root = buildPrintRoot(content, { title: 'My note', subtitle: 'Tab 2' });
    expect(root.querySelector('[data-print-title]')?.textContent).toBe('My note');
    expect(root.querySelector('[data-print-subtitle]')?.textContent).toBe('Tab 2');
    const shell = root.querySelector('[data-print-shell]') as HTMLElement;
    expect(shell.className).toBe('editorArea');
    expect(shell.style.getPropertyValue('zoom')).toBe('');
    expect(shell.querySelector('.editor p')?.textContent).toBe('Hello');
    expect(root.querySelector('[contenteditable]')).toBeNull();
    expect(content.querySelector('[contenteditable]')).not.toBeNull();   // the editor itself is untouched
  });

  it('leaves out controls and prints folded headings open', () => {
    const content = mount(`<div class="ProseMirror">
      <h2 data-folded="">Head<span data-heading-fold-more="">…</span></h2>
      <p data-fold-hidden="">Hidden</p>
      <div data-note-block="" class="ProseMirror-selectednode"><div data-block-tools=""><button>Design</button></div>Block</div>
      <div data-margin-column="">⚑</div>
    </div>`);
    const root = buildPrintRoot(content, { title: null });
    expect(root.querySelector('[data-print-title]')).toBeNull();
    expect(root.querySelector('[data-block-tools], [data-margin-column], [data-heading-fold-more]')).toBeNull();
    expect(root.querySelector('[data-fold-hidden], [data-folded]')).toBeNull();
    expect(root.querySelector('.ProseMirror-selectednode')).toBeNull();
    expect(root.textContent).toContain('Hidden');
  });

  it('keeps the note when the margin column is showing, and keeps no room for it', () => {
    const content = mount('<div class="ProseMirror" data-margin-mode="open"><p>Kept</p></div><div data-margin-column=""><span>⚑</span></div>');
    const root = buildPrintRoot(content, { title: null });
    const pm = root.querySelector('.ProseMirror');
    expect(pm?.textContent).toBe('Kept');
    expect(pm?.hasAttribute('data-margin-mode')).toBe(false);
    expect(root.textContent).not.toContain('⚑');
  });

  it('keeps what was typed into a block’s fields', () => {
    const content = mount('<div class="ProseMirror"><input><textarea></textarea><select><option>a</option><option>b</option></select></div>');
    (content.querySelector('input') as HTMLInputElement).value = 'typed';
    (content.querySelector('textarea') as HTMLTextAreaElement).value = 'longer';
    (content.querySelector('select') as HTMLSelectElement).selectedIndex = 1;
    const root = buildPrintRoot(content, { title: 'x' });
    expect(root.querySelector('input')?.getAttribute('value')).toBe('typed');
    expect(root.querySelector('textarea')?.textContent).toBe('longer');
    expect(root.querySelectorAll('option')[1].hasAttribute('selected')).toBe(true);
  });

  it('draws maths as static markup', () => {
    const content = mount('<div class="ProseMirror"><math-field>x^2</math-field></div>');
    const root = buildPrintRoot(content, { title: 'x', mathMarkup: (latex) => `<b>${latex}</b>` });
    expect(root.querySelector('math-field')).toBeNull();
    expect(root.querySelector('[data-print-math] b')?.textContent).toBe('x^2');
  });
});
