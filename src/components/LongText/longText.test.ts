// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { longLine, longToHtml } from '@/utils/longText';
import { escapeHtml } from '@/utils/richText';
import { domToLongLines, htmlToLongLines } from './longTextDom';
import { cardLongClean, cardLongDraw, cardLongNormal } from '@/components/NoteEditor/extensions/cardLongText';
import { fieldRich } from '@/config/structuredTagTypes';

// Long text in fields drawn outside the note editor (2026-11-14): Markdown-style lines, shown as
// real lists, read back from what the browser's editing wrote.
describe('long text', () => {
  it('reads a line\'s list, level and text', () => {
    expect(longLine('- a')).toEqual({ list: 'ul', depth: 0, text: 'a' });
    expect(longLine('    3. c')).toEqual({ list: 'ol', depth: 2, text: 'c' });
    expect(longLine('plain - not a list')).toEqual({ list: null, depth: 0, text: 'plain - not a list' });
  });

  it('draws lines and nested lists, and reads them back as written', () => {
    const lines = ['Intro', '- one', '  - one a', '- two', '1. first', '2. second', 'End'];
    const html = longToHtml(lines, escapeHtml);
    expect(html).toBe('<div>Intro</div><ul><li>one</li><ul><li>one a</li></ul><li>two</li></ul><ol><li>first</li><li>second</li></ol><div>End</div>');
    expect(htmlToLongLines(html, { html: false })).toEqual(lines);
  });

  it('reads what the browser writes: a first line loose, lines as divs or <br>s, an item nested inside its parent item', () => {
    const box = document.createElement('div');
    box.innerHTML = 'first<div>second</div>third<br>fourth<ul><li>a<ul><li>b</li></ul></li></ul>';
    expect(domToLongLines(box, { html: false })).toEqual(['first', 'second', 'third', 'fourth', '- a', '  - b']);
  });

  it('keeps a card line\'s formatting, and its text escaped', () => {
    expect(htmlToLongLines('<ul><li><b>key</b> &lt;point&gt;</li></ul>', { html: true })).toEqual(['- <b>key</b> &lt;point&gt;']);
  });
});

describe('a Glossary card\'s long fields (cardLongText.ts)', () => {
  it('draw their lists and save back the same, formatting kept', () => {
    const stored = 'In short<br>- <b>one</b><br>  - one a<br>1. first';
    const drawn = cardLongDraw(stored);
    expect(drawn).toContain('<ul><li><b>one</b></li>');
    expect(cardLongClean(drawn)).toBe(stored);
    expect(cardLongNormal(stored)).toBe(stored);
  });
  it('Key points stored as a list before reads as its bullets', () => {
    expect(fieldRich({ keyPoints: ['a', 'b'] }, 'keyPoints')).toBe('- a<br>- b');
    expect(cardLongDraw(fieldRich({ keyPoints: ['a'] }, 'keyPoints'))).toBe('<ul><li>a</li></ul>');
  });
});
