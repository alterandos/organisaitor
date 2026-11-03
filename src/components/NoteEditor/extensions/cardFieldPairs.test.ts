// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { pairsBeforeInput, pairsKeyDown } from './cardFieldPairs';

let field: HTMLElement;
afterEach(() => field?.remove());

function make(html = '') {
  field = document.createElement('div');
  field.contentEditable = 'true';
  field.innerHTML = html;
  document.body.appendChild(field);
}
function caretAt(node: Node, offset: number) {
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(r);
}
const caretAtEnd = () => {
  const last = field.lastChild ?? field;
  caretAt(last, last instanceof Text ? last.length : last.childNodes.length);
};
// Types as the browser would, unless the field took the input itself.
function type(text: string) {
  for (const ch of text) {
    const e = new InputEvent('beforeinput', { inputType: 'insertText', data: ch, cancelable: true });
    if (pairsBeforeInput(field, e)) continue;
    const sel = window.getSelection()!;
    const { anchorNode, anchorOffset } = sel;
    if (anchorNode instanceof Text) { anchorNode.insertData(anchorOffset, ch); caretAt(anchorNode, anchorOffset + 1); }
    else { const t = document.createTextNode(ch); anchorNode!.insertBefore(t, anchorNode!.childNodes[anchorOffset] ?? null); caretAt(t, 1); }
  }
}
const backspace = () => pairsBeforeInput(field, new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true }));
const tab = () => pairsKeyDown(field, { key: 'Tab', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() {} });
// The field's text with the caret drawn as |.
const shown = () => {
  const sel = window.getSelection()!;
  const r = document.createRange();
  r.setStart(field, 0);
  r.setEnd(sel.anchorNode!, sel.anchorOffset);
  const before = r.toString();
  return before + '|' + (field.textContent ?? '').slice(before.length);
};

describe('brackets and quotes close themselves in a card field (2026-11-02)', () => {
  it('( and " put in the pair; typing the closing mark steps over it', () => {
    make();
    caretAtEnd();
    type('f(');
    expect(shown()).toBe('f(|)');
    type('"');
    expect(shown()).toBe('f("|")');
    type('x")');
    expect(shown()).toBe('f("x")|');
  });

  it('Tab jumps past the closing mark; Backspace straight after the opening one takes both', () => {
    make();
    caretAtEnd();
    type('[ab');
    expect(tab()).toBe(true);
    expect(shown()).toBe('[ab]|');
    expect(tab()).toBe(false);
    type(' {');
    backspace();
    expect(shown()).toBe('[ab] |');
  });

  it("an apostrophe after a letter stays one mark, and before a word only one bracket goes in", () => {
    make();
    caretAtEnd();
    type("don't");
    expect(shown()).toBe("don't|");
    make('word');
    caretAt(field.firstChild!, 0);
    type('(');
    expect(shown()).toBe('(|word');
  });

  it('a mark wraps selected text', () => {
    make('word');
    const r = document.createRange();
    r.selectNodeContents(field);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(r);
    type('"');
    expect(field.textContent).toBe('"word"');
  });

  it('after a term link the pair goes outside it; not in code', () => {
    make('See <a data-term="t">ASX</a>');
    caretAt(field.querySelector('a')!.firstChild!, 3);
    type('(');
    expect(field.innerHTML).toBe('See <a data-term="t">ASX</a>()');
    make('<code>x</code>');
    caretAt(field.querySelector('code')!.firstChild!, 1);
    expect(pairsBeforeInput(field, new InputEvent('beforeinput', { inputType: 'insertText', data: '(', cancelable: true }))).toBe(false);
  });
});
