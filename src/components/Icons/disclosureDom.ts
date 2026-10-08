import styles from './Icons.module.css';
import { CHEVRON_PATH } from './disclosurePath';

// The same icon for plain-DOM code (a ProseMirror widget), so it can't drift from the React one.
export function createDisclosureIcon(open: boolean): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(k, v);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', CHEVRON_PATH);
  svg.appendChild(path);
  svg.classList.add(styles.disclosure);
  if (open) svg.classList.add(styles.disclosureOpen);
  return svg;
}
