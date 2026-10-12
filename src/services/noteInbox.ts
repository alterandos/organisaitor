import { nanoid } from 'nanoid';
import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode, Schema, Slice } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';
import type { EditorView } from '@tiptap/pm/view';
import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { editNoteText } from '@/services/noteContentEdit';
import { liveNoteOf } from '@/services/liveNoteEditor';
import { noteHasPassage, openNotePassage } from '@/services/notePassage';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { deleteForever, trashedBy } from '@/services/trash';
import { showToast } from '@/components/Toast/showToast';
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { collectInboxes, type InboxRef } from '@/utils/noteInboxes';
import type { PassageNode } from '@/utils/noteContent';
import { findNode, insertItem, itemText, newItem, sliceToBlocks } from '@/utils/inboxDoc';
import { linkTabIdFor } from '@/utils/noteTabs';
import { getNoteEffectiveCollectionId } from '@/utils/notes';
import { LABELS } from '@/config/labels';
import type { NoteId, TaskId } from '@/types';

// Inboxes: sending a passage from a note into an inbox (the `\inbox` block), and what an inbox
// item can do (become a task, go back to where it came from). The rules live here, for the
// selection menu, the right-click menu and the block's own buttons.
//
// Sending MOVES the passage: it leaves the note and becomes an item in the inbox, and a small
// marker (movedStub) takes its place, saying where it went. The marker can be removed at any time
// (Ctrl+Z brings it back); nothing depends on it. The toast's Undo puts the passage back.
// Within one note (and tab) it's one change, so Ctrl+Z also undoes it. Between notes the source
// change is kept out of Ctrl+Z (it would bring the text back while the inbox kept its copy);
// the toast's Undo is the way back.

export interface NoteText { noteId: string; tabId: string | null }   // tabId null = the main tab
export type SendTarget = InboxRef | { newHere: true };

const L = LABELS.sendToInbox;

// Every inbox in a readable note.
export function listInboxes(): InboxRef[] {
  const notes = Object.values(useNoteStore.getState().notes).filter((n) => !isNoteLocked(n)).map(noteView);
  return collectInboxes(notes);
}

export function noteTitleOf(noteId: string | null): string | null {
  if (!noteId) return null;
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw) return null;
  return isNoteLocked(raw) ? '🔒' : noteView(raw).title || 'Untitled';
}

// Whether the selection is in, or takes in, an inbox: that can't be sent.
export function selectionTouchesInbox(state: EditorState): boolean {
  const { from, to, $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'inbox') return true;
  let touches = false;
  state.doc.nodesBetween(from, to, (n) => { if (n.type.name === 'inbox') touches = true; return !touches; });
  return touches;
}

const firstLineAndRest = (blocks: PMNode[]) => {
  const lines = blocks.map((b) => b.textContent.trim()).filter(Boolean);
  return { first: lines[0] ?? '', rest: lines.slice(1).join('\n') };
};

// A task made from an inbox item, linked to the note the inbox is in.
function createTaskFor(target: NoteText, title: string, notes: string): string {
  const raw = useNoteStore.getState().notes[target.noteId as NoteId];
  const note = raw ? noteView(raw) : undefined;
  const tabId = linkTabIdFor(note, target.tabId);
  return useTaskStore.getState().addTask({
    title:        title || LABELS.noteBlocks.inbox.label,
    notes:        notes || null,
    collectionId: note ? getNoteEffectiveCollectionId(note, useNoteStore.getState().noteTags) : null,
    crossAppRefs: [{ type: 'note', id: target.noteId, ...(tabId ? { tabId } : {}) }],
  });
}

// Undoing a task made a moment ago: gone, and not left in the Recycling Bin.
function discardTask(taskId: string) {
  for (const entry of trashedBy(() => deleteTaskWithCleanup(taskId as TaskId))) deleteForever(entry);
}

// Where to put a new inbox at the end of a note: the end of the document, or of its last section.
function endOf(doc: PMNode, type: PMNode['type']): number {
  const end = doc.content.size;
  const $end = doc.resolve(end);
  return $end.parent.canReplaceWith($end.index(), $end.index(), type) ? end : end - 1;
}

interface Sent {
  source:       NoteText;
  target:       NoteText & { inboxId: string; title: string };
  itemId:       string;
  slice:        Slice;
  schema:       Schema;
  taskId:       string | null;
  createdInbox: boolean;
}

const isEncrypted = (noteId: string) => !!useNoteStore.getState().notes[noteId as NoteId]?.isEncrypted;

// Sends the editor's selection to `target`. Moving text out of an encrypted note into one that
// isn't would store it unencrypted there, so that asks first (agreed with the user 2026-10-13).
// Resolves to whether it was sent.
export async function sendToInbox(view: EditorView, source: NoteText, target: SendTarget, options: { makeTask?: boolean } = {}): Promise<boolean> {
  if (view.state.selection.empty) return false;
  const targetNote = 'newHere' in target ? source.noteId : target.noteId;
  if (isEncrypted(source.noteId) && !isEncrypted(targetNote)) {
    const ok = await confirmDialog({
      title:        L.unencryptTitle,
      message:      L.unencryptMessage(noteTitleOf(targetNote) ?? ''),
      confirmLabel: L.unencryptConfirm,
    });
    if (!ok || view.isDestroyed) return false;
  }
  return moveToInbox(view, source, target, options);
}

function moveToInbox(view: EditorView, source: NoteText, target: SendTarget, options: { makeTask?: boolean }): boolean {
  const { state } = view;
  if (state.selection.empty) return false;
  if (selectionTouchesInbox(state)) { void alertDialog(L.fromInside); return false; }
  const { schema } = state;
  const slice = state.selection.content();
  const blocks = sliceToBlocks(slice, schema);
  const createdInbox = 'newHere' in target;
  const to = createdInbox
    ? { noteId: source.noteId, tabId: source.tabId, inboxId: nanoid(10), title: LABELS.noteBlocks.inbox.defaultTitle }
    : { noteId: target.noteId, tabId: target.tabId, inboxId: target.inboxId, title: target.title || LABELS.noteBlocks.inbox.defaultTitle };
  const itemId = nanoid(10);
  const { first, rest } = firstLineAndRest(blocks);
  const taskId = options.makeTask ? createTaskFor(to, first, rest) : null;
  const item = newItem(schema, { itemId, sentAt: new Date().toISOString(), fromNote: source.noteId, fromTab: source.tabId, taskId }, blocks);
  const stub = schema.nodes.movedStub.create({ noteId: to.noteId, inboxId: to.inboxId, itemId, title: to.title });

  const putIn = (tr: Transform): boolean => {
    if (createdInbox) {
      const { inbox, inboxTitle } = schema.nodes;
      tr.insert(endOf(tr.doc, inbox), inbox.create({ inboxId: to.inboxId }, [inboxTitle.create(null, schema.text(to.title)), item]));
      return true;
    }
    const found = findNode(tr.doc, 'inbox', 'inboxId', to.inboxId);
    if (!found) return false;
    insertItem(tr, found.pos, item);
    return true;
  };

  const sameText = to.noteId === source.noteId && to.tabId === source.tabId;
  if (sameText) {
    const tr = state.tr.deleteSelection();
    tr.replaceSelectionWith(stub, false);
    if (!putIn(tr)) { if (taskId) discardTask(taskId); void alertDialog(L.failed); return false; }
    view.dispatch(tr);
  } else {
    if (!editNoteText(to.noteId, to.tabId, schema, putIn)) { if (taskId) discardTask(taskId); void alertDialog(L.failed); return false; }
    const tr = view.state.tr.deleteSelection();
    tr.replaceSelectionWith(stub, false);
    view.dispatch(tr.setMeta('addToHistory', false));
  }

  const sent: Sent = { source, target: to, itemId, slice, schema, taskId, createdInbox };
  showToast({
    message: L.moved(to.title),
    actions: [
      { label: L.open, onClick: () => openInboxItem(to.noteId, itemId) },
      { label: L.undo, onClick: () => undoSend(sent) },
    ],
  });
  return true;
}

// Puts a sent passage back where its marker is, and takes it out of the inbox.
function undoSend(sent: Sent): void {
  editNoteText(sent.target.noteId, sent.target.tabId, sent.schema, (tr) => {
    const found = sent.createdInbox
      ? findNode(tr.doc, 'inbox', 'inboxId', sent.target.inboxId)
      : findNode(tr.doc, 'inboxItem', 'itemId', sent.itemId);
    if (!found) return false;
    tr.delete(found.pos, found.pos + found.node.nodeSize);
    return true;
  });
  editNoteText(sent.source.noteId, sent.source.tabId, sent.schema, (tr) => {
    const stub = findNode(tr.doc, 'movedStub', 'itemId', sent.itemId);
    if (!stub) return false;
    tr.replace(stub.pos, stub.pos + stub.node.nodeSize, sent.slice);
    return true;
  });
  if (sent.taskId) discardTask(sent.taskId);
}

// ── An item's actions (from the block's buttons and its right-click menu) ───────────────

const noteHas = noteHasPassage;

export function openInboxItem(noteId: string, itemId: string): void {
  const find: PassageNode = { node: 'inboxItem', attr: 'itemId', value: itemId };
  if (!noteHas(noteId, find)) { showToast({ message: L.gone }); return; }
  openNotePassage(noteId, find);
}

// The marker the passage left where it came from.
export function openItemSource(fromNote: string | null, itemId: string): void {
  const find: PassageNode = { node: 'movedStub', attr: 'itemId', value: itemId };
  if (!fromNote || !noteHas(fromNote, find)) { showToast({ message: LABELS.noteBlocks.inbox.noSource }); return; }
  openNotePassage(fromNote, find);
}

// Makes a task from the item at `pos` (or opens the one it has).
export function makeItemTask(view: EditorView, pos: number): void {
  const item = view.state.doc.nodeAt(pos);
  if (item?.type.name !== 'inboxItem') return;
  if (item.attrs.taskId && useTaskStore.getState().tasks[item.attrs.taskId as TaskId]) {
    openArtifactTarget('task', item.attrs.taskId as string);
    return;
  }
  const here = liveNoteOf(view);
  if (!here) return;
  const blocks: PMNode[] = [];
  item.forEach((b) => blocks.push(b));
  const { rest } = firstLineAndRest(blocks);
  const taskId = createTaskFor(here, itemText(item), rest);
  view.dispatch(view.state.tr.setNodeAttribute(pos, 'taskId', taskId));
  showToast({
    message: LABELS.noteBlocks.inbox.taskMade,
    actions: [
      { label: L.open, onClick: () => openArtifactTarget('task', taskId) },
      { label: L.undo, onClick: () => {
        const at = findNode(view.state.doc, 'inboxItem', 'itemId', item.attrs.itemId as string);
        if (at && !view.isDestroyed) view.dispatch(view.state.tr.setNodeAttribute(at.pos, 'taskId', null));
        discardTask(taskId);
      } },
    ],
  });
}

export const taskExists = (taskId: string | null): boolean => !!taskId && !!useTaskStore.getState().tasks[taskId as TaskId];
