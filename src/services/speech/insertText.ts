const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color',
  'date', 'datetime-local', 'month', 'week', 'time', 'number', 'hidden',
]);

// The focused element if dictated text can go into it, else null. Number/date/time inputs are
// excluded (TimeInput's segments are number inputs), as are disabled and read-only fields.
export function findTextTarget(): HTMLElement | null {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return el.disabled || el.readOnly ? null : el;
  if (el instanceof HTMLInputElement) {
    return el.disabled || el.readOnly || NON_TEXT_INPUT_TYPES.has(el.type) ? null : el;
  }
  if (el instanceof HTMLElement && el.isContentEditable) return el;
  return null;
}

function needsLeadingSpace(target: HTMLElement): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const at = target.selectionStart ?? 0;
    return at > 0 && !/\s/.test(target.value[at - 1]);
  }
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  if (!sel || !node || node.nodeType !== Node.TEXT_NODE) return false;
  const offset = sel.anchorOffset;
  return offset > 0 && !/\s/.test(node.textContent?.[offset - 1] ?? ' ');
}

// execCommand('insertText') is deprecated but is the one call that behaves like real typing in
// all three target kinds: it fires the input events React's controlled inputs listen for, it
// lands in the browser's undo stack, and ProseMirror (the Notes editor) sees it as ordinary
// input. The setRangeText branch is only a fallback for an input that refuses it.
export function insertTextAt(target: HTMLElement, text: string): boolean {
  if (!target.isConnected) return false;
  if (document.activeElement !== target) target.focus();
  const value = needsLeadingSpace(target) ? ` ${text}` : text;
  if (document.execCommand('insertText', false, value)) return true;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(value, start, end, 'end');
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}
