// Where in the note's outline the reader is: the headings the top of the scrolled view is inside.
// Read from the laid-out page, so collapsed-away headings (no box) never count. Shared by the
// sticky heading trail (StickyHeadings) and the Contents panel's highlight (NoteTOC), so the two
// always agree.

export interface HeadingCrumb { el: HTMLElement; number: string; text: string }

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5'].map((h) => `${h}[data-heading-number]`).join(', ');
const levelOf = (el: HTMLElement) => Number(el.tagName.slice(1));

// The heading's own text, without the editor's widgets in it (the fold arrow, the ⋯).
function headingText(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[contenteditable="false"]').forEach((w) => w.remove());
  return copy.textContent?.trim() ?? '';
}

// The element that scrolls the note: the nearest ancestor that scrolls vertically.
export function scrollHostOf(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === 'auto' || overflowY === 'scroll') return p;
  }
  return null;
}

// The last heading scrolled past the top of `host`, preceded by each heading above it of a higher
// level. Empty while the first heading is still below the top.
export function headingTrail(root: HTMLElement, host: HTMLElement): HeadingCrumb[] {
  const top = host.getBoundingClientRect().top + 4;
  const headings = [...root.querySelectorAll<HTMLElement>(HEADINGS)].filter((h) => h.offsetParent !== null);
  let current = -1;
  headings.forEach((h, i) => { if (h.getBoundingClientRect().top < top) current = i; });
  if (current < 0) return [];
  const chain = [headings[current]];
  let level = levelOf(headings[current]);
  for (let i = current - 1; i >= 0 && level > 1; i--) {
    if (levelOf(headings[i]) < level) { chain.unshift(headings[i]); level = levelOf(headings[i]); }
  }
  return chain.map((el) => ({ el, number: el.dataset.headingNumber ?? '', text: headingText(el) }));
}

// Calls `onChange` (at most once a frame) whenever where the reader is might have moved: the note
// scrolled or was edited, or the window resized. Returns the cleanup.
export function watchReadingPosition(host: HTMLElement, editor: { on: (e: 'update', f: () => void) => unknown; off: (e: 'update', f: () => void) => unknown }, onChange: () => void): () => void {
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; onChange(); }); };
  host.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  editor.on('update', schedule);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    host.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    editor.off('update', schedule);
  };
}
