import { GLYPHS, type GlyphName } from './glyphPaths';

// A control icon for plain-DOM code (a ProseMirror widget, the chart table), drawn from the same
// data as the React icon, 1em square so it takes the size of the text around it.
export function createGlyph(name: GlyphName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(k, v);
  for (const [tag, attrs] of GLYPHS[name]) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  }
  return svg;
}
