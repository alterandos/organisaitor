import { describe, expect, it } from 'vitest';
import { blobShown, noteStandIn, openBlobs, OPEN_PX } from './mapDetail';
import type { AtlasBlob } from './atlasLayout';

const blob = (id: string, x: number, y: number, r: number, depth: number, parentId: string | null): AtlasBlob =>
  ({ id, kind: 'group', groupId: id, sourceId: id, label: id, color: null, icon: null, total: 1, x, y, r, depth, parentId });

// An island with two notebooks in it, another island far off.
const blobs = [
  blob('uni', 500, 500, 400, 1, null),
  blob('bio', 300, 500, 150, 2, 'uni'),
  blob('chem', 700, 500, 150, 2, 'uni'),
  blob('work', 1600, 500, 200, 1, null),
];
const view = (zoom: number, x = 0, y = 0) => ({ zoom, x, y, width: 1200, height: 900 });

describe('what the Map opens as you zoom (mapDetail)', () => {
  it('zoomed out: the islands open (big on screen), their notebooks stay closed', () => {
    const open = openBlobs(blobs, view(0.4));   // uni 160px (big), work 80px (only two islands in view)
    expect([...open].sort()).toEqual(['uni', 'work']);
    expect(blobShown(blobs[1], open)).toBe(true);
  });

  it('zoomed in: the notebooks open, once each is big on screen ("work" has gone out of view)', () => {
    expect([...openBlobs(blobs, view(1))].sort()).toEqual(['bio', 'chem', 'uni']);
  });

  it('with only a few in view, a blob opens sooner (smaller on screen)', () => {
    const z = 0.6;   // bio and chem are 90px on screen: under OPEN_PX, over OPEN_PX_FEW
    expect(150 * z).toBeLessThan(OPEN_PX);
    expect(openBlobs(blobs, view(z)).has('bio')).toBe(true);
  });

  it('a notebook inside a closed island stays closed, and is not drawn', () => {
    const open = openBlobs(blobs, view(0.1));
    expect(open.size).toBe(0);
    expect(blobShown(blobs[1], open)).toBe(false);
  });

  it('blobs out of view don’t count, and don’t open', () => {
    const open = openBlobs(blobs, view(1, -1500, 0));   // only "work" in view
    expect(open.has('work')).toBe(true);
    expect(open.has('uni')).toBe(false);
  });

  it('a note’s links attach to it when it’s drawn, else to the closed blob drawn in its place', () => {
    const byId = new Map(blobs.map((b) => [b.id, b]));
    const note = { noteId: 'n1', x: 300, y: 500, r: 10, blobId: 'bio' };
    expect(noteStandIn(note, byId, new Set(['uni', 'bio']))).toBe('note:n1');
    expect(noteStandIn(note, byId, new Set(['uni']))).toBe('blob:bio');
    expect(noteStandIn(note, byId, new Set())).toBe('blob:uni');
  });
});
