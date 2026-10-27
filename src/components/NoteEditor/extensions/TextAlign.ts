import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

// Text alignment, as in Word (asked for by the user 2026-10-26): left, centre, right and justified
// ("full width"), per paragraph or heading, from the ribbon's four buttons or Ctrl+Shift+] / [ to
// step through them. Not Word's Ctrl+L/E/R/J: Ctrl+L is a link here, Ctrl+E the Endeavour filter,
// Ctrl+R and Ctrl+J the browser's. And not Ctrl+] / [ alone, which already step a block's design
// and a number's notation: a third meaning would depend on where the cursor is in a way you can't
// see. Stored as the node's `textAlign` (null = left), drawn as its text-align style.

export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlignValue = typeof TEXT_ALIGNS[number];
const ALIGNABLE = ['paragraph', 'heading'];

const readAlign = (v: string | null | undefined): TextAlignValue | null =>
  (TEXT_ALIGNS as readonly string[]).includes(v ?? '') && v !== 'left' ? (v as TextAlignValue) : null;

// The alignment where the selection starts (left when none is set).
export function textAlignAt(state: EditorState): TextAlignValue {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (ALIGNABLE.includes(node.type.name)) return readAlign(node.attrs.textAlign as string | null) ?? 'left';
  }
  return 'left';
}

// Aligns every paragraph and heading the selection touches. One undo step.
export function setTextAlign(view: EditorView, align: TextAlignValue): boolean {
  const { state } = view;
  const tr = state.tr;
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!ALIGNABLE.includes(node.type.name)) return true;
    const value = align === 'left' ? null : align;
    if (node.attrs.textAlign !== value) tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: value });
    return false;
  });
  if (!tr.docChanged) return false;
  view.dispatch(tr);
  return true;
}

export function cycleTextAlign(view: EditorView, dir: 1 | -1): boolean {
  const i = TEXT_ALIGNS.indexOf(textAlignAt(view.state));
  setTextAlign(view, TEXT_ALIGNS[(i + dir + TEXT_ALIGNS.length) % TEXT_ALIGNS.length]);
  return true;
}

export const TextAlign = Extension.create({
  name: 'textAlign',

  addGlobalAttributes() {
    return [{
      types: ALIGNABLE,
      attributes: {
        textAlign: {
          default: null,
          parseHTML: (el: HTMLElement) => readAlign(el.style.textAlign),
          renderHTML: (a: Record<string, unknown>) => (a.textAlign ? { style: `text-align: ${a.textAlign as string}` } : {}),
        },
      },
    }];
  },

  addKeyboardShortcuts() {
    const next = () => cycleTextAlign(this.editor.view, 1);
    const prev = () => cycleTextAlign(this.editor.view, -1);
    // Shift turns ] into } on most layouts; both names, so either reading of the key matches.
    return { 'Mod-Shift-]': next, 'Mod-}': next, 'Mod-Shift-[': prev, 'Mod-{': prev };
  },
});
