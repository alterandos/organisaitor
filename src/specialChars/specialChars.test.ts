// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SPECIAL_CHARS, exactChar, findCharTrigger, findShortcut, matchChars } from './charSets';
import { installSpecialCharInput } from './fieldInput';

Element.prototype.scrollIntoView = () => {};   // jsdom has none

describe('reading //name', () => {
  it('starts at the start of a word only (never inside a URL)', () => {
    expect(findCharTrigger('//al')).toEqual({ start: 0, query: 'al' });
    expect(findCharTrigger('angle (//th')).toEqual({ start: 7, query: 'th' });
    expect(findCharTrigger('see https://')).toBeNull();
    expect(findCharTrigger('a//b')).toBeNull();
    expect(findCharTrigger('//sup2')).toEqual({ start: 0, query: 'sup2' });   // digits may end a name
    expect(findCharTrigger('//2')).toBeNull();                                // but never start one
  });

  it('arrows, maths symbols and super/subscript digits; case only matters for Greek', () => {
    expect(exactChar('to')).toBe('→');
    expect(exactChar('implies')).toBe('⇒');
    expect(exactChar('inf')).toBe('∞');
    expect(exactChar('cdot')).toBe('⋅');
    expect(exactChar('middot')).toBe('·');
    expect(exactChar('Inf')).toBe('∞');
    expect(exactChar('pm')).toBe('±');
    expect(exactChar('neq')).toBe('≠');
    expect(exactChar('leq')).toBe('≤');
    expect(exactChar('sum')).toBe('∑');
    expect(exactChar('sqrt')).toBe('√');
    expect(exactChar('deg')).toBe('°');
    expect(exactChar('sup2')).toBe('²');
    expect(exactChar('sub0')).toBe('₀');
    expect(matchChars('infinity')[0].char).toBe('∞');      // an alias
    expect(matchChars('in')[0].char).toBe('∈');            // exact before the names it starts
    expect(matchChars('in').map((m) => m.char)).toEqual(expect.arrayContaining(['∞', '∫']));
    expect(matchChars('pi')[0].char).toBe('π');
  });

  it('findShortcut: the shortcut just completed, and what to replace', () => {
    expect(findShortcut('a -->')).toEqual({ start: 2, char: '→', typed: '-->' });
    expect(findShortcut('x^2')).toEqual({ start: 1, char: '²', typed: '^2' });
    expect(findShortcut('x²3')).toEqual({ start: 2, char: '³', typed: '3' });
    expect(findShortcut('a <')).toBeNull();
    expect(findShortcut('page 23')).toBeNull();
  });

  it('every name and alias is unique and short enough to type', () => {
    const names = SPECIAL_CHARS.flatMap((e) => [e.name, ...(e.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(findCharTrigger(`//${n}`)?.query).toBe(n);
  });

  it('matches names best first; a capital gives the capital letter; look-alikes find it', () => {
    expect(matchChars('al')[0].char).toBe('α');
    expect(matchChars('D')[0]).toMatchObject({ char: 'Δ', label: 'Delta' });
    expect(matchChars('ps')[0].char).toBe('ψ');
    expect(matchChars('w')[0].char).toBe('ω');
    expect(matchChars('')).toHaveLength(24);
    expect(matchChars('vareps')[0].char).toBe('ϵ');
    expect(matchChars('Varphi')).toEqual([]);   // variants have no capital
    expect(exactChar('Omega')).toBe('Ω');
    expect(exactChar('ome')).toBeNull();
  });
});

describe('in any text field', () => {
  let uninstall: () => void;
  let field: HTMLTextAreaElement;
  beforeEach(() => {
    uninstall = installSpecialCharInput();
    field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
  });
  afterEach(() => { uninstall(); field.remove(); document.body.replaceChildren(); });

  const type = (text: string) => {
    for (const ch of text) {
      field.setRangeText(ch, field.selectionStart, field.selectionEnd, 'end');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const key = (k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    field.dispatchEvent(e);
    return e;
  };

  it('shows the list while a name is typed, and Enter puts the highlighted letter in', () => {
    type('angle //th');
    expect(document.body.textContent).toContain('θ');
    key('Enter');
    expect(field.value).toBe('angle θ');
    expect(document.body.textContent).not.toContain('theta');
  });

  it('↓ moves the highlight; the whole name and a space does it without the list', () => {
    type('//e');
    key('ArrowDown');
    key('Tab');
    expect(field.value).toBe(matchChars('e')[1].char);
    field.value = '';
    type('x = //Sigma ');
    expect(field.value).toBe('x = Σ ');
  });

  // Typed characters arrive as InputEvents (insertText); a paste or our own replace() doesn't.
  const typeKeys = (text: string, target: HTMLInputElement | HTMLTextAreaElement = field) => {
    for (const ch of text) {
      target.setRangeText(ch, target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end');
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
    }
  };

  it('shortcuts replace as typed: --> <-- <= >= != ^2', () => {
    typeKeys('a --> b <-- c <= d >= e != f x^2 y^23');
    expect(field.value).toBe('a → b ← c ≤ d ≥ e ≠ f x² y²³');
  });

  it('Backspace straight after a shortcut puts the typed text back; later it deletes as usual', () => {
    typeKeys('x <=');
    expect(key('Backspace').defaultPrevented).toBe(true);
    expect(field.value).toBe('x <=');
    field.value = '';
    typeKeys('x != y');
    expect(key('Backspace').defaultPrevented).toBe(false);   // not straight after: left to the field
    expect(field.value).toBe('x ≠ y');
  });

  it('a paste is left alone, and URL, email and search fields get no shortcuts', () => {
    field.setRangeText('a <= b', 0, 0, 'end');
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    expect(field.value).toBe('a <= b');
    const url = document.createElement('input');
    url.type = 'url';
    document.body.append(url);
    url.focus();
    typeKeys('https://x.com/?a!=b', url);
    expect(url.value).toBe('https://x.com/?a!=b');
  });

  it("Esc keeps the text and doesn't reach the pane around the field", () => {
    let reached = false;
    const listener = () => { reached = true; };
    document.addEventListener('keydown', listener);
    type('//pi');
    const e = key('Escape');
    document.removeEventListener('keydown', listener);
    expect(field.value).toBe('//pi');
    expect(e.defaultPrevented).toBe(true);
    expect(reached).toBe(false);
  });
});
