import { nanoid } from 'nanoid';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';
import type { EditorView } from '@tiptap/pm/view';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { editNoteContent, editNoteText } from '@/services/noteContentEdit';
import { noteHasPassage, openNotePassage, definitionPassage } from '@/services/notePassage';
import { glossaryEntry } from '@/services/glossary';
import { showToast } from '@/components/Toast/showToast';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { collectHubs, linkInsertIndex, type HubLinkKind, type HubRef, type HubRelation } from '@/utils/noteHubs';
import type { PassageFind } from '@/utils/noteContent';
import { findNode } from '@/utils/inboxDoc';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types';

// Idea hubs: what a hub can link to and how links are made, changed, removed and followed. The
// rules live here, for the selection menu, the right-click menu, the hub's own buttons and the
// Hubs view.
//
// A passage stays where it is: it gets a `hubRef` mark (drawn as a small marker after it, so you
// can see which hubs it's in) and the hub gets a `hubLink` with a short preview. A Glossary term or
// a whole note is linked by id. Removing a link also takes its mark off the passage. A mark or link
// left behind some other way (the hub deleted, the passage deleted) is harmless: following it says
// so, and a marker that leads nowhere takes itself off when clicked.

export interface NoteText { noteId: string; tabId: string | null }   // tabId null = the main tab
export type HubTarget = HubRef | { newHere: true };

const L = LABELS.hubs;
const PREVIEW_CHARS = 160;

export function listHubs(): HubRef[] {
  const notes = Object.values(useNoteStore.getState().notes).filter((n) => !isNoteLocked(n)).map(noteView);
  return collectHubs(notes);
}

export function noteTitleOf(noteId: string | null): string | null {
  if (!noteId) return null;
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw) return null;
  return isNoteLocked(raw) ? '🔒' : noteView(raw).title || 'Untitled';
}

const isEncrypted = (noteId: string) => !!useNoteStore.getState().notes[noteId as NoteId]?.isEncrypted;

// Whether the selection is in, or takes in, a hub: that can't be added to one.
export function selectionTouchesHub(state: EditorState): boolean {
  const { from, to, $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'hub') return true;
  let touches = false;
  state.doc.nodesBetween(from, to, (n) => { if (n.type.name === 'hub') touches = true; return !touches; });
  return touches;
}

// Puts `link` into the hub at `hubPos`, at the end of its relation's group. Returns where it went.
export function insertLink(tr: Transform, hubPos: number, link: PMNode): number {
  const hub = tr.doc.nodeAt(hubPos)!;
  let at = hubPos + 1;
  const links: { relation: HubRelation; size: number }[] = [];
  hub.forEach((child) => {
    if (child.type.name === 'hubLink') links.push({ relation: child.attrs.relation as HubRelation, size: child.nodeSize });
    else at += child.nodeSize;
  });
  const index = linkInsertIndex(links, link.attrs.relation as HubRelation);
  for (let i = 0; i < index; i++) at += links[i].size;
  tr.insert(at, link);
  return at;
}

function endOf(doc: PMNode, type: PMNode['type']): number {
  const end = doc.content.size;
  const $end = doc.resolve(end);
  return $end.parent.canReplaceWith($end.index(), $end.index(), type) ? end : end - 1;
}

const newHub = (state: EditorState, hubId: string, links: PMNode[]) => {
  const { hub, hubTitle, hubTake } = state.schema.nodes;
  return hub.create({ hubId }, [hubTitle.create(), hubTake.create(), ...links]);
};

// Takes the marks of one link off a note's text (the editor's, or the stored copy).
function removeMarks(noteId: string, tabId: string | null, linkId: string): void {
  editNoteContent(noteId, tabId, {
    inEditor: (tr) => { removeMarksIn(tr, linkId); return true; },
    inJson: (json) => stripHubRefFromContent(json, linkId),
  });
}

function removeMarksIn(tr: Transaction | Transform, linkId: string): void {
  tr.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const m of node.marks) if (m.type.name === 'hubRef' && m.attrs.linkId === linkId) tr.removeMark(pos, pos + node.nodeSize, m);
    return false;
  });
}

interface JsonNode { marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: JsonNode[] }

// The stored-JSON half of removing a passage's mark; null when it had none.
export function stripHubRefFromContent(json: string, linkId: string): string | null {
  if (!json || !json.includes(linkId)) return null;
  let doc: JsonNode;
  try { doc = JSON.parse(json); } catch { return null; }
  let changed = false;
  const walk = (n: JsonNode) => {
    if (n.marks) {
      const kept = n.marks.filter((m) => !(m.type === 'hubRef' && m.attrs?.linkId === linkId));
      if (kept.length !== n.marks.length) { changed = true; n.marks = kept.length ? kept : undefined; }
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return changed ? JSON.stringify(doc) : null;
}

// The Glossary card (or chip) that is the selection, if it is one: added to a hub as its term, not as text.
export function selectedCardEntry(state: EditorState): string | null {
  const sel = state.selection;
  return sel instanceof NodeSelection && (sel.node.type.name === 'glossaryCard' || sel.node.type.name === 'glossaryChip') ? (sel.node.attrs.entryId as string | null) : null;
}

// Adds the editor's selection to a hub, as a passage with `relation`; a selected Glossary card goes
// in as its term (the link shows what it is, and opens the definition), as the hub's own + Link…
// would add it (fixed 2026-10-13: it used to go in as an empty passage, opening only its note).
// Returns whether it did.
export function addPassageToHub(view: EditorView, source: NoteText, target: HubTarget, relation: HubRelation): boolean {
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (empty) return false;
  if (selectionTouchesHub(state)) { void alertDialog(L.fromInside); return false; }
  const { schema } = state;
  const createdHub = 'newHere' in target;
  const hub = createdHub
    ? { noteId: source.noteId, tabId: source.tabId, hubId: nanoid(10), title: '' }
    : { noteId: target.noteId, tabId: target.tabId, hubId: target.hubId, title: target.title };
  const linkId = nanoid(10);
  const text = state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim();
  // A passage of an encrypted note isn't copied into a note that isn't: the preview says where it is instead.
  const label = isEncrypted(source.noteId) && !isEncrypted(hub.noteId)
    ? L.encryptedPassage
    : text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1)}…` : text;
  const cardEntry = selectedCardEntry(state);
  const link = cardEntry
    ? schema.nodes.hubLink.create({ linkId, relation, kind: 'glossary', entryId: cardEntry, label: glossaryEntry(cardEntry)?.term ?? '' })
    : schema.nodes.hubLink.create({ linkId, relation, kind: 'passage', noteId: source.noteId, tabId: source.tabId, label });
  // A passage is marked where it is; a card isn't text, and the term link finds its definition.
  const mark = cardEntry ? null : schema.marks.hubRef.create({ hubId: hub.hubId, linkId, hubNoteId: hub.noteId, hubTitle: hub.title });

  const putIn = (tr: Transform): boolean => {
    if (createdHub) { tr.insert(endOf(tr.doc, schema.nodes.hub), newHub(state, hub.hubId, [link])); return true; }
    const found = findNode(tr.doc, 'hub', 'hubId', hub.hubId);
    if (!found) return false;
    insertLink(tr, found.pos, link);
    return true;
  };

  if (hub.noteId === source.noteId && hub.tabId === source.tabId) {
    const tr = mark ? state.tr.addMark(from, to, mark) : state.tr;
    if (!putIn(tr)) { void alertDialog(L.failed); return false; }
    view.dispatch(tr);
  } else {
    if (!editNoteText(hub.noteId, hub.tabId, schema, putIn)) { void alertDialog(L.failed); return false; }
    if (mark) view.dispatch(view.state.tr.addMark(from, to, mark));
  }

  const title = hub.title || L.untitled;
  showToast({
    message: L.added(title),
    actions: [
      { label: L.open, onClick: () => openHub(hub.noteId, hub.hubId) },
      { label: L.undo, onClick: () => {
        editNoteText(hub.noteId, hub.tabId, schema, (tr) => {
          const found = createdHub ? findNode(tr.doc, 'hub', 'hubId', hub.hubId) : findNode(tr.doc, 'hubLink', 'linkId', linkId);
          if (!found) return false;
          tr.delete(found.pos, found.pos + found.node.nodeSize);
          return true;
        });
        removeMarks(source.noteId, source.tabId, linkId);
      } },
    ],
  });
  return true;
}

export type LinkChoice = { kind: 'glossary'; entryId: string; label: string } | { kind: 'note'; noteId: string; label: string };

// Links a Glossary term or a note into the hub at `hubPos` (the hub's own + Link…).
export function addLinkToHub(view: EditorView, hubPos: number, choice: LinkChoice, relation: HubRelation): void {
  if (view.state.doc.nodeAt(hubPos)?.type.name !== 'hub') return;
  const link = view.state.schema.nodes.hubLink.create({
    linkId: nanoid(10), relation, kind: choice.kind, label: choice.label,
    noteId: choice.kind === 'note' ? choice.noteId : null,
    entryId: choice.kind === 'glossary' ? choice.entryId : null,
  });
  const tr = view.state.tr;
  insertLink(tr, hubPos, link);
  view.dispatch(tr);
}

// A new relation moves the link to the end of that group.
export function setLinkRelation(view: EditorView, linkPos: number, relation: HubRelation): void {
  const link = view.state.doc.nodeAt(linkPos);
  if (link?.type.name !== 'hubLink' || link.attrs.relation === relation) return;
  const hubPos = view.state.doc.resolve(linkPos).before();
  const tr = view.state.tr.delete(linkPos, linkPos + link.nodeSize);
  insertLink(tr, hubPos, link.type.create({ ...link.attrs, relation }));
  view.dispatch(tr);
}

// Takes a link out of its hub, and its mark off the passage it pointed at.
export function removeLink(view: EditorView, linkPos: number): void {
  const link = view.state.doc.nodeAt(linkPos);
  if (link?.type.name !== 'hubLink') return;
  view.dispatch(view.state.tr.delete(linkPos, linkPos + link.nodeSize));
  if (link.attrs.kind === 'passage' && link.attrs.noteId) removeMarks(link.attrs.noteId as string, (link.attrs.tabId as string | null) ?? null, link.attrs.linkId as string);
}

const noteHas = noteHasPassage;

export function openHub(noteId: string, hubId: string): boolean {
  const find: PassageFind = { node: 'hub', attr: 'hubId', value: hubId };
  if (!noteHas(noteId, find)) { showToast({ message: L.hubGone }); return false; }
  openNotePassage(noteId, find);
  return true;
}

// Follows a link: to the passage, the term's definition, or the note.
export function openHubLink(attrs: { kind: HubLinkKind; noteId: string | null; entryId: string | null; linkId: string }): void {
  if (attrs.kind === 'glossary') {
    const entry = attrs.entryId ? glossaryEntry(attrs.entryId) : null;
    if (!entry) { showToast({ message: L.termGone }); return; }
    openNotePassage(entry.noteId, definitionPassage(entry.id));
    return;
  }
  if (attrs.kind === 'note') {
    if (!attrs.noteId || !useNoteStore.getState().notes[attrs.noteId as NoteId]) { showToast({ message: L.noteGone }); return; }
    const ui = useUIStore.getState();
    if (ui.activeView !== 'notes') ui.setActiveView('notes');
    ui.openNote(attrs.noteId);
    return;
  }
  const find: PassageFind = { mark: 'hubRef', attr: 'linkId', value: attrs.linkId };
  if (!attrs.noteId || !noteHas(attrs.noteId, find)) { showToast({ message: L.passageGone }); return; }
  openNotePassage(attrs.noteId, find);
}

// A passage's marker: to the hub it's in. If the hub (or the link in it) is gone, the marker takes
// itself off this text.
export function openHubFromMarker(view: EditorView, mark: { hubId: string; linkId: string; hubNoteId: string }): void {
  const linked = noteHas(mark.hubNoteId, { node: 'hubLink', attr: 'linkId', value: mark.linkId });
  if (linked) { openHub(mark.hubNoteId, mark.hubId); return; }
  const tr = view.state.tr;
  removeMarksIn(tr, mark.linkId);
  if (tr.docChanged) view.dispatch(tr);
  showToast({ message: L.notInHub });
}
