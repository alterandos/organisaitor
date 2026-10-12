// Whether someone is typing: the key event's real target (or the focused element) is an input, a
// textarea, a select, or editable text. THE check every keyboard handler uses before acting on a
// plain key (CLAUDE.md "Hotkeys rule"), so a hotkey never fires while a person types.
//
// It looks inside open shadow roots: a field inside a custom element (MathLive's maths field) is
// reported to document listeners as the custom element itself, which isn't a field, so a check of
// `e.target` alone would let typed letters fire hotkeys.

function deepest(el: Element | null): Element | null {
  let current = el;
  while (current?.shadowRoot?.activeElement) current = current.shadowRoot.activeElement;
  return current;
}

function isField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // jsdom has no isContentEditable; browsers always do.
  return el.isContentEditable ?? !!el.closest('[contenteditable="true"]');
}

// For a key event, pass the event; for "is anything being typed into right now", pass
// document.activeElement.
export function isTypingTarget(source: Event | Element | null): boolean {
  if (source instanceof Event) {
    const path = source.composedPath();
    return isField(deepest((path[0] as Element | undefined) ?? (source.target as Element | null)));
  }
  return isField(deepest(source));
}
