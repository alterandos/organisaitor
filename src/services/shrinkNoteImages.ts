import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { noteView, isNoteLocked } from '@/services/noteSecrets';
import { recompressDataUrl } from '@/utils/imageCompress';
import type { NoteId } from '@/types/notes';

interface DocNode { type?: string; attrs?: Record<string, unknown>; content?: DocNode[] }

export interface ShrinkResult {
  notes:      number;   // notes rewritten
  images:     number;   // images made smaller
  savedChars: number;   // characters removed from the stored content
}

// Images below this are left alone (about 110 KB of image data).
const MIN_DATA_URL_CHARS = 150_000;

// Recompresses one stored content JSON string's inline images; returns null when nothing shrank.
async function shrinkContent(json: string): Promise<{ content: string; images: number; saved: number } | null> {
  if (!json || !json.includes('data:image/')) return null;
  let doc: DocNode;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  const targets: DocNode[] = [];
  const walk = (n: DocNode) => {
    const src = n.attrs?.src;
    if (n.type === 'image' && typeof src === 'string' && src.startsWith('data:image/') && src.length > MIN_DATA_URL_CHARS) targets.push(n);
    n.content?.forEach(walk);
  };
  walk(doc);
  let images = 0;
  let saved = 0;
  for (const node of targets) {
    const before = node.attrs!.src as string;
    const after = await recompressDataUrl(before);
    if (after.length < before.length) {
      node.attrs!.src = after;
      images++;
      saved += before.length - after.length;
    }
  }
  return images > 0 ? { content: JSON.stringify(doc), images, saved } : null;
}

// One-off recovery for a full localStorage (see utils/persistStorage.ts): recompresses every large
// image pasted into a note, in place, across all notes and tabs. Locked encrypted notes can't be
// read and are skipped. The open note is closed first — the editor would otherwise autosave its
// own, still-large copy over the result.
export async function shrinkNoteImages(): Promise<ShrinkResult> {
  useUIStore.getState().closeNote();
  const result: ShrinkResult = { notes: 0, images: 0, savedChars: 0 };
  for (const raw of Object.values(useNoteStore.getState().notes)) {
    if (isNoteLocked(raw)) continue;
    const note = noteView(raw);
    let touched = false;

    const main = await shrinkContent(note.content);
    if (main) {
      useNoteStore.getState().updateNote(note.id as NoteId, { content: main.content });
      result.images += main.images;
      result.savedChars += main.saved;
      touched = true;
    }
    for (const tab of note.tabs) {
      const res = await shrinkContent(tab.content);
      if (!res) continue;
      useNoteStore.getState().updateNoteTabContent(note.id as NoteId, tab.id, res.content);
      result.images += res.images;
      result.savedChars += res.saved;
      touched = true;
    }
    if (touched) result.notes++;
  }
  return result;
}
