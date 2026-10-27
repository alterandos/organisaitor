// @vitest-environment jsdom
// A note's picture lives in the picture library (CLAUDE.md "Picture library"): the image node
// holds its id, copying carries the picture, pasting it back refers to the same one, and a picture
// still inline is moved into the library while the note is open.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

vi.mock('@/utils/imageCompress', () => ({
  compressImageBlob: async (b: Blob) => `data:image/webp;base64,${await b.text()}`,
  recompressDataUrl: async (s: string) => s,
}));
vi.mock('@/services/vault', () => ({
  encryptField: async (s: string) => `enc:${s}`,
  decryptField: async (s: string) => s.slice(4),
  isVaultUnlocked: () => true,
  onVaultStatus: () => () => {},
}));

const { ResizableImage } = await import('./ResizableImage');
const { usePictureStore } = await import('@/store/pictureStore');
const pics = await import('@/services/pictures');

const tick = () => new Promise((r) => setTimeout(r, 0));
let editor: Editor;
let encrypted: boolean | null = false;

function make(content: string) {
  const el = document.createElement('div');
  document.body.append(el);
  editor = new Editor({
    element: el,
    extensions: [StarterKit, ResizableImage.configure({ allowBase64: true, inline: false, noteEncrypted: () => encrypted })],
    content,
  });
}
const image = () => {
  let attrs: Record<string, unknown> | null = null;
  editor.state.doc.descendants((n) => { if (n.type.name === 'image') attrs = n.attrs; });
  return attrs as Record<string, unknown> | null;
};

beforeEach(() => {
  encrypted = false;
  usePictureStore.setState(usePictureStore.getInitialState(), true);
  pics.resetPicturesCache();
});
afterEach(() => { editor?.destroy(); document.body.replaceChildren(); });

describe('pictures in a note', () => {
  it('a picture still inline moves into the library once the note is open; its text keeps only the id', async () => {
    make('<p>a</p><img src="data:image/png;base64,AAA">');
    for (let i = 0; i < 3; i++) await tick();
    const a = image()!;
    expect(a.src).toBeNull();
    expect(pics.pictureSrc(a.pictureId as string)).toBe('data:image/png;base64,AAA');
    expect(JSON.stringify(editor.getJSON())).not.toContain('base64');
    expect(usePictureStore.getState().pictures[a.pictureId as never]).toMatchObject({ origin: 'note', isEncrypted: false });
  });

  it('in an encrypted note it goes in encrypted; while that is unknown (locked) nothing moves', async () => {
    encrypted = true;
    make('<img src="data:image/png;base64,SECRET">');
    for (let i = 0; i < 3; i++) await tick();
    expect(usePictureStore.getState().pictures[image()!.pictureId as never]).toMatchObject({ isEncrypted: true, src: '' });
    editor.destroy();
    encrypted = null;
    make('<img src="data:image/png;base64,LATER">');
    for (let i = 0; i < 3; i++) await tick();
    expect(image()!.pictureId).toBeNull();
  });

  it('copying writes the picture into the HTML; pasting it back refers to the same picture', async () => {
    const id = await pics.addPicture(new Blob(['CAT']), { encrypted: false, origin: 'note' });
    make('<p></p>');
    editor.commands.setContent({ type: 'doc', content: [{ type: 'image', attrs: { pictureId: id, src: null } }] });
    const html = editor.getHTML();
    expect(html).toContain(`data-picture-id="${id}"`);
    expect(html).toContain('src="data:image/webp;base64,CAT"');
    editor.commands.setContent(html);
    expect(image()).toMatchObject({ pictureId: id, src: null });
  });

  it("a picture this library doesn't hold (pasted from elsewhere) keeps its own src; a web address stays as it is", () => {
    make('<img data-picture-id="unknown" src="https://example.com/a.png">');
    expect(image()).toMatchObject({ pictureId: null, src: 'https://example.com/a.png' });
  });

  it('the shown picture follows the library (an encrypted one arrives after decrypting)', async () => {
    const id = await pics.addPicture(new Blob(['DOG']), { encrypted: false, origin: 'note' });
    make('<p></p>');
    editor.commands.setContent({ type: 'doc', content: [{ type: 'image', attrs: { pictureId: id, src: null } }] });
    expect(editor.view.dom.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,DOG');
  });
});

describe('snapping to another picture’s width while resizing', () => {
  it('a width within 8px of another snaps to it, the nearest winning; further away it stays', async () => {
    const { snapWidth } = await import('./imageGeometry');
    expect(snapWidth(305, [300, 480])).toBe(300);
    expect(snapWidth(476, [300, 480, 470])).toBe(480);
    expect(snapWidth(320, [300, 480])).toBeNull();
  });

  it('width and height snap separately: a side snaps what it moves, a corner the nearer match, keeping the shape', async () => {
    const { snapSize } = await import('./imageGeometry');
    const targets = { widths: [300, 640], heights: [200] };
    expect(snapSize('e', { width: 304, height: 150 }, targets)).toEqual({ width: 300, height: 150, snapped: 'width' });
    expect(snapSize('s', { width: 400, height: 197 }, targets)).toEqual({ width: 400, height: 200, snapped: 'height' });
    expect(snapSize('e', { width: 400, height: 197 }, targets).snapped).toBeNull();   // a side never snaps the other way
    // A corner at 402 × 201: the height is 1px from 200, the width nowhere near: height wins, width follows.
    const corner = snapSize('se', { width: 402, height: 201 }, targets);
    expect(corner.snapped).toBe('height');
    expect(corner.height).toBe(200);
    expect(corner.width).toBeCloseTo(400);
    const byWidth = snapSize('se', { width: 306, height: 260 }, targets);
    expect([byWidth.width, byWidth.snapped]).toEqual([300, 'width']);
    expect(byWidth.height).toBeCloseTo(260 * 300 / 306);
  });
});
