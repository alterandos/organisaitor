import { Node as PMNode, type Schema } from '@tiptap/pm/model';
import { nanoid } from 'nanoid';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { liveNoteEditorFor } from '@/services/liveNoteEditor';
import { editNoteText } from '@/services/noteContentEdit';
import { openNotePassage } from '@/services/notePassage';
import { findBlock, passageRange } from '@/utils/noteLinks';
import { MAIN_TAB_ID } from '@/utils/noteTabs';
import { noteName } from '@/utils/notes';
import type { PassageFind } from '@/utils/noteContent';
import type { NoteId } from '@/types';
import { LINKABLE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';

// What a link between notes points at (the `noteLink` mark, the `noteEmbed` block): reading the
// target note's text (live when it's open in the editor), giving a passage a lasting id the first
// time something points at it, and opening it. Agreed with the user 2026-10-13.

const tab = (tabId: string | null | undefined) => (!tabId || tabId === MAIN_TAB_ID ? null : tabId);

// The target note's document, read with the editor's schema: the open editor's if it's showing
// that tab (its latest typing), else the stored content. Null for a missing or locked note.
export function noteDocFor(noteId: string, tabId: string | null | undefined, schema: Schema): PMNode | null {
  const live = liveNoteEditorFor(noteId, tab(tabId));
  if (live) return live.state.doc;
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw || isNoteLocked(raw)) return null;
  const n = noteView(raw);
  const json = tab(tabId) ? n.tabs.find((t) => t.id === tab(tabId))?.content : n.content;
  if (!json) return null;
  try { return PMNode.fromJSON(schema, JSON.parse(json)); } catch { return null; }
}

export type TargetState = 'ok' | 'missing-note' | 'missing-passage' | 'locked';

// `title` is the note's name with its notebook (utils/notes noteName), for showing; '' when untitled.
export interface TargetPreview { state: TargetState; title: string; heading: string | null; fragment: PMNode[] }

// What a link shows when hovered and an embed shows in full: the passage (a paragraph, or a
// heading and its section), or the note's opening when it points at the whole note.
export function linkTarget(noteId: string, tabId: string | null | undefined, blockId: string | null | undefined, schema: Schema, wholeNoteBlocks = 4): TargetPreview {
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw || raw.archivedAt) return { state: 'missing-note', title: '', heading: null, fragment: [] };
  const view = noteView(raw);
  const title = view.title.trim() ? noteName(view, useNoteStore.getState().noteTags, { untitled: '' }).full : '';
  if (isNoteLocked(raw)) return { state: 'locked', title, heading: null, fragment: [] };
  const doc = noteDocFor(noteId, tabId, schema);
  if (!doc) return { state: 'ok', title, heading: null, fragment: [] };
  if (!blockId) {
    const blocks: PMNode[] = [];
    doc.descendants((n) => { if (blocks.length >= wholeNoteBlocks) return false; if (n.isTextblock && n.textContent.trim()) { blocks.push(n); return false; } return !n.isTextblock; });
    return { state: 'ok', title, heading: null, fragment: blocks };
  }
  const found = findBlock(doc, blockId);
  if (!found) return { state: 'missing-passage', title, heading: null, fragment: [] };
  const { from, to } = passageRange(doc, found.pos);
  const fragment: PMNode[] = [];
  doc.nodesBetween(from, to, (n, pos) => { if (pos >= from && pos < to && doc.resolve(pos).depth === doc.resolve(from).depth) { fragment.push(n); return false; } return true; });
  return { state: 'ok', title, heading: found.node.type.name === 'heading' ? found.node.textContent : null, fragment };
}

// A lasting id on the passage at `pos` in the target note (kept if it has one), so links survive
// edits around it. Written through the open editor, or into the stored note.
export function ensureBlockId(noteId: string, tabId: string | null | undefined, pos: number, schema: Schema): string | null {
  const doc = noteDocFor(noteId, tabId, schema);
  const node = doc?.nodeAt(pos);
  if (!node || !('blockId' in node.attrs)) return null;
  if (node.attrs.blockId) return node.attrs.blockId as string;
  const id = nanoid(10);
  const ok = editNoteText(noteId as NoteId, tab(tabId), schema, (tr) => {
    if (tr.doc.nodeAt(pos)?.type !== node.type) return false;
    tr.setNodeAttribute(pos, 'blockId', id);
    return true;
  }, { addToHistory: false });
  return ok ? id : null;
}

const passageFinds = (blockId: string): PassageFind[] => ['paragraph', 'heading', ...LINKABLE_BLOCK_NODES]
  .map((node) => ({ node, attr: 'blockId', value: blockId }));

// Opens what a link points at: the note at its passage, or the note on its tab.
export function openNoteLink(noteId: string, tabId: string | null | undefined, blockId: string | null | undefined): void {
  if (blockId) { openNotePassage(noteId, passageFinds(blockId)); return; }
  const ui = useUIStore.getState();
  if (ui.activeView !== 'notes') ui.setActiveView('notes');
  ui.openNote(noteId, tabId ?? undefined);
}
