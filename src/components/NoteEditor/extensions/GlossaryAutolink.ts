import { useSettingsStore } from '@/store/settingsStore';
import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useNoteStore } from '@/store/noteStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { glossaryEntries } from '@/services/glossary';
import { LABELS } from '@/config/labels';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { getSession } from '../objects/session';
import { forgetPassedOffers, typingOfferPlugin } from './typingOffer';

// Linking to the Glossary as you type (2026-10-07): when the word just typed is a term defined
// somewhere in Notes (a Definition, Concept or Acronym — services/glossary.ts), a quiet chip
// offers to link it: Enter or Tab links it (a conceptRef mark, drawn by ConceptRef.ts), anything
// else — keep typing — and the offer goes. Backspace straight after linking (or Ctrl+Z) takes the
// link off again.
//
// Offered once per note per term (the convention of linking a term's first mention, not every
// one): not again in a note that already links it, and not again in a note where the offer was
// passed over this session. Never inside code, inside a link already, or in the term's own
// definition.

export interface Term { entryId: string; typeKey: string; term: string; lower: string; icon: string; meaning: string }
export interface AutolinkSuggestion { from: number; to: number; id: string; term: Term }

const MIN_TERM = 3;
const WORD = /[\p{L}\p{N}]/u;

// Passed-over offers are kept by typingOffer.ts (per note, this session).
export const forgetPassedOver = forgetPassedOffers;

// The terms, longest first (so "opportunity cost" wins over "cost"), cached until the entries or
// the decrypted cache change.
let cache: { entries: unknown; version: number; terms: Term[] } | null = null;
export function glossaryTerms(): Term[] { return terms(); }
function terms(): Term[] {
  const entries = useNoteStore.getState().structuredTagEntries;
  const version = useSecretsVersion.getState().version;
  if (cache && cache.entries === entries && cache.version === version) return cache.terms;
  const list = glossaryEntries()
    .filter((e) => !e.locked && e.term.trim().length >= MIN_TERM)
    .map((e) => ({ entryId: e.id, typeKey: e.typeKey, term: e.term.trim(), lower: e.term.trim().toLowerCase(), icon: e.icon, meaning: e.meaning }))
    .sort((a, b) => b.lower.length - a.lower.length);
  cache = { entries, version, terms: list };
  return list;
}

const linksTo = (doc: PMNode, entryId: string) => {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.isText && node.marks.some((m) => m.type.name === 'conceptRef' && m.attrs.entryId === entryId)) found = true;
    return !found;
  });
  return found;
};

// The term the cursor is at the end of, if it should be offered. Plurals ("eukaryotes") count.
// `always`: offered even where the note already links the term (the Linking suggestions setting).
// The terms the text just typed ends with, as a whole word (plurals count), longest first: the
// reading shared by the note editor and the fields of a Glossary card (GlossaryCardBody).
export function termsEndingAt(before: string, all: Term[] = terms()): { term: Term; length: number }[] {
  const lower = before.toLowerCase();
  const out: { term: Term; length: number }[] = [];
  for (const term of all) {
    for (const suffix of ['', 's', 'es']) {
      const word = term.lower + suffix;
      if (!lower.endsWith(word)) continue;
      const start = lower.length - word.length;
      if (start > 0 && WORD.test(before[start - 1])) continue;
      out.push({ term, length: word.length });
      break;
    }
  }
  return out;
}

export function findSuggestion(state: EditorState, skip: ReadonlySet<string> = new Set(), all: Term[] = terms(), always = false): AutolinkSuggestion | null {
  const { selection } = state;
  if (!selection.empty || getSession(state)) return null;
  const $c = selection.$from;
  const parent = $c.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  if ($c.marks().some((m) => ['conceptRef', 'code', 'artifactLink', 'link'].includes(m.type.name))) return null;
  const offset = $c.parentOffset;
  const next = parent.textBetween(offset, Math.min(parent.content.size, offset + 1), undefined, '￼');
  if (next && WORD.test(next)) return null;
  const before = parent.textBetween(Math.max(0, offset - 80), offset, undefined, '￼');
  for (const { term, length } of termsEndingAt(before, all)) {
    const from = $c.pos - length;
    const to = $c.pos;
    let own = false;
    state.doc.nodesBetween(from, to, (n) => {
      if (n.isText && n.marks.some((m) => m.type.name === 'noteTag' && m.attrs.structuredEntryId === term.entryId)) own = true;
    });
    if (own || skip.has(term.entryId) || (!always && linksTo(state.doc, term.entryId))) continue;
    return { from, to, id: term.entryId, term };
  }
  return null;
}

const NO_SKIP: ReadonlySet<string> = new Set();

export const GlossaryAutolink = Extension.create({
  name: 'glossaryAutolink',
  // Before the blocks' keys and the editor's own: Enter and Tab are the offer's while it shows.
  priority: 130,

  addProseMirrorPlugins() {
    const noteId = () => objectTriggerStorage(this.editor).getContext()?.noteId ?? null;
    return [typingOfferPlugin<AutolinkSuggestion>({
      name: 'glossaryAutolink',
      // The setting: never; once per note per term (passed over or linked: not again); every time.
      find: (state, _typed, _noteId, passedOver) => {
        const mode = useSettingsStore.getState().linkSuggestions;
        if (mode === 'never') return null;
        return mode === 'always' ? findSuggestion(state, NO_SKIP, terms(), true) : findSuggestion(state, passedOver);
      },
      chip: (s) => ({ text: LABELS.glossary.autolinkOffer, strong: `${s.term.icon} ${s.term.term}`, title: s.term.meaning ? `${s.term.term}: ${s.term.meaning}` : s.term.term }),
      accept: (state, s) => {
        const type = state.schema.marks.conceptRef;
        return type ? state.tr.addMark(s.from, s.to, type.create({ entryId: s.term.entryId, typeKey: s.term.typeKey })) : null;
      },
      undo: (state, s) => state.tr.removeMark(s.from, s.to, state.schema.marks.conceptRef),
    }, noteId)];
  },
});
