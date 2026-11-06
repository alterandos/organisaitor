// @vitest-environment jsdom
//
// The background below a note: its right-click menu (Replace, Replace from clipboard) and the
// picker it opens (the person's pictures above the built-in ones; the clipboard's picture waiting
// in it for where it applies). Asked for by the user 2026-11-05.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const clip = vi.hoisted(() => ({ file: null as File | null }));
vi.mock('@/components/PictureInput/pictureInput', async (orig) => ({
  ...(await orig<typeof import('@/components/PictureInput/pictureInput')>()),
  pictureFromClipboard: async () => clip.file,
}));
const added = vi.hoisted(() => ({ files: [] as File[] }));
vi.mock('@/services/pictures', async (orig) => ({
  ...(await orig<typeof import('@/services/pictures')>()),
  addPicture: async (f: File) => { added.files.push(f); return 'pic1'; },
  setBackdrop: vi.fn(async () => {}),
}));

import { ContextMenuHost } from '@/components/ContextMenu/ContextMenuHost';
import { NoteBackdrop } from './NoteBackdrop';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { setBackdrop } from '@/services/pictures';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types';

const L = LABELS.noteBackdrop;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  clip.file = null;
  added.files = [];
  URL.createObjectURL = () => 'blob:clip';
  URL.revokeObjectURL = () => {};
});
afterEach(() => cleanup());

function setup() {
  const id = useNoteStore.getState().addNote({ title: 'Lecture' }) as NoteId;
  const note = useNoteStore.getState().notes[id];
  const { container } = render(<><ContextMenuHost /><NoteBackdrop note={note} /></>);
  return { id, area: container.querySelector('button[aria-label]')!.parentElement! };
}
const rightClick = (el: Element) => act(() => { fireEvent.contextMenu(el, { clientX: 40, clientY: 50 }); });

describe('the background below a note', () => {
  it('right-click offers Replace and Replace from clipboard; Replace opens the picker, your pictures first', async () => {
    const { area } = setup();
    rightClick(area);
    expect(screen.getByRole('menuitem', { name: /Replace from clipboard/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /^Replace…/ }));
    const picker = await screen.findByRole('dialog', { name: L.title });
    expect(picker).toBeInTheDocument();
  });

  it('Replace from clipboard puts the clipboard\'s picture in the picker; clicking it applies it where chosen', async () => {
    clip.file = new File(['x'], 'clip.png', { type: 'image/png' });
    const { area, id } = setup();
    rightClick(area);
    await userEvent.click(screen.getByRole('menuitem', { name: /Replace from clipboard/ }));
    const picker = await screen.findByRole('dialog', { name: L.title });
    // the person's pictures (here, the clipboard's) come before the built-in backgrounds
    const pictures = screen.getByText(L.pictures);
    const plain = screen.getByRole('button', { name: L.plain });
    expect(pictures.compareDocumentPosition(plain) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picker).toHaveTextContent(L.clipboardHint);
    await userEvent.click(screen.getByRole('button', { name: L.fromClipboard }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(added.files).toEqual([clip.file]);
    expect(setBackdrop).toHaveBeenCalledWith({ kind: 'note', id }, { kind: 'picture', pictureId: 'pic1' });
  });
});
