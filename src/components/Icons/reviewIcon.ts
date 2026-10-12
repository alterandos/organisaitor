// The Review icon (flashcards: a card with a tick in front of another), drawn once here for both
// the React icon (PlaceIcons.tsx ReviewIcon) and plain-DOM code (createReviewIcon: a ProseMirror
// widget), so the two can't drift. Not a circular arrow: that's "repeats" (config/itemIcons.ts).
export const REVIEW_ICON_PATHS = [
  'M7 8V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2',
  'M5 8h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
  'm7 14.5 2.5 2.5L13 12.5',
];

export function createReviewIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(k, v);
  for (const d of REVIEW_ICON_PATHS) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}
