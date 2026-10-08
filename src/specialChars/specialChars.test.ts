// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exactChar, findCharTrigger, matchChars } from './charSets';
import { installSpecialCharInput } from './fieldInput';

Element.prototype.scrollIntoView = () => {};   // jsdom has none

describe('reading //name', () => {
  it('starts at the start of a word only (never inside a URL)', () => {
    expect(findCharTrigger('//al')).toEqual({ start: 0, query: 'al' });
    expect(findCharTrigger('angle (//th')).toEqual({ start: 7, query: 'th' });
    expect(findCharTrigger('see https://')).toBeNull();
    expect(findCharTrigger('a//b')).toBeNull();
    expect(findCharTrigger('//alpha1')).toBeNull();
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
