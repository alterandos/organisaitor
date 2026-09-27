// Pure text-splicing logic behind the "light rich text" Markdown hotkeys in Task/Calendar notes
// fields (plain <textarea>s — no Tiptap instance, per the confirmed decision to keep these
// fields as plain text/Markdown rather than migrating to rich-doc JSON like Notes). Kept
// separate from the DOM/selection wiring (see hooks/useMarkdownHotkeys.ts) so the splicing
// itself is unit-testable without a real textarea element.

export interface TextEditResult { value: string; selectionStart: number; selectionEnd: number }

// Wraps the selected range in `marker` on both sides (toggling it off if the selection is
// already exactly wrapped, e.g. pressing Ctrl+B again on already-bolded text). With no
// selection, inserts an empty marker pair and places the cursor between them, ready to type.
export function toggleWrap(value: string, start: number, end: number, marker: string): TextEditResult {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  const m = marker.length;

  const alreadyWrapped = before.endsWith(marker) && after.startsWith(marker);
  if (alreadyWrapped) {
    const newValue = before.slice(0, before.length - m) + selected + after.slice(m);
    const newStart = start - m;
    return { value: newValue, selectionStart: newStart, selectionEnd: newStart + selected.length };
  }

  const newValue = `${before}${marker}${selected}${marker}${after}`;
  if (selected.length === 0) {
    const cursor = start + m;
    return { value: newValue, selectionStart: cursor, selectionEnd: cursor };
  }
  return { value: newValue, selectionStart: start + m, selectionEnd: start + m + selected.length };
}

// Replaces the selection with a Markdown link `[text](url)` — `linkText` defaults to the
// current selection (or the url itself, if there was no selection and no text was given, so
// the result is never a link with an empty label). Places the cursor just after the inserted
// link, ready to keep typing.
export function insertMarkdownLink(value: string, start: number, end: number, url: string, linkText?: string): TextEditResult {
  const selected = value.slice(start, end);
  const text = linkText || selected || url;
  const inserted = `[${text}](${url})`;
  const newValue = value.slice(0, start) + inserted + value.slice(end);
  const cursor = start + inserted.length;
  return { value: newValue, selectionStart: cursor, selectionEnd: cursor };
}
