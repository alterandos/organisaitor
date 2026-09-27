import { describe, expect, it } from 'vitest';
import { toggleWrap, insertMarkdownLink } from './markdownTextEdit';

describe('toggleWrap', () => {
  it('wraps a selection in the marker', () => {
    const r = toggleWrap('hello world', 6, 11, '**');
    expect(r.value).toBe('hello **world**');
    expect(r.selectionStart).toBe(8);
    expect(r.selectionEnd).toBe(13);
  });

  it('wraps with a single-character marker (italic)', () => {
    const r = toggleWrap('hello world', 0, 5, '*');
    expect(r.value).toBe('*hello* world');
    expect(r.selectionStart).toBe(1);
    expect(r.selectionEnd).toBe(6);
  });

  it('inserts an empty marker pair with no selection, cursor placed between', () => {
    const r = toggleWrap('hello world', 5, 5, '**');
    expect(r.value).toBe('hello**** world');
    expect(r.selectionStart).toBe(7);
    expect(r.selectionEnd).toBe(7);
  });

  it('unwraps when the selection is already exactly wrapped (toggle off)', () => {
    const r = toggleWrap('hello **world**', 8, 13, '**');
    expect(r.value).toBe('hello world');
    expect(r.selectionStart).toBe(6);
    expect(r.selectionEnd).toBe(11);
  });

  it('does not falsely detect wrapping when only one side matches', () => {
    const r = toggleWrap('**hello world', 2, 7, '**');
    expect(r.value).toBe('****hello** world');
  });

  it('handles wrapping the entire string', () => {
    const r = toggleWrap('hello', 0, 5, '**');
    expect(r.value).toBe('**hello**');
  });
});

describe('insertMarkdownLink', () => {
  it('replaces the selection with a Markdown link using the selected text as the label', () => {
    const r = insertMarkdownLink('check this out', 6, 14, 'https://example.com');
    expect(r.value).toBe('check [this out](https://example.com)');
    expect(r.selectionStart).toBe(r.selectionEnd);
    expect(r.selectionStart).toBe('check [this out](https://example.com)'.length);
  });

  it('uses an explicit linkText over the current selection', () => {
    const r = insertMarkdownLink('check this out', 6, 14, 'https://example.com', 'here');
    expect(r.value).toBe('check [here](https://example.com)');
  });

  it('falls back to the url itself as the label when there is no selection and no linkText', () => {
    const r = insertMarkdownLink('notes: ', 7, 7, 'https://example.com');
    expect(r.value).toBe('notes: [https://example.com](https://example.com)');
  });

  it('places the cursor immediately after the inserted link', () => {
    const r = insertMarkdownLink('abc', 3, 3, 'https://x.com', 'x');
    expect(r.value).toBe('abc[x](https://x.com)');
    expect(r.selectionStart).toBe(r.value.length);
    expect(r.selectionEnd).toBe(r.value.length);
  });
});
