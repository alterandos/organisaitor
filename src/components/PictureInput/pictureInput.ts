import { useState, type ClipboardEvent, type DragEvent } from 'react';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';
import { errorMessage, log } from '@/utils/log';

// Adding a picture to something, the same way everywhere (adopted 2026-11-05): choose a file, take
// it from the clipboard, paste it (Ctrl+V) or drop it. What becomes of the file (the picture
// library, services/pictures.ts) is the caller's; this is only how the person gives it.

// The first picture in a paste or a drop, if any.
export function imageFileFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return Array.from(data.files ?? []).find((f) => f.type.startsWith('image/')) ?? null;
}

// The clipboard's picture, read on request (a button): needs the browser's permission, so it
// throws when that's refused.
export async function clipboardImage(): Promise<File | null> {
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) return new File([await item.getType(type)], 'pasted', { type });
  }
  return null;
}

// "From clipboard": the picture there, or a message saying why there's none. `blocked` is the
// place's own wording for a refused read (where to press Ctrl+V instead).
export async function pictureFromClipboard(blocked: string = LABELS.pictureInput.blocked): Promise<File | null> {
  let file: File | null;
  try { file = await clipboardImage(); }
  catch (e) {
    log.warn('pictureInput', 'clipboard not readable', errorMessage(e));
    await alertDialog(blocked);
    return null;
  }
  if (!file) await alertDialog(LABELS.pictureInput.noPicture);
  return file;
}

const hasPicture = (e: DragEvent) => Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === 'file' && i.type.startsWith('image/'));

// Props for an element that takes a picture pasted into it (while it has focus) or dropped on it,
// and whether one is being dragged over it now (to show where it will go).
export function usePictureTarget(onFile: (file: File) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const props = enabled ? {
    onPaste: (e: ClipboardEvent) => {
      const f = imageFileFrom(e.clipboardData);
      if (f) { e.preventDefault(); e.stopPropagation(); onFile(f); }
    },
    onDragOver: (e: DragEvent) => { if (hasPicture(e)) { e.preventDefault(); setDragging(true); } },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); },
    onDrop: (e: DragEvent) => {
      setDragging(false);
      const f = imageFileFrom(e.dataTransfer);
      if (f) { e.preventDefault(); e.stopPropagation(); onFile(f); }
    },
  } : {};
  return { dragging: enabled && dragging, props };
}
