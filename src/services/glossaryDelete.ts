import type { Schema } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';
import { useNoteStore } from '@/store/noteStore';
import { noteView } from '@/services/noteSecrets';
import { glossaryEntry } from '@/services/glossary';
import { editNoteText } from '@/services/noteContentEdit';
import { liveNoteFor } from '@/services/liveNoteEditor';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';
import type { NoteId, StructuredTagEntryId } from '@/types';

// Deleting a Glossary record (a Definition, Concept or Acronym), agreed with the user 2026-10-13:
// it takes every link to it with it. Wherever text was linked to it (a conceptRef mark, or an old
// marked definition), the text stays and the link goes, in every note: the open one through its
// editor, the others in their stored content (editNoteText). Asked first, saying how many links
// go; the record itself goes to the Recycling Bin.

// Every place a note's text links to `entryId`, counted per note (each tab counted). The open
// note's open tab is counted from its live text (its latest typing may not be saved yet).
export function linksToEntry(entryId: string): { noteId: string; count: number }[] {
  const out: { noteId: string; count: number }[] = [];
  const linked = new RegExp(`"type":"(?:conceptRef|noteTag)","attrs":{[^}]*"(?:entryId|structuredEntryId)":"${entryId}"`, 'g');
  for (const raw of Object.values(useNoteStore.getState().notes)) {
    const n = noteView(raw);
    let count = 0;
    const live = liveNoteFor(n.id);
    for (const tab of [null, ...n.tabs.map((t) => t.id)]) {
      if (live && live.tabId === tab) {
        live.view.state.doc.descendants((node) => {
          if (node.isText && node.marks.some((m) => (m.type.name === 'conceptRef' && m.attrs.entryId === entryId) || (m.type.name === 'noteTag' && m.attrs.structuredEntryId === entryId))) count++;
        });
        continue;
      }
      const c = tab ? n.tabs.find((t) => t.id === tab)?.content : n.content;
      count += c ? (c.match(linked) ?? []).length : 0;
    }
    if (count) out.push({ noteId: n.id, count });
  }
  return out;
}

// Removes the links to `entryId` from one document (the marks only; the text stays).
export function removeLinksTo(tr: Transform, entryId: string): boolean {
  let changed = false;
  tr.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const m of node.marks) {
      const isLink = (m.type.name === 'conceptRef' && m.attrs.entryId === entryId)
        || (m.type.name === 'noteTag' && m.attrs.structuredEntryId === entryId);
      if (isLink) { tr.removeMark(pos, pos + node.nodeSize, m); changed = true; }
    }
    return false;
  });
  return changed;
}

// Asks, then deletes the record and every link to it. `schema` is the note editor's (any note's
// content is read and written with it). Returns whether it was deleted.
export async function deleteGlossaryEntryAsked(entryId: string, schema: Schema): Promise<boolean> {
  if (!(await confirmGlossaryDelete(entryId))) return false;
  deleteGlossaryEntryNow(entryId, schema);
  return true;
}

// The question alone: "Delete the definition "osmosis"? N places link to it…". True to go ahead
// (and when the record is already gone).
export async function confirmGlossaryDelete(entryId: string): Promise<boolean> {
  const entry = glossaryEntry(entryId);
  if (!entry) return true;
  const links = linksToEntry(entryId).reduce((n, l) => n + l.count, 0);
  // Nothing written in it and nothing linking to it: it goes without asking.
  const raw = useNoteStore.getState().structuredTagEntries[entryId as never] as { isEncrypted?: boolean; fields?: Record<string, unknown> } | undefined;
  const filled = Object.values(raw?.fields ?? {}).some((v) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v != null));
  const empty = !entry.locked && !raw?.isEncrypted && !entry.term.trim() && !links && !filled;
  return confirmDelete(entry.kindLabel.toLowerCase(), entry.term || '…', links ? LABELS.glossaryCard.deleteDetail(links) : undefined, { empty });
}

export function deleteGlossaryEntryNow(entryId: string, schema: Schema): void {
  for (const raw of Object.values(useNoteStore.getState().notes)) {
    const n = noteView(raw);
    for (const tabId of [null, ...n.tabs.map((t) => t.id)]) {
      const content = tabId ? n.tabs.find((t) => t.id === tabId)?.content : n.content;
      const open = liveNoteFor(n.id);
      const isOpen = !!open && open.tabId === tabId;
      if (!isOpen && !content?.includes(entryId)) continue;
      editNoteText(n.id as NoteId, tabId, schema, (tr) => removeLinksTo(tr, entryId));
    }
  }
  useNoteStore.getState().deleteStructuredTagEntry(entryId as StructuredTagEntryId);
}
