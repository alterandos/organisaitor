import { exactChar, findCharTrigger, findShortcut, findUserShortcut, matchChars, TRIGGER, type CharMatch } from './charSets';
import { useSettingsStore } from '@/store/settingsStore';
import { hideCharPicker, showCharPicker, type CaretBox } from './charPicker';

// `//name` in every ordinary text field (inputs and textareas, anywhere in the app): one set of
// listeners for the whole document, installed once from App.tsx, so no field has to opt in. The
// note editor isn't an ordinary field — ProseMirror owns its text — and has its own extension
// (NoteEditor/extensions/SpecialCharInput.ts) on the same rules.
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

type Field = HTMLInputElement | HTMLTextAreaElement;

const isField = (t: EventTarget | null): t is Field =>
  (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && TEXT_TYPES.has(t.type)))
  && !t.readOnly && !t.disabled;

interface Open { field: Field; start: number; end: number; matches: CharMatch[]; selected: number }
let open: Open | null = null;

const NO_SHORTCUTS = new Set(['url', 'email', 'search']);
// The last shortcut made, so Backspace or Ctrl+Z straight after can put the typed text back.
let lastShortcut: { field: Field; at: number; char: string; typed: string } | null = null;

function close() {
  open = null;
  hideCharPicker();
}

// Puts the text in place of field[start..end] the way typing would, so a React field's onChange
// sees it (setRangeText changes the value under React's tracker; the input event reports it).
function replace(field: Field, start: number, end: number, text: string) {
  field.setRangeText(text, start, end, 'end');
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function choose(i: number) {
  if (!open) return;
  const { field, start, end, matches } = open;
  const m = matches[i];
  close();
  if (m) replace(field, start, end, m.char);
}

function render() {
  if (!open) return;
  showCharPicker(caretBox(open.field), open.matches, open.selected, choose);
}

function onInput(e: Event) {
  const field = e.target;
  if (!isField(field)) return;
  const caret = field.selectionStart ?? 0;
  if (field.selectionEnd !== caret) { close(); return; }
  const before = field.value.slice(0, caret);
  lastShortcut = null;
  // A shortcut just completed by typing (not by pasting, or our own replace(), which is a plain Event).
  if (e instanceof InputEvent && e.inputType === 'insertText' && !(field instanceof HTMLInputElement && NO_SHORTCUTS.has(field.type))
      && !field.closest('[data-no-shortcuts]')) {
    const s = findShortcut(before) ?? findUserShortcut(before, useSettingsStore.getState().textShortcuts);
    if (s) {
      close();
      replace(field, s.start, caret, s.char);
      lastShortcut = { field, at: s.start + s.char.length, char: s.char, typed: s.typed };
      return;
    }
  }
  // The whole name and a space: the character, keeping the space.
  if (before.endsWith(' ')) {
    const t = findCharTrigger(before.slice(0, -1));
    const ch = t && exactChar(t.query);
    if (t && ch) { close(); replace(field, t.start, caret - 1, ch); return; }
  }
  const t = findCharTrigger(before);
  if (!t) { if (open?.field === field) close(); return; }
  const matches = matchChars(t.query);
  open = { field, start: t.start, end: caret, matches, selected: 0 };
  render();
}

// Capture on window, so these keys are seen before anything else (the Escape stack, a form's
// Enter, a pane's Ctrl+Enter) while the list is up.
function onKeyDown(e: KeyboardEvent) {
  const s = lastShortcut;
  const undoKey = e.key === 'Backspace' ? !e.ctrlKey && !e.metaKey
    : (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey;
  if (s && undoKey && e.target === s.field && !e.altKey
      && s.field.selectionStart === s.at && s.field.selectionEnd === s.at
      && s.field.value.slice(s.at - s.char.length, s.at) === s.char) {
    e.preventDefault();
    lastShortcut = null;
    replace(s.field, s.at - s.char.length, s.at, s.typed);
    return;
  }
  if (e.key !== 'Shift') lastShortcut = null;
  if (!open || e.target !== open.field) return;
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
  mark.textContent = '\u200b';
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
