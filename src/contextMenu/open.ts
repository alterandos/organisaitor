// Opening the right-click menu from code, at a point, for an element: what a control that stands
// for "more for this" opens (a block part's ⋮⋮ handle; on a phone, where there's no right-click,
// the only way in). The menu is the same one a right-click there shows: ContextMenuHost, the one
// host, registers the opener; nothing else renders a menu.

type Opener = (target: Element, x: number, y: number) => boolean;
let opener: Opener | null = null;

export function registerContextMenuOpener(fn: Opener): () => void {
  opener = fn;
  return () => { if (opener === fn) opener = null; };
}

// Whether a menu opened (nothing does if nothing there contributes items).
export const openContextMenuAt = (target: Element, x: number, y: number): boolean => opener?.(target, x, y) ?? false;
