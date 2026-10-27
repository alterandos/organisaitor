// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SPECIAL_CHARS, exactChar, findCharTrigger, findShortcut, findUserShortcut, matchChars, textShortcutProblem } from './charSets';
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

  it('ticks and crosses, plain and coloured', () => {
    expect(exactChar('tick')).toBe('✓');
    expect(exactChar('greentick')).toBe('✅');
    expect(exactChar('cross')).toBe('✗');
    expect(exactChar('redcross')).toBe('❌');
    expect(matchChars('check')[0].char).toBe('✓'); // an alias, in the list
  });

  it('findShortcut: the shortcut just completed, and what to replace', () => {
    expect(findShortcut('a -->')).toEqual({ start: 2, char: '→', typed: '-->' });
    expect(findShortcut('x^2')).toEqual({ start: 1, char: '²', typed: '^2' });
    expect(findShortcut('x²3')).toEqual({ start: 2, char: '³', typed: '3' });
    expect(findShortcut('a <')).toBeNull();
    expect(findShortcut('page 23')).toBeNull();
    expect(findShortcut('the CO2')).toEqual({ start: 4, char: 'CO₂', typed: 'CO2' });
    expect(findShortcut('H₂O2')).toEqual({ start: 0, char: 'H₂O₂', typed: 'H₂O2' });
    expect(findShortcut('H2O')).toEqual({ start: 0, char: 'H₂O', typed: 'H2O' });
    expect(findShortcut('MCO2')).toBeNull();
    expect(findShortcut('co2')).toBeNull();
    expect(findShortcut('H2')).toBeNull();
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

  it('Ctrl+Z straight after a shortcut or formula puts the typed text back', () => {
    typeKeys('x O2');
    expect(field.value).toBe('x O₂');
    const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    field.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(field.value).toBe('x O2');
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

describe('in a field that is its own contentEditable (a Glossary card\'s fields, 2026-10-27)', () => {
  let uninstall: () => void;
  let host: HTMLDivElement;
  beforeEach(() => {
    uninstall = installSpecialCharInput();
    host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.append(document.createTextNode(''));
    document.body.append(host);
    host.focus();
  });
  afterEach(() => { uninstall(); document.body.replaceChildren(); });

  const text = () => host.firstChild as Text;
  const caret = (at: number) => {
    const r = document.createRange();
    r.setStart(text(), at);
    r.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(r);
  };
  const typeKeys = (s: string) => {
    for (const ch of s) {
      const at = window.getSelection()!.anchorOffset;
      text().insertData(at, ch);
      caret(at + 1);
      host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
    }
  };
  const key = (k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    host.dispatchEvent(e);
    return e;
  };

  it('shortcuts and //names work there too, and Backspace straight after undoes one', () => {
    caret(0);
    typeKeys('CO2 --> x //alpha ');
    expect(host.textContent).toBe('CO₂ → x α ');
    typeKeys('<=');
    expect(key('Backspace').defaultPrevented).toBe(true);
    expect(host.textContent).toBe('CO₂ → x α <=');
  });

  it('never in the note editor itself (ProseMirror has its own extension)', () => {
    host.classList.add('ProseMirror');
    caret(0);
    typeKeys('a -->');
    expect(host.textContent).toBe('a -->');
  });
});

describe('the person’s own shortcuts (findUserShortcut, textShortcutProblem)', () => {
  const list = [{ id: 'a', typed: 'govt', text: 'government' }, { id: 'b', typed: 'e.g', text: 'for example' }, { id: 'c', typed: 'UK', text: 'United Kingdom' }];
  it('fires once the word ends, keeping what ended it, and only on a whole word', () => {
    expect(findUserShortcut('the govt ', list)).toEqual({ start: 4, char: 'government ', typed: 'govt ' });
    expect(findUserShortcut('(govt)', list)).toEqual({ start: 1, char: 'government)', typed: 'govt)' });
    expect(findUserShortcut('the govt', list)).toBeNull();
    expect(findUserShortcut('xgovt ', list)).toBeNull();
    // Never inside a web address, email or path.
    expect(findUserShortcut('see uk.govt ', list)).toBeNull();
    expect(findUserShortcut('docs/govt ', list)).toBeNull();
    expect(findUserShortcut('me@govt.', list)).toBeNull();
    expect(findUserShortcut('non-govt ', list)?.char).toBe('government ');
    expect(findUserShortcut('e.g,', list)).toEqual({ start: 0, char: 'for example,', typed: 'e.g,' });
  });
  it('a replacement ending in the punctuation just typed gets it once: eg. → e.g.', () => {
    const eg = [{ id: 'e', typed: 'eg', text: 'e.g.' }];
    expect(findUserShortcut('see eg.', eg)?.char).toBe('e.g.');
    expect(findUserShortcut('see eg ', eg)?.char).toBe('e.g. ');
    expect(findUserShortcut('see eg,', eg)?.char).toBe('e.g.,');
  });

  it('a lower-case shortcut follows the case it was typed in; any other is exact', () => {
    expect(findUserShortcut('Govt ', list)?.char).toBe('Government ');
    expect(findUserShortcut('GOVT ', list)?.char).toBe('GOVERNMENT ');
    expect(findUserShortcut('gOvt ', list)).toBeNull();
    expect(findUserShortcut('UK ', list)?.char).toBe('United Kingdom ');
    expect(findUserShortcut('uk ', list)).toBeNull();
  });
  it('says why a shortcut cannot be saved', () => {
    expect(textShortcutProblem('', 'x', list)).toBe('typedEmpty');
    expect(textShortcutProblem('a b', 'x', list)).toBe('typedSpace');
    expect(textShortcutProblem('Govt', 'x', list)).toBe('duplicate');
    expect(textShortcutProblem('govt', 'gov', list, 'a')).toBeNull();
    expect(textShortcutProblem('pls', '  ', list)).toBe('textEmpty');
  });
});
