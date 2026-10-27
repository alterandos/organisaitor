import { Extension } from '@tiptap/core';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { getStructuredTagType } from '@/config/structuredTagTypes';
import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked } from '@/services/noteSecrets';
import { entryImportance, setEntryImportance } from '@/services/glossary';
import { NOTE_BLOCK_NODES } from '../blockNodes';
import { blockPosAt, openBlockPopover, pillButton, popoverClass, registerPillAddition } from './blockDesigns';
import { IMPORTANCE_LEVELS, importanceLevel } from './importanceLevels';
import { refreshMarginColumns, registerMarginSource } from './MarginColumn';

// Important blocks and cards (asked for by the user 2026-10-26): the three levels Important text
// has (Important, Very important, Critical), for a whole block. Set from every block's pill (★
// toggles Important, ▾ chooses a level: a quick toggle for the usual case, the levels a click
// away), its right-click menu (Importance ▸), or Ctrl+1 on a selected block (steps through the
// levels and off, as on text). Shown as its level's icon in the margin column, beside the block.
//
// Where it's kept: on the block (its `importance` attribute, a global attribute on every block
// node, so no block's own code changes), except a Glossary card, whose importance is its record's
// (services/glossary.ts entryImportance), so every card of a term, the Glossary and hover cards
// agree, and a card says it in its kind line ("Key concept", "Critical acronym").
// Not on the Review list: Review takes passages you choose ("Review later"), never by importance.

export type Level = 0 | 1 | 2 | 3;
const RECORD_NODES = new Set(['glossaryCard']);
const ATTR_NODES = [...NOTE_BLOCK_NODES].filter((n) => !RECORD_NODES.has(n));

const recordOf = (entryId: unknown) => {
  const raw = entryId ? useNoteStore.getState().structuredTagEntries[entryId as never] : undefined;
  return raw && !isEntryLocked(raw) ? entryView(raw) : null;
};

export function blockImportance(state: EditorState, pos: number): Level {
  const node = state.doc.nodeAt(pos);
  if (!node) return 0;
  if (RECORD_NODES.has(node.type.name)) { const r = recordOf(node.attrs.entryId); return r ? entryImportance(r) : 0; }
  const v = node.attrs.importance;
  return v === 1 || v === 2 || v === 3 ? v : 0;
}

export function setBlockImportance(view: EditorView, pos: number, level: Level): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !NOTE_BLOCK_NODES.has(node.type.name) || !view.editable) return;
  if (RECORD_NODES.has(node.type.name)) {
    if (node.attrs.entryId) setEntryImportance(node.attrs.entryId as string, level);
    refreshMarginColumns();
    return;
  }
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, importance: level || null }));
}

export function cycleBlockImportance(view: EditorView, pos: number): void {
  const now = blockImportance(view.state, pos);
  setBlockImportance(view, pos, (now >= 3 ? 0 : now + 1) as Level);
}

// The block a whole-block selection holds, or null.
export function selectedBlock(state: EditorState): number | null {
  const sel = state.selection;
  return sel instanceof NodeSelection && NOTE_BLOCK_NODES.has(sel.node.type.name) ? sel.from : null;
}

// What a level is called on this block: a Glossary card says it with its kind.
export function levelLabel(state: EditorState, pos: number, level: 1 | 2 | 3): string {
  const node = state.doc.nodeAt(pos);
  const record = node && RECORD_NODES.has(node.type.name) ? recordOf(node.attrs.entryId) : null;
  return record ? LABELS.importance.kindLevel(level, getStructuredTagType(record.typeKey)?.label ?? '') : LABELS.importance.levels[level];
}

function chooseLevel(view: EditorView, pos: number, anchor: DOMRect): void {
  const now = blockImportance(view.state, pos);
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = popoverClass.heading;
    heading.textContent = LABELS.importance.choose;
    const row = document.createElement('div');
    row.className = popoverClass.row;
    const choices: [Level, string][] = [...IMPORTANCE_LEVELS.map((lv) => [lv.level, `${lv.icon} ${levelLabel(view.state, pos, lv.level)}`] as [Level, string]), [0, LABELS.importance.notImportant]];
    for (const [level, text] of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = popoverClass.choice;
      b.textContent = text;
      b.setAttribute('aria-pressed', String(level === now));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { close(); setBlockImportance(view, pos, level); view.focus(); });
      row.append(b);
    }
    box.append(heading, row);
    return box;
  });
}

// ★ and ▾ in every block's pill. The ★ shows pressed through the block's data-importance (CSS),
// since a pill isn't redrawn when only this changes.
registerPillAddition('importance', (view, blockPos) => {
  const group = document.createElement('span');
  group.setAttribute('data-block-importance', '');
  const star = pillButton(LABELS.importance.toggle, () => {
    const p = blockPos();
    if (p !== undefined) setBlockImportance(view, p, blockImportance(view.state, p) ? 0 : 1);
  }, '★');
  star.setAttribute('data-block-star', '');
  const more = pillButton(LABELS.importance.choose, () => {
    const p = blockPos();
    if (p !== undefined) chooseLevel(view, p, more.getBoundingClientRect());
  }, '▾');
  more.setAttribute('data-block-star-more', '');
  group.append(star, more);
  return group;
});

// The level's icon in the margin column, beside the whole block.
registerMarginSource('important-blocks', (state) => {
  const out: ReturnType<Parameters<typeof registerMarginSource>[1]> = [];
  state.doc.descendants((node, pos) => {
    if (!NOTE_BLOCK_NODES.has(node.type.name)) return !node.isTextblock;
    const level = blockImportance(state, pos);
    if (level) {
      const info = importanceLevel(level);
      out.push({
        key: `important-block-${pos}`,
        from: pos,
        to: pos + node.nodeSize,
        icon: () => document.createTextNode(info.icon),
        color: info.color,
        title: levelLabel(state, pos, level),
        open: (view, anchor) => chooseLevel(view, pos, anchor),
      });
    }
    return false;
  });
  return out;
});

// Right-click on a block: Importance ▸ with the levels.
registerContextMenuProvider({
  id: 'note-editor.block-importance',
  kind: 'note-editor',
  order: 7,
  when: (ctx) => !!ctx.target.closest('[data-note-block]'),
  items: (ctx, scope) => {
    const view = (scope.data as { editor: { view: EditorView } }).editor.view;
    const pos = blockPosAt(view, ctx.target);
    if (pos === null) return [];
    const now = blockImportance(view.state, pos);
    const levels = [
      ...IMPORTANCE_LEVELS.map((lv) => ({ level: lv.level as Level, label: levelLabel(view.state, pos, lv.level), icon: now === lv.level ? '✓' : lv.icon })),
      { level: 0 as Level, label: LABELS.importance.notImportant, icon: now === 0 ? '✓' : undefined },
    ];
    return [{
      id: 'block-importance', label: LABELS.importance.menuLevel, icon: '⭐',
      submenu: [levels.map((l) => ({ id: `block-importance-${l.level}`, label: l.label, icon: l.icon, run: () => setBlockImportance(view, pos, l.level) }))],
    }];
  },
});

// The attribute on every block but a Glossary card (whose level is its record's).
export const BlockImportance = Extension.create({
  name: 'blockImportance',
  addGlobalAttributes() {
    return [{
      types: ATTR_NODES,
      attributes: {
        importance: {
          default: null,
          parseHTML: (el: HTMLElement) => { const n = Number(el.getAttribute('data-importance')); return n === 1 || n === 2 || n === 3 ? n : null; },
          renderHTML: (a: Record<string, unknown>) => (a.importance ? { 'data-importance': String(a.importance) } : {}),
        },
      },
    }];
  },
});
