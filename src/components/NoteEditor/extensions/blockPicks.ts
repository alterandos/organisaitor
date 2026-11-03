import { Extension } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { TrashIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import { NOTE_BLOCK_NODES, selectBlock } from './blockDesigns';
import { noteClipboardText } from '../noteClipboardText';

// Picking parts of a note block (CLAUDE.md "Block designs"):
//   Ctrl+click a part (a timeline entry, a cycle stage, a quote's field…) adds it to or takes it
//   out of the picked set; Delete/Backspace removes the picked parts, Ctrl+C / Ctrl+X copy or cut
//   them as text, Esc or a plain click clears them. The picks are positions in plugin state,
//   mapped through every change; any edit to the document clears them.
//   Ctrl+Alt+click anywhere in a block selects the whole block.
// A part is a node of the block's type below, at any depth in it (a pros-and-cons point sits in one
// of its lists); a block without one (the chart) has nothing to pick. Deleting can't leave a block with fewer parts than its schema allows (a cycle
// keeps two stages): picking every part deletes the whole block, anything in between is refused.

export { BLOCK_PART_NODES } from '../blockNodes';
import { BLOCK_PART_NODES } from '../blockNodes';

interface Picks { block: number | null; parts: number[] }
const EMPTY: Picks = { block: null, parts: [] };
export const blockPicksKey = new PluginKey<Picks>('noteBlockPicks');

export const picksOf = (state: EditorState): Picks => blockPicksKey.getState(state) ?? EMPTY;

// The part (and its block) around a document position, or null. A part may sit at any depth in its
// block (a pros-and-cons point is inside one of its two lists, a cause-and-effect item inside its
// column); the innermost block around the position is the one that counts.
export function partAt(doc: PMNode, pos: number): { block: number; part: number } | null {
  const $p = doc.resolve(pos);
  for (let d = $p.depth; d >= 1; d--) {
    if (!NOTE_BLOCK_NODES.has($p.node(d).type.name)) continue;
    const partType = BLOCK_PART_NODES[$p.node(d).type.name];
    if (!partType) return null;
    for (let e = d + 1; e <= $p.depth; e++) {
      if ($p.node(e).type.name === partType) return { block: $p.before(d), part: $p.before(e) };
    }
    // Right on a part's start (a click on its edge): the node after the position.
    return $p.nodeAfter?.type.name === partType ? { block: $p.before(d), part: pos } : null;
  }
  return null;
}

// Every part of the block at `block`, by position.
function partsOf(doc: PMNode, block: number): number[] {
  const node = doc.nodeAt(block);
  const partType = node ? BLOCK_PART_NODES[node.type.name] : undefined;
  const out: number[] = [];
  if (!node || !partType) return out;
  node.descendants((n, p) => {
    if (n.type.name !== partType) return true;
    out.push(block + 1 + p);
    return false;
  });
  return out;
}

export function togglePick(view: EditorView, at: { block: number; part: number }): void {
  const cur = picksOf(view.state);
  const parts = cur.block === at.block
    ? (cur.parts.includes(at.part) ? cur.parts.filter((p) => p !== at.part) : [...cur.parts, at.part])
    : [at.part];
  view.dispatch(view.state.tr.setMeta(blockPicksKey, parts.length ? { block: at.block, parts } : EMPTY));
}

export function clearPicks(view: EditorView): boolean {
  if (!picksOf(view.state).parts.length) return false;
  view.dispatch(view.state.tr.setMeta(blockPicksKey, EMPTY));
  return true;
}

export function pickedText(state: EditorState): string {
  const { parts } = picksOf(state);
  return [...parts].sort((a, b) => a - b)
    .map((p) => state.doc.nodeAt(p))
    .filter((n): n is PMNode => !!n)
    .map((n) => noteClipboardText(new Slice(Fragment.from(n), 0, 0)).trim() || n.textContent)
    .join('\n');
}

// Deletes the picked parts. Picking every part deletes the block; leaving fewer than the block
// allows is refused with a message. Returns whether anything was deleted.
export function deletePicked(view: EditorView): boolean {
  const { block, parts } = picksOf(view.state);
  if (block === null || !parts.length) return false;
  const { doc } = view.state;
  const node = doc.nodeAt(block);
  if (!node) return false;
  // What each container of picked parts (the block, or a list or column in it) keeps.
  const picked = new Set(parts);
  const containers = new Set(parts.map((p) => doc.resolve(p).before()));
  const valid = [...containers].every((c) => {
    const parent = doc.nodeAt(c);
    if (!parent) return false;
    const kept: PMNode[] = [];
    parent.forEach((child, offset) => { if (!picked.has(c + 1 + offset)) kept.push(child); });
    return parent.type.validContent(Fragment.from(kept));
  });
  const everyPart = partsOf(doc, block).every((p) => picked.has(p));
  let tr: Transaction;
  if (!valid && everyPart) {
    tr = view.state.tr.delete(block, block + node.nodeSize);
  } else if (!valid) {
    void alertDialog(LABELS.noteBlocks.picked.tooFew);
    return false;
  } else {
    tr = view.state.tr;
    for (const p of [...parts].sort((a, b) => b - a)) {
      const n = tr.doc.nodeAt(p);
      if (n) tr.delete(p, p + n.nodeSize);
    }
  }
  view.dispatch(tr.setMeta(blockPicksKey, EMPTY).scrollIntoView());
  view.focus();
  return true;
}

function copyPicked(view: EditorView, e: ClipboardEvent): boolean {
  const text = pickedText(view.state);
  if (!text || !e.clipboardData) return false;
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
  return true;
}

export const NoteBlockPicks = Extension.create({
  name: 'noteBlockPicks',
  // Above the blocks' own key handling (their Backspace steps back through a block) and above
  // NoteBlockSelect's Esc. Every handler here does nothing unless parts are picked, and any edit
  // (a `\` session typing) clears the picks, so nothing else loses a key it needs.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Escape: () => clearPicks(this.editor.view),
      Delete: () => deletePicked(this.editor.view),
      Backspace: () => deletePicked(this.editor.view),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin<Picks>({
      key: blockPicksKey,
      state: {
        init: () => EMPTY,
        apply(tr, value) {
          const meta = tr.getMeta(blockPicksKey) as Picks | undefined;
          if (meta) return meta;
          if (!value.parts.length) return value;
          return tr.docChanged ? EMPTY : value;
        },
      },
      props: {
        decorations(state) {
          const { parts } = picksOf(state);
          if (!parts.length) return null;
          return DecorationSet.create(state.doc, parts.flatMap((p) => {
            const n = state.doc.nodeAt(p);
            return n ? [Decoration.node(p, p + n.nodeSize, { 'data-block-picked': '' })] : [];
          }));
        },
        handleDOMEvents: {
          mousedown(view, e) {
            const target = e.target as HTMLElement;
            const mod = e.ctrlKey || e.metaKey;
            if (e.button !== 0 || !mod || target.closest('a, mark[data-artifact-id], [data-block-tools]')) {
              if (e.button === 0 && !mod) clearPicks(view);
              return false;
            }
            const coords = view.posAtCoords({ left: e.clientX, top: e.clientY });
            if (!coords) return false;
            if (e.altKey) {
              const blockEl = target.closest('[data-note-block]');
              if (!blockEl || !view.dom.contains(blockEl)) return false;
              const pos = view.posAtDOM(blockEl, 0) - 1;
              const node = view.state.doc.nodeAt(pos);
              if (!node || !NOTE_BLOCK_NODES.has(node.type.name)) return false;
              e.preventDefault();
              clearPicks(view);
              selectBlock(view, pos);
              return true;
            }
            const at = partAt(view.state.doc, coords.inside >= 0 ? coords.inside : coords.pos) ?? partAt(view.state.doc, coords.pos);
            if (!at) return false;
            e.preventDefault();
            togglePick(view, at);
            view.focus();    // so Esc, Delete and Ctrl+C reach the picks
            return true;
          },
          copy: (view, e) => copyPicked(view, e),
          cut: (view, e) => copyPicked(view, e) && deletePicked(view),
        },
      },
    })];
  },
});

registerContextMenuProvider({
  id: 'note-editor.block-picks',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-note-block]'),
  items: (_ctx, scope) => {
    const view = (scope.data as { editor: { view: EditorView } }).editor.view;
    const n = picksOf(view.state).parts.length;
    if (!n) return [];
    const L = LABELS.noteBlocks.picked;
    return [
      { id: 'picked-copy', label: L.copy(n), icon: '⧉', run: () => { void navigator.clipboard?.writeText(pickedText(view.state)); } },
      { id: 'picked-delete', label: L.delete(n), icon: createElement(TrashIcon), destructive: true, run: () => { deletePicked(view); } },
      { id: 'picked-clear', label: L.clear, shortcut: 'Esc', run: () => { clearPicks(view); } },
    ];
  },
});
