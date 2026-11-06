import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked } from '@/services/noteSecrets';
import { createGlyph, createUnsureIcon } from '@/components/Icons';
import { NOTE_BLOCK_NODES } from '../blockNodes';
import { pillButton, registerPillAddition } from './blockDesigns';
import { refreshMarginColumns, registerMarginSource } from './MarginColumn';
import { openClarifyPopover } from './ClarifyMark';

// A whole block (or card) marked "Clarify later" or "Not sure of this" (2026-11-05), as text can be
// (ClarifyMark.ts, UnsureFlag.ts). Set from every block's pill, its right-click menu, or the margin
// icon's popover; listed in the Clarify tool (services/noteClarify.ts).
//
// Where it's kept: on the block, two global attributes per flag (`clarify` / `unsure` hold the
// flag's id, `clarifyNote` / `unsureNote` what to look into or why), except a Glossary card, whose
// flags are its record's (fields `clarifyLater` / `unsureOf`, { id, note }), so every card of a term
// and the Glossary agree; as importance is (BlockImportance.ts).
//
// "Learned it" on Clarify later keeps the flag with the date it was learned (`clarifyLearnedAt` on a
// block, `learnedAt` in the record's field), so what was learned and when stays for study later; a
// learned flag isn't drawn or listed under To learn. "Resolved" on Not sure takes the flag off.

export type BlockFlagKind = 'clarify' | 'unsure';
export interface BlockFlag { id: string; note: string | null; learnedAt?: string | null }

export const BLOCK_FLAGS: Record<BlockFlagKind, { attr: string; noteAttr: string; recordField: string; learnedAttr?: string }> = {
  clarify: { attr: 'clarify', noteAttr: 'clarifyNote', recordField: 'clarifyLater', learnedAttr: 'clarifyLearnedAt' },
  unsure:  { attr: 'unsure',  noteAttr: 'unsureNote',  recordField: 'unsureOf' },
};
const KINDS = Object.keys(BLOCK_FLAGS) as BlockFlagKind[];

const RECORD_NODES = new Set(['glossaryCard']);
const ATTR_NODES = [...NOTE_BLOCK_NODES].filter((n) => !RECORD_NODES.has(n));

// The flag as kept, learned or not (anyRecordFlag / anyNodeFlag); recordFlag / nodeFlag: only while
// it's still on (not learned), which is what's drawn and listed.
export function anyRecordFlag(fields: Record<string, unknown> | undefined, kind: BlockFlagKind): BlockFlag | null {
  const v = fields?.[BLOCK_FLAGS[kind].recordField] as { id?: unknown; note?: unknown; learnedAt?: unknown } | undefined;
  return v && typeof v.id === 'string'
    ? { id: v.id, note: typeof v.note === 'string' && v.note ? v.note : null, learnedAt: typeof v.learnedAt === 'string' ? v.learnedAt : null }
    : null;
}
export function recordFlag(fields: Record<string, unknown> | undefined, kind: BlockFlagKind): BlockFlag | null {
  const f = anyRecordFlag(fields, kind);
  return f && !f.learnedAt ? f : null;
}

export function anyNodeFlag(attrs: Record<string, unknown>, kind: BlockFlagKind): BlockFlag | null {
  const { attr, noteAttr, learnedAttr } = BLOCK_FLAGS[kind];
  const id = attrs[attr];
  return typeof id === 'string' && id ? { id, note: (attrs[noteAttr] as string | null) || null, learnedAt: learnedAttr ? (attrs[learnedAttr] as string | null) || null : null } : null;
}
export function nodeFlag(attrs: Record<string, unknown>, kind: BlockFlagKind): BlockFlag | null {
  const f = anyNodeFlag(attrs, kind);
  return f && !f.learnedAt ? f : null;
}

// The attributes that set a block's flag (null: off), learned date included.
export function flagAttrs(kind: BlockFlagKind, flag: BlockFlag | null): Record<string, unknown> {
  const { attr, noteAttr, learnedAttr } = BLOCK_FLAGS[kind];
  return { [attr]: flag?.id ?? null, [noteAttr]: flag?.note ?? null, ...(learnedAttr ? { [learnedAttr]: flag?.learnedAt ?? null } : {}) };
}

const recordOf = (entryId: unknown) => {
  const raw = entryId ? useNoteStore.getState().structuredTagEntries[entryId as never] : undefined;
  return raw && !isEntryLocked(raw) ? raw : null;
};

// For a block drawn by a node view (applyFrameAttrs) and a Glossary card (its record's flags).
export function applyFlagAttrs(dom: HTMLElement, flags: Partial<Record<BlockFlagKind, BlockFlag | null>>): void {
  for (const kind of KINDS) {
    const f = flags[kind];
    if (f) dom.setAttribute(`data-flag-${kind}`, f.id); else dom.removeAttribute(`data-flag-${kind}`);
  }
}

export function blockFlag(state: EditorState, pos: number, kind: BlockFlagKind): BlockFlag | null {
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  if (RECORD_NODES.has(node.type.name)) { const r = recordOf(node.attrs.entryId); return r ? recordFlag(entryView(r).fields, kind) : null; }
  return nodeFlag(node.attrs, kind);
}

// A record's flag set or cleared (a Glossary card's): through the store, encryption-aware.
export function setRecordFlag(entryId: string, kind: BlockFlagKind, flag: BlockFlag | null): void {
  const raw = recordOf(entryId);
  if (!raw) return;
  const fields = { ...entryView(raw).fields };
  if (flag) fields[BLOCK_FLAGS[kind].recordField] = { id: flag.id, note: flag.note, ...(flag.learnedAt ? { learnedAt: flag.learnedAt } : {}) };
  else delete fields[BLOCK_FLAGS[kind].recordField];
  useNoteStore.getState().updateStructuredTagEntry(raw.id, { fields });
}

export function setBlockFlag(view: EditorView, pos: number, kind: BlockFlagKind, flag: BlockFlag | null): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !NOTE_BLOCK_NODES.has(node.type.name) || !view.editable) return;
  if (RECORD_NODES.has(node.type.name)) {
    if (node.attrs.entryId) setRecordFlag(node.attrs.entryId as string, kind, flag);
    refreshMarginColumns();
    return;
  }
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...flagAttrs(kind, flag) }));
}

// Done with a flag: Clarify later is kept as learned (with today's date), Not sure comes off.
export const doneFlag = (kind: BlockFlagKind, flag: BlockFlag): BlockFlag | null =>
  (kind === 'clarify' ? { ...flag, learnedAt: new Date().toISOString() } : null);

export function toggleBlockFlag(view: EditorView, pos: number, kind: BlockFlagKind): void {
  setBlockFlag(view, pos, kind, blockFlag(view.state, pos, kind) ? null : { id: nanoid(10), note: null });
}

const L = LABELS.clarify;
const UL = LABELS.unsureFlag;
const flagLabel = (kind: BlockFlagKind) => (kind === 'clarify' ? L.blockToggle : L.blockUnsure);
const icon = (kind: BlockFlagKind) => (kind === 'clarify' ? createGlyph('clarify') : createUnsureIcon());

function openFlagPopover(view: EditorView, pos: number, kind: BlockFlagKind, anchor: DOMRect): void {
  const flag = blockFlag(view.state, pos, kind);
  if (!flag) return;
  openClarifyPopover(anchor, {
    note: flag.note,
    onNote: (note) => setBlockFlag(view, pos, kind, { id: flag.id, note: note.trim() || null }),
    onDone: () => setBlockFlag(view, pos, kind, doneFlag(kind, flag)),
    doneLabel: kind === 'clarify' ? L.learned : L.resolved,
    noteLabel: kind === 'clarify' ? L.note : UL.why,
    noteHint: kind === 'clarify' ? L.noteHint : UL.whyHint,
  });
}

// Two buttons in every block's pill. Pressed through the block's own data-flag-clarify / -unsure
// (CSS), since a pill isn't redrawn when only these change.
registerPillAddition('flags', (view, blockPos) => {
  const group = document.createElement('span');
  group.setAttribute('data-block-flags', '');
  for (const kind of KINDS) {
    const b = pillButton(flagLabel(kind), () => { const p = blockPos(); if (p !== undefined) toggleBlockFlag(view, p, kind); });
    b.setAttribute(`data-block-flag`, kind);
    b.append(icon(kind));
    group.append(b);
  }
  return group;
});

// The flag's icon in the margin column, beside the whole block.
for (const kind of KINDS) {
  registerMarginSource(`block-${kind}`, (state) => {
    const out: ReturnType<Parameters<typeof registerMarginSource>[1]> = [];
    state.doc.descendants((node, pos) => {
      if (!NOTE_BLOCK_NODES.has(node.type.name)) return !node.isTextblock;
      const flag = blockFlag(state, pos, kind);
      if (flag) {
        out.push({
          key: `block-${kind}-${flag.id}`,
          from: pos,
          to: pos + node.nodeSize,
          icon: () => icon(kind),
          color: kind === 'clarify' ? 'var(--color-clarify)' : 'var(--color-muted)',
          title: kind === 'clarify' ? (flag.note ? L.markerNote(flag.note) : L.marker) : (flag.note ? L.unsureMarkerWhy(flag.note) : L.unsureMarker),
          open: (view, anchor) => openFlagPopover(view, pos, kind, anchor),
        });
      }
      return false;
    });
    return out;
  });
}

// The attributes on every block but a Glossary card (whose flags are its record's).
export const BlockFlags = Extension.create({
  name: 'blockFlags',
  addGlobalAttributes() {
    // On the block as data-flag-clarify / data-flag-clarify-note (not data-clarify: that's the text mark).
    const str = (key: string, data: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-flag-${data}`) || null,
      renderHTML: (a: Record<string, unknown>) => (a[key] ? { [`data-flag-${data}`]: String(a[key]) } : {}),
    });
    // A learned Clarify later keeps its id as data-flag-clarify-kept, so it isn't drawn as on.
    const clarify = {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-flag-clarify') || el.getAttribute('data-flag-clarify-kept') || null,
      renderHTML: (a: Record<string, unknown>) => (a.clarify ? { [a.clarifyLearnedAt ? 'data-flag-clarify-kept' : 'data-flag-clarify']: String(a.clarify) } : {}),
    };
    return [{
      types: ATTR_NODES,
      attributes: {
        clarify, clarifyNote: str('clarifyNote', 'clarify-note'), clarifyLearnedAt: str('clarifyLearnedAt', 'clarify-learned'),
        unsure: str('unsure', 'unsure'), unsureNote: str('unsureNote', 'unsure-note'),
      },
    }];
  },
});
