import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked, isNoteLocked, noteView } from '@/services/noteSecrets';
import { noteDocFor } from '@/services/noteLinkTargets';
import { editNoteText } from '@/services/noteContentEdit';
import { openGlossaryEntry, openNotePassage } from '@/services/notePassage';
import { getStructuredTagType } from '@/config/structuredTagTypes';
import { NOTE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';
import { CLARIFY_MARK, LEARNED, collectClarify, collectLearned, rewriteMarkById } from '@/components/NoteEditor/extensions/ClarifyMark';
import { collectFlags } from '@/components/NoteEditor/extensions/UnsureFlag';
import { BLOCK_FLAGS, anyNodeFlag, anyRecordFlag, doneFlag, flagAttrs, setRecordFlag, type BlockFlag, type BlockFlagKind } from '@/components/NoteEditor/extensions/BlockFlags';
import type { PassageFind } from '@/utils/noteContent';
import { getNoteEffectiveCollectionId } from '@/utils/notes';
import type { NoteId } from '@/types';

// The Clarify tool's lists (NotesSection/ClarifyView.tsx, 2026-11-05): everything marked "Clarify
// later" (To learn) and everything flagged as unsure (To check), across every note that can be read
// now: passages of text (ClarifyMark.ts, UnsureFlag.ts), whole blocks and Glossary cards
// (BlockFlags.ts). Read live (the open editor's text where a note is open); a change made from here
// goes through services/noteContentEdit.ts, or the record's store action for a card.
//
// Learned it keeps the mark or flag with the date (ClarifyMark.ts, BlockFlags.ts), listed under
// Learned, so what was clarified and when is there for study later; Learn again puts it back.

export type ClarifyList = 'learn' | 'check' | 'learned';
const FLAG_OF: Record<ClarifyList, BlockFlagKind> = { learn: 'clarify', check: 'unsure', learned: 'clarify' };

export interface ClarifyItem {
  list:      ClarifyList;
  key:       string;
  where:     'text' | 'block' | 'card';
  text:      string;            // the passage, the block's text, or the card's term
  context:   string | null;     // the paragraph a passage is in, when it's more than the passage
  note:      string | null;     // what to look into / why unsure
  learnedAt: string | null;     // when Learned it was chosen (the Learned list)
  noteId:    string | null;     // null: a card made in the Glossary
  tabId:     string | null;
  kindLabel: string | null;     // a card's kind (Definition…)
  collectionId: string | null;  // its Endeavour: the note's (its own, else its notebook's), a card's own else its note's
  find:      PassageFind | null;
  entryId:   string | null;
}

const short = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function fromDoc(doc: PMNode, noteId: string, tabId: string | null, collectionId: string | null, out: ClarifyItem[]): void {
  const contextOf = (from: number) => { const $p = doc.resolve(from); return $p.parent.textContent; };
  const base = { noteId, tabId, kindLabel: null, entryId: null, collectionId };
  const passage = (from: number, to: number) => {
    const text = doc.textBetween(from, to, ' ');
    const context = contextOf(from);
    return { text, context: context !== text ? short(context, 400) : null };
  };
  for (const r of [...collectClarify(doc), ...collectLearned(doc)]) {
    out.push({ ...base, list: r.learnedAt ? 'learned' : 'learn', key: `t-${r.clarifyId}`, where: 'text', ...passage(r.from, r.to), note: r.note, learnedAt: r.learnedAt,
      find: { mark: CLARIFY_MARK, attr: 'clarifyId', value: r.clarifyId } });
  }
  for (const f of collectFlags(doc)) {
    out.push({ ...base, list: 'check', key: `t-${f.flagId}`, where: 'text', ...passage(f.from, f.to), note: f.reason, learnedAt: null,
      find: { mark: 'unsureFlag', attr: 'flagId', value: f.flagId } });
  }
  doc.descendants((node) => {
    if (!NOTE_BLOCK_NODES.has(node.type.name)) return !node.isTextblock;
    for (const kind of ['clarify', 'unsure'] as BlockFlagKind[]) {
      const flag = anyNodeFlag(node.attrs, kind);
      if (!flag) continue;
      const list: ClarifyList = kind === 'unsure' ? 'check' : flag.learnedAt ? 'learned' : 'learn';
      out.push({ ...base, list, key: `b-${flag.id}`, where: 'block', text: short(node.textContent.trim()), context: null, note: flag.note, learnedAt: flag.learnedAt ?? null,
        find: { node: node.type.name, attr: BLOCK_FLAGS[kind].attr, value: flag.id } });
    }
    return true;
  });
}

// Everything on both lists, and how many notes couldn't be read (locked).
export function clarifyItems(schema: Schema): { items: ClarifyItem[]; locked: number } {
  const { notes, noteTags, structuredTagEntries } = useNoteStore.getState();
  const items: ClarifyItem[] = [];
  let locked = 0;
  for (const raw of Object.values(notes)) {
    if (raw.archivedAt) continue;
    if (isNoteLocked(raw)) { locked++; continue; }
    const note = noteView(raw);
    const collectionId = getNoteEffectiveCollectionId(note, noteTags);
    for (const [tabId, json] of [[null, note.content], ...note.tabs.map((t) => [t.id, t.content])] as [string | null, string][]) {
      if (!/"(clarify|unsureFlag|unsure)"/.test(json ?? '')) continue;
      const doc = noteDocFor(note.id, tabId, schema);
      if (doc) fromDoc(doc, note.id, tabId, collectionId, items);
    }
  }
  for (const raw of Object.values(structuredTagEntries)) {
    if (isEntryLocked(raw)) continue;
    const e = entryView(raw);
    for (const kind of ['clarify', 'unsure'] as BlockFlagKind[]) {
      const flag = anyRecordFlag(e.fields, kind);
      if (!flag) continue;
      const list: ClarifyList = kind === 'unsure' ? 'check' : flag.learnedAt ? 'learned' : 'learn';
      items.push({ list, key: `c-${flag.id}`, where: 'card', text: e.term, context: null, note: flag.note, learnedAt: flag.learnedAt ?? null, noteId: e.noteId ?? null,
        tabId: null, kindLabel: getStructuredTagType(e.typeKey)?.label ?? null, find: null, entryId: e.id,
        collectionId: e.collectionId ?? (e.noteId && notes[e.noteId as NoteId] ? getNoteEffectiveCollectionId(notes[e.noteId as NoteId], noteTags) : null) });
    }
  }
  return { items, locked };
}

export function openClarifyItem(item: ClarifyItem): void {
  if (item.entryId) { openGlossaryEntry(item.entryId); return; }
  if (item.noteId && item.find) openNotePassage(item.noteId as NoteId, item.find);
}

// Learned it (kept as learned, with the date) / Resolved (the flag comes off) / Learn again (back
// on To learn). The words and the block always stay.
export function clearClarifyItem(item: ClarifyItem, schema: Schema): void {
  const kind = FLAG_OF[item.list];
  const next = (flag: BlockFlag): BlockFlag | null => (item.list === 'learned' ? { ...flag, learnedAt: null } : doneFlag(kind, flag));
  if (item.entryId) {
    const raw = useNoteStore.getState().structuredTagEntries[item.entryId as never];
    const flag = raw && !isEntryLocked(raw) ? anyRecordFlag(entryView(raw).fields, kind) : null;
    if (flag) setRecordFlag(item.entryId, kind, next(flag));
    return;
  }
  if (!item.noteId || !item.find) return;
  const find = item.find;
  editNoteText(item.noteId, item.tabId, schema, (tr) => {
    if ('mark' in find) {
      const attrs = item.list === 'check' ? null : item.list === 'learned' ? { learnedAt: null } : LEARNED();
      return rewriteMarkById(tr, find.mark, find.attr, find.value, attrs);
    }
    const { attr } = BLOCK_FLAGS[kind];
    let at = -1;
    tr.doc.descendants((node, pos) => {
      if (at >= 0) return false;
      if (node.type.name === find.node && node.attrs[attr] === find.value) { at = pos; return false; }
      return true;
    });
    if (at < 0) return false;
    const node = tr.doc.nodeAt(at)!;
    const flag = anyNodeFlag(node.attrs, kind);
    tr.setNodeMarkup(at, undefined, { ...node.attrs, ...flagAttrs(kind, flag ? next(flag) : null) });
    return true;
  });
}
