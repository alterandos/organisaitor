import type { AtlasBlob, AtlasNote } from './atlasLayout';

// How much of the Map is open (asked for by the user 2026-10-18), pure. A blob is either open,
// showing what's inside it (its notebooks, its notes), or closed, shown whole with its name and how
// many notes it holds. What's open follows the zoom and how many blobs you can see: a blob opens
// once it's big on screen, or a little sooner when only a few are in view. Islands' insides are
// shown as soon as they're open; a closed blob's notes aren't drawn at all, which keeps a big map
// readable.

export interface View { x: number; y: number; zoom: number; width: number; height: number }

// A blob opens at this radius on screen, or at the smaller one when this few of its level are in view.
export const OPEN_PX = 130;
export const OPEN_PX_FEW = 70;
export const FEW = 4;

const onScreen = (b: AtlasBlob, v: View) => {
  const cx = b.x * v.zoom + v.x;
  const cy = b.y * v.zoom + v.y;
  const r = b.r * v.zoom;
  return cx + r > 0 && cx - r < v.width && cy + r > 0 && cy - r < v.height;
};

// The open blobs, level by level: a blob can open only when the one it sits in is open.
export function openBlobs(blobs: AtlasBlob[], v: View): Set<string> {
  const open = new Set<string>();
  if (!v.width || !v.height) return open;
  const depths = [...new Set(blobs.map((b) => b.depth))].sort((a, b) => a - b);
  for (const d of depths) {
    const inView = blobs.filter((b) => b.depth === d && (!b.parentId || open.has(b.parentId)) && onScreen(b, v));
    for (const b of inView) {
      const r = b.r * v.zoom;
      if (r >= OPEN_PX || (inView.length <= FEW && r >= OPEN_PX_FEW)) open.add(b.id);
    }
  }
  return open;
}

// Whether a blob is drawn at all: an island, or inside an open blob.
export const blobShown = (b: AtlasBlob, open: Set<string>) => !b.parentId || open.has(b.parentId);

// What a note's links attach to: the note itself when it's drawn (its blob is open), else the closed
// blob that's drawn in its place (the outermost closed one on its way out).
export function noteStandIn(note: AtlasNote, blobs: Map<string, AtlasBlob>, open: Set<string>): string {
  if (open.has(note.blobId)) return `note:${note.noteId}`;
  let at = blobs.get(note.blobId);
  while (at?.parentId && !open.has(at.parentId)) at = blobs.get(at.parentId);
  return `blob:${at?.id ?? note.blobId}`;
}
