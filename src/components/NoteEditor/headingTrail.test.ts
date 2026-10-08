// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { headingTrail } from './headingTrail';

// jsdom has no layout: give each heading a top, and a box (offsetParent) unless it's folded away.
function page(spec: [tag: string, number: string, text: string, top: number, hidden?: boolean][]) {
  const host = document.createElement('div');
  host.getBoundingClientRect = () => new DOMRect(0, 100, 800, 600);
  const root = document.createElement('div');
  for (const [tag, number, text, top, hidden] of spec) {
    const h = document.createElement(tag);
    h.dataset.headingNumber = number;
    h.innerHTML = `<span contenteditable="false">›</span>${text}<span contenteditable="false">⋯</span>`;
    h.getBoundingClientRect = () => new DOMRect(0, top, 800, 30);
    Object.defineProperty(h, 'offsetParent', { get: () => (hidden ? null : root) });
    root.appendChild(h);
  }
  host.appendChild(root);
  document.body.appendChild(host);
  return { root, host };
}
afterEach(() => { document.body.innerHTML = ''; });

const names = (trail: ReturnType<typeof headingTrail>) => trail.map((c) => `${c.number} ${c.text}`);

describe('headingTrail', () => {
  it('is empty while the first heading is still below the top', () => {
    const { root, host } = page([['h1', '1', 'Intro', 150]]);
    expect(headingTrail(root, host)).toEqual([]);
  });

  it('names the last heading scrolled past and the headings above it', () => {
    const { root, host } = page([
      ['h1', '1', 'Intro', -400],
      ['h2', '1.1', 'Method', -200],
      ['h3', '1.1.1', 'Sampling', 50],
      ['h3', '1.1.2', 'Coding', 400],
    ]);
    expect(names(headingTrail(root, host))).toEqual(['1 Intro', '1.1 Method', '1.1.1 Sampling']);
  });

  it('skips a sibling at the same level and leaves out folded-away headings', () => {
    const { root, host } = page([
      ['h1', '1', 'One', -900],
      ['h2', '1.1', 'Gone', -700, true],
      ['h2', '1.2', 'Two', -500],
      ['h3', '1.2.1', 'Deep', -300],
      ['h2', '1.3', 'Three', 0],
    ]);
    expect(names(headingTrail(root, host))).toEqual(['1 One', '1.3 Three']);
  });
});
