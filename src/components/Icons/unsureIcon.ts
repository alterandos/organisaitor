// The Unsure flag's icon (extensions/UnsureFlag.ts, 2026-10-17): a question mark in a broken ring.
// The ring is dashed, not whole, because the point isn't settled; that also keeps it apart from
// the question block's ❓. Drawn once here for both the React icon (FlagIcons.tsx UnsureIcon) and
// plain-DOM code (createUnsureIcon: the marker after a flagged passage), so the two can't drift.
export const UNSURE_RING = { cx: 12, cy: 12, r: 9.5, dash: '3.4 2.6' };
export const UNSURE_ICON_PATHS = ['M9.4 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 4', 'M12 17.3h.01'];

export function createUnsureIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(k, v);
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', String(UNSURE_RING.cx));
  ring.setAttribute('cy', String(UNSURE_RING.cy));
  ring.setAttribute('r', String(UNSURE_RING.r));
  ring.setAttribute('stroke-dasharray', UNSURE_RING.dash);
  svg.appendChild(ring);
  for (const d of UNSURE_ICON_PATHS) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}
