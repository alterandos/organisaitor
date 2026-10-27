import { exactChar, findCharTrigger, findShortcut, findUserShortcut, matchChars, TRIGGER, type CharMatch } from './charSets';
import { useSettingsStore } from '@/store/settingsStore';
import { hideCharPicker, showCharPicker, type CaretBox } from './charPicker';

// `//name` in every ordinary text field (inputs and textareas, anywhere in the app): one set of
// listeners for the whole document, installed once from App.tsx, so no field has to opt in. The
// note editor isn't an ordinary field — ProseMirror owns its text — and has its own extension
// (NoteEditor/extensions/SpecialCharInput.ts) on the same rules. A field that is its own small
// contentEditable (a Glossary card's fields, 2026-10-27) is served here too: its text is read
// and replaced in the text node the cursor is in.
//
// While a name is being typed a list of characters shows under the cursor: ↑/↓ move, Enter or Tab
// puts the character in, Esc keeps the text. Typing the whole name and a space does it too.
//
// Shortcuts (`-->` → →, `<=` → ≤, `^2` → ²; SHORTCUTS in charSets.ts) replace as they're typed,
// except in URL, email and search fields; Backspace or Ctrl+Z straight after puts the typed text
// back (the browser's own undo doesn't see a replace made by script). The person's own shortcuts
// (`govt` → government, Settings → Typing shortcuts) work the same way once the word is finished.
// A field inside `data-no-shortcuts` (the fields where those shortcuts are written) gets none.

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', '']);
const NO_SHORTCUTS = new Set(['url', 'email', 'search']);

type Field = HTMLInputElement | HTMLTextAreaElement;

const isField = (t: EventTarget | null): t is Field =>
  (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && TEXT_TYPES.has(t.type)))
  && !t.readOnly && !t.disabled;

// A contentEditable of its own, not the note editor (ProseMirror has its own extension).
const isEditableHost = (t: EventTarget | null): t is HTMLElement =>
  t instanceof HTMLElement && t.getAttribute('contenteditable') === 'true' && !t.classList.contains('ProseMirror');

// Where typing is: the text before the cursor, and a way to replace part of it. For an input or a
// textarea that's its value; for a contentEditable, the text node the cursor is in.
interface Spot {
  el:      HTMLElement;
  before:  string;
  caret:   number;
  replace: (start: number, end: number, text: string) => void;
  slice:   (start: number, end: number) => string;
  caretAt: () => number | null;
  box:     () => CaretBox;
  shortcuts: boolean;
}

function spotOf(t: EventTarget | null): Spot | null {
  if (isField(t)) {
    const field = t;
    const caret = field.selectionStart ?? 0;
    if (field.selectionEnd !== caret) return null;
    return {
      el: field, caret, before: field.value.slice(0, caret),
      // The way typing would, so a React field's onChange sees it (setRangeText changes the value
      // under React's tracker; the input event reports it).
      replace: (start, end, text) => { field.setRangeText(text, start, end, 'end'); field.dispatchEvent(new Event('input', { bubbles: true })); },
      slice: (start, end) => field.value.slice(start, end),
      caretAt: () => (field.selectionStart === field.selectionEnd ? field.selectionStart : null),
      box: () => caretBox(field),
      shortcuts: !(field instanceof HTMLInputElement && NO_SHORTCUTS.has(field.type)),
    };
  }
  if (!isEditableHost(t)) return null;
  const host = t;
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  if (!sel || !sel.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !host.contains(node)) return null;
  const text = node as Text;
  return {
    el: host, caret: sel.anchorOffset, before: text.data.slice(0, sel.anchorOffset),
    replace: (start, end, s) => {
      text.replaceData(start, end - start, s);
      const at = document.createRange();
      at.setStart(text, start + s.length);
      at.collapse(true);
      sel.removeAllRanges();
      sel.addRange(at);
      host.dispatchEvent(new Event('input', { bubbles: true }));
    },
    slice: (start, end) => text.data.slice(start, end),
    caretAt: () => { const s = window.getSelection(); return s?.isCollapsed && s.anchorNode === text ? s.anchorOffset : null; },
    box: () => {
      const r = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : host.getBoundingClientRect();
      return { left: r.left - TRIGGER.length * 4, top: r.top, bottom: r.bottom || r.top + 18 };
    },
    shortcuts: true,
  };
}

interface Open { spot: Spot; start: number; end: number; matches: CharMatch[]; selected: number }
let open: Open | null = null;

// The last shortcut made, so Backspace or Ctrl+Z straight after can put the typed text back.
let lastShortcut: { spot: Spot; at: number; char: string; typed: string } | null = null;

function close() {
  open = null;
  hideCharPicker();
}

function choose(i: number) {
  if (!open) return;
  const { spot, start, end, matches } = open;
  const m = matches[i];
  close();
  if (m) spot.replace(start, end, m.char);
}

function render() {
  if (!open) return;
  showCharPicker(open.spot.box(), open.matches, open.selected, choose);
}

function onInput(e: Event) {
  const spot = spotOf(e.target);
  if (!spot) { if (isField(e.target) || isEditableHost(e.target)) close(); return; }
  const { before, caret } = spot;
  lastShortcut = null;
  // A shortcut just completed by typing (not by pasting, or our own replace(), which is a plain Event).
  if (e instanceof InputEvent && e.inputType === 'insertText' && spot.shortcuts && !spot.el.closest('[data-no-shortcuts]')) {
    const s = findShortcut(before) ?? findUserShortcut(before, useSettingsStore.getState().textShortcuts);
    if (s) {
      close();
      spot.replace(s.start, caret, s.char);
      lastShortcut = { spot, at: s.start + s.char.length, char: s.char, typed: s.typed };
      return;
    }
  }
  // The whole name and a space: the character, keeping the space, the cursor after it (replacing
  // only the name left the cursor before the space, so the next letter went in front of it).
  if (before.endsWith(' ')) {
    const t = findCharTrigger(before.slice(0, -1));
    const ch = t && exactChar(t.query);
    if (t && ch) { close(); spot.replace(t.start, caret, `${ch} `); return; }
  }
  const t = findCharTrigger(before);
  if (!t) { if (open?.spot.el === spot.el) close(); return; }
  const matches = matchChars(t.query);
  open = { spot, start: t.start, end: caret, matches, selected: 0 };
  render();
}

// Capture on window, so these keys are seen before anything else (the Escape stack, a form's
// Enter, a pane's Ctrl+Enter, a card's Enter) while the list is up.
function onKeyDown(e: KeyboardEvent) {
  const s = lastShortcut;
  const undoKey = e.key === 'Backspace' ? !e.ctrlKey && !e.metaKey
    : (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey;
  if (s && undoKey && e.target === s.spot.el && !e.altKey
      && s.spot.caretAt() === s.at && s.spot.slice(s.at - s.char.length, s.at) === s.char) {
    e.preventDefault();
    lastShortcut = null;
    s.spot.replace(s.at - s.char.length, s.at, s.typed);
    return;
  }
  if (e.key !== 'Shift') lastShortcut = null;
  if (!open || e.target !== open.spot.el) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    const n = Math.max(1, open.matches.length);
    open.selected = (open.selected + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    render();
  } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey && !e.altKey && open.matches.length) {
    e.preventDefault();
    e.stopPropagation();
    choose(open.selected);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

export function installSpecialCharInput(): () => void {
  const onLeave = () => close();
  document.addEventListener('input', onInput, true);
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusout', onLeave, true);
  window.addEventListener('resize', onLeave);
  document.addEventListener('scroll', onLeave, true);
  return () => {
    close();
    lastShortcut = null;
    document.removeEventListener('input', onInput, true);
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('focusout', onLeave, true);
    window.removeEventListener('resize', onLeave);
    document.removeEventListener('scroll', onLeave, true);
  };
}

// Where the cursor is in a text field, on screen: a hidden copy of the field's text up to the
// cursor, laid out like the field, and where it ends.
function caretBox(field: Field): CaretBox {
  const r = field.getBoundingClientRect();
  const cs = getComputedStyle(field);
  const mirror = document.createElement('div');
  const props = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
    'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'wordSpacing', 'textIndent', 'tabSize'] as const;
  for (const p of props) mirror.style[p] = cs[p];
  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.whiteSpace = field instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre';
  mirror.style.overflowWrap = 'break-word';
  const caret = field.selectionStart ?? field.value.length;
  mirror.textContent = field.value.slice(0, caret);
  const mark = document.createElement('span');
  mark.textContent = '​';
  mirror.append(mark);
  document.body.append(mirror);
  const left = r.left + mark.offsetLeft - field.scrollLeft;
  const top = r.top + mark.offsetTop - field.scrollTop;
  const lineHeight = mark.offsetHeight || parseFloat(cs.fontSize) * 1.3;
  mirror.remove();
  const clampedLeft = Math.min(Math.max(left, r.left), r.right);
  const clampedTop = Math.min(Math.max(top, r.top), r.bottom - lineHeight);
  return { left: clampedLeft - TRIGGER.length * 4, top: clampedTop, bottom: clampedTop + lineHeight };
}
