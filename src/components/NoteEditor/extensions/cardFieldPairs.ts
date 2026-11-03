import { CLOSES, PAIRS, opensPair } from '@/utils/autoPairs';
import { caretIn, charsAroundCaret, insertAtCaret, setCaret } from './cardFieldText';

// Brackets and quotes close themselves in a Glossary card's fields as in note text (asked for by the
// user 2026-11-02; the rules are utils/autoPairs.ts, the note editor's side is AutoBrackets.ts).
// Typing an opening mark puts in the pair with the caret between; while the caret is still inside a
// pair made this way, typing its closing mark steps over it, Tab jumps past it, and Backspace straight
// after the opening mark takes both away. With text selected, the mark wraps it. Not in code.
//
// A pair is remembered by its text node and how far its closing mark is from the node's end, which
// typing inside the pair doesn't change; one whose closing mark isn't there any more is forgotten.

interface FieldPair { node: Text; fromEnd: number; close: string }
const made = new WeakMap<HTMLElement, FieldPair[]>();

const closeAt = (p: FieldPair) => p.node.length - p.fromEnd;
const inCode = (node: Node) => !!(node instanceof Element ? node : node.parentElement)?.closest('code');

// The innermost pair made here that the caret is still inside.
function pairAround(field: HTMLElement): FieldPair | null {
  const at = caretIn(field);
  const live = (made.get(field) ?? []).filter((p) => p.node.isConnected && field.contains(p.node)
    && closeAt(p) >= 0 && p.node.data[closeAt(p)] === p.close);
  made.set(field, live);
  if (!at) return null;
  return live.filter((p) => p.node === at.node && at.offset <= closeAt(p) && at.offset > 0).sort((a, b) => b.fromEnd - a.fromEnd)[0] ?? null;
}

const forget = (field: HTMLElement, pair: FieldPair) => made.set(field, (made.get(field) ?? []).filter((p) => p !== pair));

// For a native `beforeinput` listener on the field; true when it handled the input itself.
export function pairsBeforeInput(field: HTMLElement, e: InputEvent): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode || !field.contains(sel.anchorNode) || inCode(sel.anchorNode)) return false;
  if (e.inputType === 'deleteContentBackward') return backspace(field, e);
  if (e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return false;
  const ch = e.data;
  // A quote's opening and closing marks are the same, so stepping over one comes first.
  if (CLOSES.has(ch) && sel.isCollapsed) {
    const pair = pairAround(field);
    const at = caretIn(field);
    if (pair && at && at.offset === closeAt(pair) && pair.close === ch) {
      e.preventDefault();
      forget(field, pair);
      setCaret(at.sel, pair.node, closeAt(pair) + 1);
      return true;
    }
  }
  const close = PAIRS[ch];
  if (!close) return false;
  if (!sel.isCollapsed) return wrap(field, sel, ch, close, e);
  const around = charsAroundCaret(field);
  if (!around || !opensPair(ch, around.before, around.after)) return false;
  e.preventDefault();
  const put = insertAtCaret(field, ch + close, 1);
  if (put) made.set(field, [...(made.get(field) ?? []), { node: put.node, fromEnd: put.node.length - (put.start + 1), close }]);
  return true;
}

function wrap(field: HTMLElement, sel: Selection, open: string, close: string, e: InputEvent): boolean {
  const range = sel.getRangeAt(0);
  if (!field.contains(range.commonAncestorContainer)) return false;
  e.preventDefault();
  const end = range.cloneRange();
  end.collapse(false);
  end.insertNode(document.createTextNode(close));
  const start = range.cloneRange();
  start.collapse(true);
  const opener = document.createTextNode(open);
  start.insertNode(opener);
  const inner = document.createRange();
  inner.setStartAfter(opener);
  inner.setEnd(end.startContainer, end.startOffset);
  sel.removeAllRanges();
  sel.addRange(inner);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function backspace(field: HTMLElement, e: InputEvent): boolean {
  const pair = pairAround(field);
  const at = caretIn(field);
  if (!pair || !at || at.offset !== closeAt(pair) || PAIRS[pair.node.data[at.offset - 1]] !== pair.close) return false;
  e.preventDefault();
  forget(field, pair);
  pair.node.deleteData(at.offset - 1, 2);
  setCaret(at.sel, pair.node, at.offset - 1);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

// Tab inside a pair made here jumps past its closing mark; true when it did (the key is then the
// field's, not the card's).
export function pairsKeyDown(field: HTMLElement, e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault(): void; stopPropagation(): void }): boolean {
  if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
  const pair = pairAround(field);
  const at = caretIn(field);
  if (!pair || !at) return false;
  e.preventDefault();
  e.stopPropagation();
  forget(field, pair);
  setCaret(at.sel, pair.node, closeAt(pair) + 1);
  return true;
}
