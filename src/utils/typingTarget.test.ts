// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isTypingTarget } from './typingTarget';

afterEach(() => { document.body.replaceChildren(); });

// What a document listener (App's hotkeys) sees: the check runs during the dispatch, as it does in
// a real handler (composedPath() is empty once the event has finished).
const keyOn = (el: Element) => {
  let typing = false;
  let target: EventTarget | null = null;
  const listen = (e: KeyboardEvent) => { typing = isTypingTarget(e); target = e.target; };
  document.addEventListener('keydown', listen);
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, composed: true }));
  document.removeEventListener('keydown', listen);
  return { typing, target };
};

describe('isTypingTarget', () => {
  it('inputs, textareas, selects and editable text are typing; buttons and the page are not', () => {
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = document.createElement('p');
    editable.append(inner);
    const button = document.createElement('button');
    document.body.append(input, area, select, editable, button);
    for (const el of [input, area, select, inner]) expect(keyOn(el).typing).toBe(true);
    expect(keyOn(button).typing).toBe(false);
    expect(keyOn(document.body).typing).toBe(false);
  });

  it('a field inside a custom element’s shadow root is typing, though the document sees only the element', () => {
    const host = document.createElement('div');
    const field = document.createElement('textarea');
    host.attachShadow({ mode: 'open' }).append(field);
    document.body.append(host);
    const seen = keyOn(field);
    expect(seen.target).toBe(host);
    expect(seen.typing).toBe(true);
    field.focus();
    expect(document.activeElement).toBe(host);
    expect(isTypingTarget(document.activeElement)).toBe(true);
  });

  it('nothing focused is not typing', () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
