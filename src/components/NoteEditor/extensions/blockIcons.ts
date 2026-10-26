import { LABELS } from '@/config/labels';
import { COMMON_EMOJI } from '@/config/emojiSet';
import { squareIconDataUrl } from '@/utils/imageCompress';
import { openBlockPopover, popoverClass as pop } from './blockDesigns';

// THE icon slot for a part of a note block (a cycle's stage, a type in the types block): an emoji
// (a picked grid, or any one typed) or a picture, dropped on the slot or chosen ("Choose a
// picture…" is the touch path), cropped to a small square (utils/imageCompress squareIconDataUrl).
// Moved here from Cycle.ts on 2026-10-15, when the types block became its second user. The part
// keeps the choice in its own `icon` and `image` attrs; the block says where the part is and how
// to set them, and may add rows of its own to the picker (the cycle's shape and size).

export interface BlockIcon { icon: string | null; image: string | null }

export interface IconSlotOptions extends BlockIcon {
  // The data attribute that marks the slot ('data-cycle-icon'); its value is 'set' or 'empty'.
  attr: string;
  // Where the part the icon belongs to is now (null when it can't be edited).
  partPos: () => number | null;
  set: (partPos: number, icon: BlockIcon) => void;
  // More rows for the picker, under the icon choices.
  extra?: (partPos: number, done: () => void) => HTMLElement[];
}

// The emoji offered: the shared set's common ones (config/emojiSet.ts); any other can be typed.
const ICON_CHOICES = COMMON_EMOJI;

async function setImage(o: IconSlotOptions, pos: number, file: File | undefined | null): Promise<void> {
  if (!file || !file.type.startsWith('image/')) return;
  o.set(pos, { image: await squareIconDataUrl(file), icon: null });
}

// A row of choices for a picker (the cycle's shape and size), the current one pressed.
export function choiceRow<T extends string>(values: readonly T[], labels: Record<T, string>, current: T, set: (v: T) => void, done: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = pop.row;
  for (const v of values) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = pop.choice;
    b.textContent = labels[v];
    b.setAttribute('aria-pressed', String(v === current));
    b.addEventListener('click', () => { set(v); done(); });
    row.append(b);
  }
  return row;
}

export function popoverHeading(text: string): HTMLElement {
  const h = document.createElement('div');
  h.className = pop.heading;
  h.textContent = text;
  return h;
}

function openIconPicker(o: IconSlotOptions, pos: number, anchor: DOMRect, refocus: () => void): void {
  const L = LABELS.noteBlocks.blockIcon;
  openBlockPopover(anchor, (close) => {
    const done = () => { close(); refocus(); };
    const box = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = pop.emojiGrid;
    for (const emoji of ICON_CHOICES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = pop.emoji;
      b.textContent = emoji;
      b.addEventListener('click', () => { o.set(pos, { icon: emoji, image: null }); done(); });
      grid.append(b);
    }
    const input = document.createElement('input');
    input.className = pop.input;
    input.placeholder = L.paste;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = [...new Intl.Segmenter().segment(input.value.trim())][0]?.segment;
      if (first) o.set(pos, { icon: first, image: null });
      done();
    });
    const actions = document.createElement('div');
    actions.className = pop.row;
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    file.addEventListener('change', () => { void setImage(o, pos, file.files?.[0]).then(done); });
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = pop.link;
    choose.textContent = `${L.choose} ${L.drop}`;
    choose.addEventListener('click', () => file.click());
    actions.append(choose, file);
    if (o.icon || o.image) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = `${pop.link} ${pop.danger}`;
      remove.textContent = L.remove;
      remove.addEventListener('click', () => { o.set(pos, { icon: null, image: null }); done(); });
      actions.append(remove);
    }
    box.append(popoverHeading(L.title), grid, input, actions, ...(o.extra?.(pos, done) ?? []));
    return box;
  });
}

export function iconSlot(o: IconSlotOptions, refocus: () => void): HTMLElement {
  const slot = document.createElement('div');
  slot.contentEditable = 'false';
  slot.setAttribute(o.attr, o.icon || o.image ? 'set' : 'empty');
  slot.title = LABELS.noteBlocks.blockIcon.add;
  if (o.image) {
    const img = document.createElement('img');
    img.src = o.image;
    img.alt = '';
    img.draggable = false;
    slot.append(img);
  } else {
    slot.textContent = o.icon || '+';
  }
  slot.addEventListener('mousedown', (e) => e.preventDefault());
  slot.addEventListener('click', (e) => {
    e.preventDefault();
    const pos = o.partPos();
    if (pos !== null) openIconPicker(o, pos, slot.getBoundingClientRect(), refocus);
  });
  slot.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); slot.setAttribute('data-drop', ''); } });
  slot.addEventListener('dragleave', () => slot.removeAttribute('data-drop'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.removeAttribute('data-drop');
    const pos = o.partPos();
    if (pos !== null) void setImage(o, pos, e.dataTransfer?.files?.[0]);
  });
  return slot;
}
