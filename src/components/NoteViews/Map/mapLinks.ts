// The Map's rules for keeping it clear (asked for by the user 2026-10-18), pure:
//   - icons (notes, tasks, events, lists) keep their size on screen beyond 1×, so as you zoom in
//     they get smaller next to the blobs and space opens between them; blobs keep their real size;
//   - zoomed out, links are bundled: one curve per pair of blobs, thicker for more links, from
//     edge to edge, and links inside one blob aren't drawn; zoomed in, each link between notes
//     (a link to a note inside a closed blob attaches to that blob: mapDetail noteStandIn).

// The zoom from which every note shows its title.
export const DETAIL_ZOOM = 1.4;
// The zoom from which each link between notes is drawn; below it, links are bundled between blobs
// (a hovered note's own links are drawn anyway).
export const LINKS_ZOOM = 2;

// How much an icon is scaled at `zoom`: 1 up to 1×, then 1/zoom, so beyond 1× it keeps its size on
// screen while the blobs grow round it (it gets smaller next to them, opening space); never below 0.15.
export function dotScale(zoom: number): number {
  if (zoom <= 1) return 1;
  return Math.max(0.15, 1 / zoom);
}

// A link's width in the map's own units for `px` on screen (the map is scaled with CSS, which an
// SVG stroke's non-scaling setting doesn't see).
export const strokeAt = (px: number, zoom: number) => px / Math.max(zoom, 0.05);

export interface LinkIn { id: string; from: string; to: string; weight: number; kind: 'note' | 'item' }
export interface ShownLink { id: string; from: string; to: string; weight: number; count: number; bundle: boolean }

// The links as drawn: each end attached to what stands in for it on screen (`standIn`: a note, an
// item, or `blob:<id>` for the blob it's in; undefined when not drawn). Two links between the same
// stand-ins become one, carrying both (its weight the sum); a link whose ends stand in for the same
// thing (inside one closed blob) isn't drawn. A link with a blob at either end is a bundle.
export function standInLinks(links: LinkIn[], standIn: (key: string, link: LinkIn) => string | undefined): ShownLink[] {
  const out = new Map<string, ShownLink>();
  for (const l of links) {
    const a = standIn(l.from, l);
    const b = standIn(l.to, l);
    if (!a || !b || a === b) continue;
    const [from, to] = a < b ? [a, b] : [b, a];
    const bundle = from.startsWith('blob:') || to.startsWith('blob:');
    const id = bundle ? `bundle:${from}|${to}` : l.id;
    const have = out.get(id);
    if (have) { have.weight += l.weight; have.count += 1; } else out.set(id, { id, from, to, weight: l.weight, count: 1, bundle });
  }
  return [...out.values()];
}

// A gentle curve from one centre to another, its ends pulled in by `trimFrom` / `trimTo` (a blob's
// radius, so a bundled link runs edge to edge), bending the same way each time.
export function curvePath(sx: number, sy: number, tx: number, ty: number, trimFrom = 0, trimTo = 0, bend = 0.18): string {
  const len = Math.hypot(tx - sx, ty - sy) || 1;
  const ux = (tx - sx) / len;
  const uy = (ty - sy) / len;
  const x1 = sx + ux * Math.min(trimFrom, len / 2);
  const y1 = sy + uy * Math.min(trimFrom, len / 2);
  const x2 = tx - ux * Math.min(trimTo, len / 2);
  const y2 = ty - uy * Math.min(trimTo, len / 2);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  return `M${x1},${y1} Q${mx - dy * bend},${my + dx * bend} ${x2},${y2}`;
}
