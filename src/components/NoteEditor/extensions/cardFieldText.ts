// Putting typed text into a Glossary card's field (a small contenteditable, GlossaryCardBody's
// RichField) when the field puts it in itself rather than leaving it to the browser: a character
// typed after a term link (CardTermLinks.tsx), a bracket or quote pair (cardFieldPairs.ts).

// The collapsed caret, if it's in `field`.
export function caretIn(field: HTMLElement): { sel: Selection; node: Node; offset: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || !field.contains(sel.anchorNode)) return null;
  return { sel, node: sel.anchorNode, offset: sel.anchorOffset };
}

// The term link the caret is at the very end of (or just after), if any. A browser puts the caret
// at the end of the link's own text even when it was placed after the link, and carries on the
// inline element the caret ends, so text typed there would join the link.
export function termLinkEndingAtCaret(field: HTMLElement): Element | null {
  const at = caretIn(field);
  if (!at) return null;
  const { node, offset } = at;
  const link = (node instanceof Element ? node : node.parentElement)?.closest('a[data-term]') ?? null;
  if (link && field.contains(link)) {
    const rest = document.createRange();
    rest.setStart(node, offset);
    rest.setEndAfter(link);
    return rest.toString() === '' ? link : null;   // inside the link's text: editing the term itself
  }
  if (!(node instanceof Text) && offset > 0) {
    const prev = node.childNodes[offset - 1];
    if (prev instanceof Element && prev.matches('a[data-term]')) return prev;
  }
  return null;
}

// Puts `text` in at the caret (after a term link the caret ends, never into it), puts the caret
// `caretAt` characters into it, and tells the field it changed. Returns where the text went.
export function insertAtCaret(field: HTMLElement, text: string, caretAt = text.length): { node: Text; start: number } | null {
  const at = caretIn(field);
  if (!at) return null;
  const link = termLinkEndingAtCaret(field);
  let node: Text;
  let start: number;
  if (link) {
    const next = link.nextSibling;
    if (next instanceof Text) { next.insertData(0, text); node = next; }
    else { node = document.createTextNode(text); link.after(node); }
    start = 0;
  } else if (at.node instanceof Text) {
    at.node.insertData(at.offset, text);
    node = at.node;
    start = at.offset;
  } else {
    node = document.createTextNode(text);
    at.node.insertBefore(node, at.node.childNodes[at.offset] ?? null);
    start = 0;
  }
  setCaret(at.sel, node, start + caretAt);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return { node, start };
}

// A new line at the caret when it ends a term link: the browser's own (execCommand
// insertLineBreak) would put the <br> inside the link, and the next line would join it (found
// 2026-11-03). True when it put the line in itself.
export function lineBreakAfterTermLink(field: HTMLElement): boolean {
  const at = caretIn(field);
  const link = at && termLinkEndingAtCaret(field);
  if (!at || !link) return false;
  const br = document.createElement('br');
  link.after(br);
  // A <br> last in a field shows no line after it until something holds that line open.
  if (!br.nextSibling) br.after(document.createElement('br'));
  const range = document.createRange();
  range.setStartAfter(br);
  range.collapse(true);
  at.sel.removeAllRanges();
  at.sel.addRange(range);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function setCaret(sel: Selection, node: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// The character just before and just after the caret, within the field ('' at its edges).
export function charsAroundCaret(field: HTMLElement): { before: string; after: string } | null {
  const at = caretIn(field);
  if (!at) return null;
  const before = document.createRange();
  before.setStart(field, 0);
  before.setEnd(at.node, at.offset);
  const after = document.createRange();
  after.setStart(at.node, at.offset);
  after.setEnd(field, field.childNodes.length);
  return { before: before.toString().slice(-1), after: after.toString().slice(0, 1) };
}
