import type { Editor } from '@tiptap/core';

// Font size (the style ribbon's size box, and Ctrl+Shift+< / Ctrl+Shift+>): a step up or down a
// fixed ladder, like word processors' grow/shrink font. Stored as the textStyle mark's fontSize
// (Tiptap's FontSize), in px; with nothing selected it applies to what's typed next.

export const FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

// What a block's text is without a size of its own (the editor CSS, at 16px to the rem).
const BLOCK_SIZE: Record<string, number> = {
  noteTitle: 34, noteSubtitle: 21, noteAuthor: 13, h1: 27, h2: 22, h3: 18, h4: 16, h5: 14,
};

export function currentFontSize(editor: Editor): number {
  const own = editor.getAttributes('textStyle').fontSize as string | undefined;
  if (own) return parseFloat(own);
  const block = editor.state.selection.$from.parent;
  const key = block.type.name === 'heading' ? `h${block.attrs.level}` : block.type.name;
  return BLOCK_SIZE[key] ?? 16;
}

export function setFontSize(editor: Editor, px: number | null): void {
  if (px === null) editor.chain().focus().unsetFontSize().run();
  else editor.chain().focus().setFontSize(`${px}px`).run();
}

// One step up (+1) or down (-1) the ladder from the current size; nothing past either end.
export function stepFontSize(editor: Editor, dir: 1 | -1): void {
  const current = currentFontSize(editor);
  const next = dir > 0 ? FONT_SIZES.find((s) => s > current + 0.5) : [...FONT_SIZES].reverse().find((s) => s < current - 0.5);
  if (next !== undefined) setFontSize(editor, next);
}
