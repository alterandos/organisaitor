import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { useNoteStore } from '@/store/noteStore';
import { glossaryEntries } from '@/services/glossary';
import { acronymPairAtEnd } from '@/utils/acronymInference';
import { LABELS } from '@/config/labels';
import type { CollectionId, NoteId } from '@/types';
import { BUILTIN_TAGS } from '../builtinTags';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import type { NoteObjectContext } from '../objects/types';
import { typingOfferPlugin } from './typingOffer';

// Recording an acronym as you type (2026-10-09): closing a bracket after "Long form (ABC)" — the
// way acronyms are introduced in writing — offers a quiet chip, "Record ABC as an acronym". Enter
// or Tab records it (a Glossary record with what it stands for, and the Acronym mark on "ABC"),
// anything else and the offer goes. The pair is found by utils/acronymInference.ts, so only an
// acronym whose letters really come from the words before it is offered.
//
// Not offered when the acronym is already in the Glossary (linking it is GlossaryAutolink's job),
// when it's already marked, inside code, or again in a note where it was passed over this session.

export interface AcronymOfferState { from: number; to: number; id: string; term: string; expansion: string }

// The offer for the text just before the cursor, if there should be one.
export function findAcronymOffer(state: EditorState, passedOver: ReadonlySet<string> = new Set()): AcronymOfferState | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $c = selection.$from;
  const parent = $c.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  if ($c.marks().some((m) => m.type.name === 'code')) return null;
  const before = parent.textBetween(0, $c.parentOffset, undefined, '￼');
  const pair = acronymPairAtEnd(before);
  if (!pair) return null;
  const from = $c.start() + pair.termFrom;
  const to = from + pair.term.length;
  let marked = false;
  state.doc.nodesBetween(from, to, (n) => { if (n.isText && n.marks.some((m) => m.type.name === 'noteTag')) marked = true; });
  if (marked || passedOver.has(pair.term)) return null;
  if (glossaryEntries().some((e) => e.typeKey === 'acronym' && e.term === pair.term)) return null;
  return { from, to, id: pair.term, term: pair.term, expansion: pair.expansion };
}

// Accepting: a Glossary record for the acronym, and the Acronym mark on it in the text.
function acceptAcronym(state: EditorState, offer: AcronymOfferState, ctx: NoteObjectContext | null) {
  const tag = BUILTIN_TAGS.find((t) => t.typeKey === 'acronym');
  const markType = state.schema.marks.noteTag;
  if (!tag || !markType || !ctx) return null;
  const entryId = useNoteStore.getState().addStructuredTagEntry({
    typeKey: 'acronym', tagId: tag.id, term: offer.term, fields: { expansion: offer.expansion },
    noteId: ctx.noteId as NoteId, collectionId: ctx.collectionId as CollectionId | null,
  });
  return state.tr.addMark(offer.from, offer.to, markType.create({
    tagId: tag.id, color: tag.color, typeKey: tag.typeKey, structuredEntryId: entryId,
  }));
}

export const AcronymOffer = Extension.create({
  name: 'acronymOffer',
  // Alongside GlossaryAutolink, before the blocks' keys: Enter and Tab are the offer's while it shows.
  priority: 130,

  addProseMirrorPlugins() {
    const ctx = () => objectTriggerStorage(this.editor).getContext();
    return [typingOfferPlugin<AcronymOfferState>({
      name: 'acronymOffer',
      find: (state, typed, _noteId, passedOver) => (typed === ')' ? findAcronymOffer(state, passedOver) : null),
      chip: (o) => ({ text: LABELS.glossaryCard.acronymOffer(o.term), title: `${o.term}: ${o.expansion}` }),
      accept: (state, o) => acceptAcronym(state, o, ctx()),
    }, () => ctx()?.noteId ?? null)];
  },
});
