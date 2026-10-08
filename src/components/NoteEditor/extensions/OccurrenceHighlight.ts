import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

// Selecting a word or phrase faintly marks its other mentions in the tab, the way a code editor
// does, so you can see at a glance where else a term comes up. Case-insensitive; a selection of
// whole words only matches whole words. Purely visual: nothing is stored.

const MIN_LEN = 2;
const MAX_LEN = 100;
const MAX_MATCHES = 500;

const key = new PluginKey<DecorationSet>('occurrenceHighlight');
const WORD = /[\p{L}\p{N}_]/u;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The text the selection covers, if it is something worth looking for, and whether it is whole
// words (nothing of a word left either side of it).
export function selectionNeedle(state: EditorState): { text: string; wholeWord: boolean } | null {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || sel.empty) return null;
  if (!sel.$from.sameParent(sel.$to)) return null;
  const text = state.doc.textBetween(sel.from, sel.to, '\n', '\ufffc');
  const trimmed = text.trim();
  if (trimmed.length < MIN_LEN || trimmed.length > MAX_LEN || /[\n\ufffc]/.test(trimmed)) return null;
  const { parent, parentOffset: start } = sel.$from;
  const end = sel.$to.parentOffset;
  const block = parent.textBetween(0, parent.content.size, undefined, '\ufffc');
  const wholeWord = !WORD.test(block[start - 1] ?? ' ') && !WORD.test(block[end] ?? ' ');
  return { text: trimmed, wholeWord };
}

// Every [from, to) where needle occurs in the document's text, never across blocks.
export function findOccurrences(doc: PMNode, needle: string, wholeWord: boolean): [number, number][] {
  const re = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}_])${escape(needle)}(?![\\p{L}\\p{N}_])` : escape(needle), 'giu');
  const out: [number, number][] = [];
  doc.descendants((node, pos) => {
    if (out.length >= MAX_MATCHES) return false;
    if (!node.isTextblock) return true;
    // The block's text, with each character's document position.
    let text = '';
    const at: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) at.push(start + i);
        text += child.text;
      } else {
        at.push(start);
        text += '\ufffc';
      }
    });
    for (const m of text.matchAll(re)) {
      if (out.length >= MAX_MATCHES) break;
      const from = at[m.index!];
      out.push([from, at[m.index! + m[0].length - 1] + 1]);
    }
    return false;
  });
  return out;
}

function build(state: EditorState): DecorationSet {
  const needle = selectionNeedle(state);
  if (!needle) return DecorationSet.empty;
  const { from, to } = state.selection;
  const decos = findOccurrences(state.doc, needle.text, needle.wholeWord)
    .filter(([a, b]) => b <= from || a >= to)
    .map(([a, b]) => Decoration.inline(a, b, { class: 'note-occurrence' }));
  return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
}

export const OccurrenceHighlight = Extension.create({
  name: 'occurrenceHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => build(state),
          apply: (tr, old, _prev, state) => (tr.docChanged || tr.selectionSet ? build(state) : old),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});
