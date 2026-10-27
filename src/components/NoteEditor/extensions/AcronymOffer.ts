import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { useNoteStore } from '@/store/noteStore';
import { glossaryEntries } from '@/services/glossary';
import { entryView } from '@/services/noteSecrets';
import { acronymPairJustTyped } from '@/utils/acronymInference';
import { LABELS } from '@/config/labels';
import type { CollectionId, NoteId } from '@/types';
import { BUILTIN_TAGS } from '../builtinTags';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import type { NoteObjectContext } from '../objects/types';
import { typingOfferPlugin } from './typingOffer';
import { placeBlock } from './blockDesigns';

// Recording an acronym as you type (2026-10-09; every pattern since 2026-10-13): finishing a pair
// the way acronyms are introduced in writing — "Long form (ABC)", "ABC (long form)", "ABC - long
// form", "ABC stands for long form", "Long form - ABC" — offers a quiet chip, "Record ABC as an
// acronym", with what it stands for. Enter
// or Tab records it (a Glossary record with what it stands for, its card under the paragraph, and
// "ABC" linked to it),
// anything else and the offer goes. The pair is found by utils/acronymInference.ts, so only an
// acronym whose letters really come from the words before it is offered.
//
// Not offered when the acronym is already in the Glossary (linking it is GlossaryAutolink's job),
// when it's already marked, inside code, or again in a note where it was passed over this session.

// `existing`: a record already holding what the acronym stands for (a Definition, Concept or
// Profile with no acronym yet): accepting adds the acronym to it rather than making a second record.
export interface AcronymOfferState { from: number; to: number; id: string; term: string; expansion: string; existing?: { id: string; typeKey: string; term: string } }

// The offer for the text just before the cursor, if there should be one.
export function findAcronymOffer(state: EditorState, passedOver: ReadonlySet<string> = new Set()): AcronymOfferState | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $c = selection.$from;
  const parent = $c.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  if ($c.marks().some((m) => m.type.name === 'code')) return null;
  const before = parent.textBetween(0, $c.parentOffset, undefined, '￼');
  const pair = acronymPairJustTyped(before);
  if (!pair) return null;
  const from = $c.start() + pair.termFrom;
  const to = from + pair.termLength;   // as typed: "RECs" links whole, though recorded as REC
  let marked = false;
  state.doc.nodesBetween(from, to, (n) => { if (n.isText && n.marks.some((m) => m.type.name === 'noteTag' || m.type.name === 'conceptRef')) marked = true; });
  if (marked || passedOver.has(pair.term)) return null;
  const entries = glossaryEntries();
  // Already a name of some record (an Acronym, or another record's acronym): linking it is GlossaryAutolink's job.
  if (entries.some((e) => e.short === pair.term)) return null;
  const long = pair.expansion.trim().toLowerCase();
  const holder = entries.find((e) => !e.locked && e.typeKey !== 'acronym' && !e.short && e.term.trim().toLowerCase() === long);
  return { from, to, id: pair.term, term: pair.term, expansion: pair.expansion, ...(holder ? { existing: { id: holder.id, typeKey: holder.typeKey, term: holder.term } } : {}) };
}

// Accepting: a Glossary record for the acronym, and the Acronym mark on it in the text.
// Accepting: a Glossary record for the acronym, its card (Compact) under the paragraph, and the
// acronym in the sentence linked to it. (It used to mark the acronym as one instead; marking text
// as a Glossary item was retired for the cards, 2026-10-13.) The cursor stays where it was.
function acceptAcronym(state: EditorState, offer: AcronymOfferState, ctx: NoteObjectContext | null) {
  const tag = BUILTIN_TAGS.find((t) => t.typeKey === 'acronym');
  const link = state.schema.marks.conceptRef;
  const card = state.schema.nodes.glossaryCard;
  if (!tag || !link || !ctx) return null;
  // The long form is already a record: the acronym joins it (one record, both names), linked here.
  if (offer.existing) {
    const store = useNoteStore.getState();
    const raw = store.structuredTagEntries[offer.existing.id as never];
    if (!raw) return null;
    store.updateStructuredTagEntry(raw.id, { fields: { ...entryView(raw).fields, acronym: offer.term } });
    return state.tr.addMark(offer.from, offer.to, link.create({ entryId: raw.id, typeKey: offer.existing.typeKey }));
  }
  const entryId = useNoteStore.getState().addStructuredTagEntry({
    typeKey: 'acronym', tagId: tag.id, term: offer.term, fields: { expansion: offer.expansion },
    noteId: ctx.noteId as NoteId, collectionId: ctx.collectionId as CollectionId | null,
  });
  const tr = state.tr.addMark(offer.from, offer.to, link.create({ entryId, typeKey: 'acronym' }));
  if (card) placeBlock(tr, offer.to, card.create({ entryId, variant: 'compact' }));
  return tr;
}

export const AcronymOffer = Extension.create({
  name: 'acronymOffer',
  // Alongside GlossaryAutolink, before the blocks' keys: Enter and Tab are the offer's while it shows.
  priority: 130,

  addProseMirrorPlugins() {
    const ctx = () => objectTriggerStorage(this.editor).getContext();
    return [typingOfferPlugin<AcronymOfferState>({
      name: 'acronymOffer',
      // Looked for when a word ends (a space, a bracket, punctuation), in every pattern detection knows.
      find: (state, typed, _noteId, passedOver) => (/[\p{L}\p{N}]/u.test(typed) ? null : findAcronymOffer(state, passedOver)),
      chip: (o) => (o.existing
        ? { text: LABELS.glossary.acronymOffer(o.term, ''), strong: o.existing.term, title: `${o.term}: ${o.expansion}` }
        : { text: LABELS.glossaryCard.acronymOffer(o.term), strong: o.expansion, title: `${o.term}: ${o.expansion}` }),
      accept: (state, o) => acceptAcronym(state, o, ctx()),
    }, () => ctx()?.noteId ?? null)];
  },
});
