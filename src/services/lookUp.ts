import { getSchema } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { useNoteStore } from '@/store/noteStore';
import { liveNote } from '@/services/liveNoteEditor';
import { ensureBlockId, noteDocFor, openNoteLink } from '@/services/noteLinkTargets';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { glossaryEntries } from '@/services/glossary';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import { applyNoteLink } from '@/components/NoteEditor/extensions/NoteLink';
import { insertEmbedAt } from '@/components/NoteEditor/extensions/NoteEmbed';
import { insertCardAfter } from '@/components/NoteEditor/extensions/GlossaryCard';
import { linkConceptRef } from '@/components/NoteEditor/extensions/ConceptRef';
import { showToast } from '@/components/Toast/showToast';
import { collectPassages, passageNodes, type Passage } from '@/utils/notePassages';
import { getNoteNotebookPath } from '@/utils/notes';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types/notes';

// Look up (2026-11-01): find a passage, picture or Glossary term in the notes, read it, then embed
// it, link it, copy it or open it; or just close. The finding is utils/notePassages.ts; this is
// reading the notes and acting on what was found. "Here" is the note in front when Look up opened
// (liveNote).

let built: Schema | null = null;
export function noteSchema(): Schema {
  const front = liveNote();
  if (front) return front.view.state.schema;
  built ??= getSchema(noteEditorExtensions({ noteEncrypted: () => null, linkClass: '' }));
  return built;
}

// Every passage of every note that can be read now (locked and archived notes left out), and every
// Glossary term that can (services/glossary.ts: only those still defined somewhere; locked ones out).
export function allPassages(schema: Schema): Passage[] {
  const { notes, noteTags } = useNoteStore.getState();
  const out: Passage[] = [];
  for (const raw of Object.values(notes)) {
    if (raw.archivedAt || isNoteLocked(raw)) continue;
    const note = noteView(raw);
    const noteTitle = note.title.trim() || LABELS.mobileNotes.untitled;
    const notebooks = getNoteNotebookPath(note, noteTags);
    const tabs = [{ id: null, name: note.mainTabName || LABELS.lookUp.mainTab }, ...note.tabs.map((t) => ({ id: t.id, name: t.name }))];
    for (const tab of tabs) {
      const doc = noteDocFor(note.id, tab.id, schema);
      if (doc) out.push(...collectPassages(doc, { noteId: note.id, tabId: tab.id, noteTitle, notebooks, tabName: tabs.length > 1 ? tab.name : null }));
    }
  }
  for (const e of glossaryEntries()) {
    if (e.locked || !e.term.trim()) continue;
    out.push({
      noteId: e.noteId, tabId: null, pos: 0, kind: 'term', text: e.term, pictureId: null,
      noteTitle: e.noteTitle || LABELS.mobileNotes.untitled, notebooks: e.notebookPath, tabName: null,
      term: { entryId: e.id, typeKey: e.typeKey, icon: e.icon, names: [e.short, e.long].filter((n): n is string => !!n && n !== e.term), meaning: e.meaning },
    });
  }
  return out;
}

const docOf = (p: Passage, schema: Schema) => noteDocFor(p.noteId, p.tabId, schema);

export function passageText(p: Passage, schema: Schema): string {
  if (p.term) return p.term.meaning ? `${p.text}: ${p.term.meaning}` : p.text;
  const doc = docOf(p, schema);
  return doc ? passageNodes(doc, p.pos).map((n) => n.textContent).join('\n') : p.text;
}

// Where "here" is: the note in front, if it can be written in and isn't the passage itself.
export type Here = NonNullable<ReturnType<typeof liveNote>>;
export const hereFor = (): Here | null => {
  const front = liveNote();
  return front && front.view.editable ? front : null;
};

const blockIdOf = (p: Passage, schema: Schema) => (p.kind === 'picture' ? null : ensureBlockId(p.noteId, p.tabId, p.pos, schema));
const isEncrypted = (noteId: string) => !!useNoteStore.getState().notes[noteId as NoteId]?.isEncrypted;

// A picture can be put in a note as the same picture (the library holds it once); an encrypted
// note's picture isn't put in a note that isn't encrypted.
export const canInsertPicture = (p: Passage, here: Here) => !isEncrypted(p.noteId) || isEncrypted(here.noteId);

// A term: its card (holding only the record's id, as every card does). A picture: the same
// picture. A passage: an embed of it.
export function embedHere(p: Passage, here: Here): void {
  const { view } = here;
  const schema = view.state.schema;
  if (p.term) {
    const tr = insertCardAfter(view.state, view.state.selection.to, p.term.entryId);
    if (tr) view.dispatch(tr);
  } else if (p.kind === 'picture') {
    const image = schema.nodes.image?.create({ pictureId: p.pictureId, src: null });
    if (image) view.dispatch(view.state.tr.replaceSelectionWith(image).scrollIntoView());
  } else {
    const tr = insertEmbedAt(view.state, view.state.selection.to, { noteId: p.noteId, tabId: p.tabId, blockId: blockIdOf(p, schema) });
    if (tr) view.dispatch(tr);
  }
  view.focus();
}

// A term: the selected words linked to it as Glossary-linked text (with none selected, its name goes
// in, linked). A passage: a link to it.
export function linkHere(p: Passage, here: Here): void {
  const { view } = here;
  const { from, to } = view.state.selection;
  if (p.term) {
    const entry = { id: p.term.entryId, typeKey: p.term.typeKey };
    if (from === to) view.dispatch(view.state.tr.insertText(p.text, from));
    const end = from === to ? from + p.text.length : to;
    linkConceptRef(view, from, end, entry);
    if (from === to) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)).removeStoredMark(view.state.schema.marks.conceptRef));
    view.focus();
    return;
  }
  applyNoteLink(view, from, to, { noteId: p.noteId, tabId: p.tabId, blockId: blockIdOf(p, view.state.schema), name: p.kind === 'heading' ? p.text : p.noteTitle });
}

export async function copyPassage(p: Passage, schema: Schema): Promise<void> {
  await navigator.clipboard.writeText(passageText(p, schema));
  showToast({ message: LABELS.lookUp.copied });
}

export function openPassage(p: Passage, schema: Schema): void {
  if (p.term) { openNotePassage(p.noteId, definitionPassage(p.term.entryId)); return; }
  openNoteLink(p.noteId, p.tabId, blockIdOf(p, schema));
}

// The tab a passage is on, as the note editor's content (the open editor's latest, else stored); a
// term: a document holding just its card.
export function passageDoc(p: Passage, schema: Schema): PMNode | null {
  if (p.term) {
    try {
      return schema.nodeFromJSON({ type: 'doc', content: [{ type: 'section', content: [{ type: 'glossaryCard', attrs: { entryId: p.term.entryId } }] }] });
    } catch { return null; }   // a schema without cards: nothing to show
  }
  return docOf(p, schema);
}
