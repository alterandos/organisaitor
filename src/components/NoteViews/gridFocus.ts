import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

// Arrow keys between the tiles of a Notes view ([data-view-tile]: the Mosaic's tiles, the Map's
// notes), by where they are on screen: left and right go to the previous and next tile, up and
// down to the nearest one above or below. Home and End go to the first and last. With none
// focused yet, an arrow goes to the first.
export function moveFocusInGrid(e: ReactKeyboardEvent, grid: HTMLElement | null): void {
  if (!grid || e.ctrlKey || e.altKey || e.metaKey) return;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const tiles = [...grid.querySelectorAll<HTMLElement>('[data-view-tile]')];
  if (tiles.length === 0) return;
  const at = tiles.indexOf(document.activeElement as HTMLElement);
  if (at < 0) { e.preventDefault(); tiles[0].focus(); return; }
  let next = at;
  if (e.key === 'ArrowLeft') next = Math.max(0, at - 1);
  else if (e.key === 'ArrowRight') next = Math.min(tiles.length - 1, at + 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = tiles.length - 1;
  else {
    const here = tiles[at].getBoundingClientRect();
    const down = e.key === 'ArrowDown';
    let best = -1;
    let bestScore = Infinity;
    tiles.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      const ahead = down ? r.top >= here.bottom - 1 : r.bottom <= here.top + 1;
      if (!ahead) return;
      const score = Math.abs(r.top - here.top) * 4 + Math.abs(r.left + r.width / 2 - (here.left + here.width / 2));
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) next = best;
  }
  e.preventDefault();
  tiles[next]?.focus();
}
