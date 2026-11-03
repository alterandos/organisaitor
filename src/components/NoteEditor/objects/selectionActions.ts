import { createElement, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import type { EditorState } from '@tiptap/pm/state';
import { LABELS } from '@/config/labels';
import { HUB_ICON, INBOX_ICON, NOTE_LINK_ICON } from '@/config/itemIcons';
import { ListIcon, ReviewIcon, ScratchpadIcon, StickyIcon, UnsureIcon } from '@/components/Icons';
import { useUIStore } from '@/store/uiStore';
import { ensureBlockId } from '@/services/noteLinkTargets';
import { glossaryEntries, type GlossaryEntry } from '@/services/glossary';
import { selectionTouchesHub } from '@/services/noteHubs';
import { selectionTouchesInbox } from '@/services/noteInbox';
import { sendSelectedText, type SendTarget } from '@/services/sendSelection';
import { addWordFromSelection } from '@/services/dictionaryActions';
import { cleanWord } from '@/services/dictionary';
import { rankSearch, rankSuggestions } from '@/utils/suggestRank';
import { BUILTIN_TAGS } from '../builtinTags';
import { IMPORTANCE_LEVELS } from '../extensions/importanceLevels';
import { setImportance, toggleReview } from '../extensions/Importance';
import { cardFromSelection } from '../extensions/GlossaryCard';
import { linkConceptRef } from '../extensions/ConceptRef';
import { flagAt, flagRange } from '../extensions/UnsureFlag';
import { quoteFromSelection } from '../extensions/Quote';
import { conclusionFromSelection } from '../extensions/Conclusion';
import { mathsFromSelection } from '../extensions/Maths';
import { objectTriggerStorage } from './NoteObjectTrigger';

// What can be done with selected note text: THE list (CLAUDE.md "Selected text: one list of
// actions", adopted 2026-11-02), read by the `\` selection menu (SelectionMenu.tsx) and the
// right-click menu (selectionContextMenu.ts), so the two always offer the same things. Found
// 2026-11-02: each kept its own list, and "Add to dictionary", the Glossary kinds, Important and
// Review later were never on right-click. A new thing to do with selected text is one entry here.
//
// Groups: mark it (a Glossary card, Important, unsure, Review later), turn it into a block, link it
// (to a note, a hub; Glossary terms are their own list, `termsFor`), send a copy on.

export type SelectionActionGroup = 'mark' | 'turn' | 'link' | 'send';
export const SELECTION_ACTION_GROUPS: readonly SelectionActionGroup[] = ['mark', 'turn', 'link', 'send'];

export interface SelectionAction {
  key:    string;
  group:  SelectionActionGroup;
  icon:   ReactNode;
  label:  string;
  color?: string;
  // A set within a group (the Glossary kinds, the levels of Important…): drawn together.
  set?:   string;
  run:    () => void;
}

export interface SelectionRange { from: number; to: number }

// A Dictionary word is a word or a short phrase.
const DICTIONARY_MAX_WORDS = 3;

function reviewing(state: EditorState, range: SelectionRange): boolean {
  let on = false;
  state.doc.nodesBetween(range.from, range.to, (n) => {
    if (n.isText && n.marks.some((m) => m.type.name === 'noteTag' && m.attrs.typeKey === 'important' && m.attrs.reviewDue)) on = true;
  });
  return on;
}

export function selectionActions(editor: Editor, range: SelectionRange): SelectionAction[] {
  const view = editor.view;
  const state = view.state;
  const storage = objectTriggerStorage(editor);
  const noteId = storage.getContext()?.noteId ?? null;
  const text = (sep: string) => view.state.doc.textBetween(range.from, range.to, sep);
  const send = (target: SendTarget, sep: string) => () => sendSelectedText(target, text(sep), noteId);
  const L = LABELS.selectionMenu;
  const tag = (typeKey: string) => BUILTIN_TAGS.find((t) => t.typeKey === typeKey)!;
  const card = (typeKey: string, label: string): SelectionAction => ({
    // `quote` is Turn into ▸ Quote (the note block); marking as a Quote record has a key of its own.
    key: typeKey === 'quote' ? 'quote-record' : typeKey, group: 'mark', set: 'glossary', icon: tag(typeKey).icon, label, color: tag(typeKey).color,
    run: () => cardFromSelection(view, range.from, range.to, typeKey, storage.getContext()),
  });
  const words = cleanWord(text(' '));
  const editable = editor.isEditable;

  const out: SelectionAction[] = [];
  if (editable) {
    out.push(
      card('definition', L.definition), card('concept', L.concept),
      // An acronym from "RECs (Renewable Energy Certificate)", "ASX: Australian Stock Exchange"…:
      // its fields filled by inferAcronymFromSelection.
      card('acronym', L.acronym), card('profile', L.profile), card('formula', L.formula), card('fact', L.fact), card('quote', L.quote),
      ...IMPORTANCE_LEVELS.map((lv): SelectionAction => ({
        key: `important-${lv.level}`, group: 'mark', set: 'important', icon: lv.icon, label: lv.label, color: lv.color,
        run: () => setImportance(view, range.from, range.to, lv.level),
      })),
    );
    if (!(flagAt(state.doc, range.from) && flagAt(state.doc, range.to))) {
      out.push({ key: 'unsure', group: 'mark', set: 'other', icon: createElement(UnsureIcon), label: LABELS.unsureFlag.flag,
        run: () => { const tr = flagRange(view.state.tr, range.from, range.to); if (tr) view.dispatch(tr); } });
    }
    out.push(
      { key: 'review', group: 'mark', set: 'other', icon: createElement(ReviewIcon), label: reviewing(state, range) ? LABELS.importance.stopReviewing : LABELS.importance.reviewLater,
        run: () => toggleReview(view, range.from, range.to) },
      { key: 'quote', group: 'turn', icon: '❝', label: LABELS.noteBlocks.quote.turnInto, run: () => quoteFromSelection(view, range.from, range.to) },
      { key: 'conclusion', group: 'turn', icon: '∴', label: LABELS.noteBlocks.conclusion.turnInto, run: () => conclusionFromSelection(view, range.from, range.to) },
      { key: 'maths', group: 'turn', icon: '∑', label: LABELS.noteBlocks.maths.turnInto, run: () => mathsFromSelection(view, range.from, range.to) },
      { key: 'link-to-note', group: 'link', icon: NOTE_LINK_ICON, label: LABELS.noteLinks.menu,
        run: () => storage.openNoteLinkPicker?.({ purpose: 'link', from: range.from, to: range.to }) },
    );
    if (!selectionTouchesHub(state)) out.push({ key: 'add-to-hub', group: 'link', icon: HUB_ICON, label: LABELS.hubs.menu, run: () => storage.openAddToHub?.() });
    if (!selectionTouchesInbox(state)) out.push({ key: 'send-to-inbox', group: 'send', set: 'move', icon: INBOX_ICON, label: LABELS.sendToInbox.menu, run: () => storage.openSendToInbox?.() });
  }
  out.push(
    { key: 'scratchpad', group: 'send', set: 'copy', icon: createElement(ScratchpadIcon), label: LABELS.sendSelection.toScratchpad, run: send('scratchpad', '\n') },
    { key: 'sticky', group: 'send', set: 'copy', icon: createElement(StickyIcon), label: LABELS.sendSelection.toSticky, run: send('sticky', '\n') },
    { key: 'reading-list', group: 'send', set: 'lists', icon: '📚', label: LABELS.sendSelection.toReadingList, run: send('readingList', ' ') },
    { key: 'facts', group: 'send', set: 'lists', icon: '✨', label: LABELS.sendSelection.toFacts, run: send('facts', ' ') },
    { key: 'quotes', group: 'send', set: 'lists', icon: '❞', label: LABELS.keptQuotes.add, run: send('quotes', ' ') },
  );
  out.push({ key: 'to-list', group: 'send', set: 'lists', icon: createElement(ListIcon), label: LABELS.sendToList.menu, run: () => {
    // The passage it came from, for each item's link back (a lasting block id, given now).
    const ctx = storage.getContext();
    const blockId = ctx ? ensureBlockId(ctx.noteId, ctx.tabId ?? null, range.from, view.state.schema) : null;
    useUIStore.getState().requestSendToList({ text: text('\n'), noteId: ctx?.noteId ?? null, tabId: ctx?.tabId ?? null, blockId });
  } });
  if (words && words.split(' ').length <= DICTIONARY_MAX_WORDS) {
    out.push({ key: 'dictionary', group: 'send', set: 'lists', icon: '📕', label: LABELS.dictionary.add, run: () => { void addWordFromSelection(words); } });
  }
  return out;
}

const termFields = (e: GlossaryEntry) => [
  { text: e.term, weight: 3 },
  { text: e.meaning, weight: 1, counted: true },
  { text: e.noteTitle, weight: 1 },
];

// Glossary terms to link the selection to: suggested from the selected words (the "link a …"
// picker pattern, utils/suggestRank.ts), then the rest by when last changed; or, with a query,
// those matching it. `suggested` is how many lead the list as suggestions.
export function termsFor(selected: string, query = ''): { terms: GlossaryEntry[]; suggested: number; any: boolean } {
  const entries = glossaryEntries().filter((e) => !e.locked && e.term);
  const recency = (e: GlossaryEntry) => Date.parse(e.updatedAt) || 0;
  if (query.trim()) return { terms: rankSearch(entries, termFields, recency, query), suggested: 0, any: entries.length > 0 };
  const r = rankSuggestions(entries, termFields, recency, selected);
  return { terms: r.items, suggested: r.suggested, any: entries.length > 0 };
}

export function linkToTerm(editor: Editor, range: SelectionRange, entry: GlossaryEntry): void {
  linkConceptRef(editor.view, range.from, range.to, { id: entry.id, typeKey: entry.typeKey });
}
