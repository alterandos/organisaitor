import { createElement, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { LABELS } from '@/config/labels';
import { HUB_ICON, INBOX_ICON, NOTE_LINK_ICON, QUESTION_ICON } from '@/config/itemIcons';
import { LinkIcon, ListIcon, ScratchpadIcon, StickyIcon } from '@/components/Icons';
import { builtInListTypeIcon } from '@/store/listStore';
import { quoteBlock } from './quoteBlock';
import { conclusionBlock } from './conclusionBlock';
import { mathsBlock } from './mathsBlock';
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
import { cardFromSelection } from '../extensions/GlossaryCard';
import { linkConceptRef } from '../extensions/ConceptRef';
import { quoteFromSelection } from '../extensions/Quote';
import { conclusionFromSelection } from '../extensions/Conclusion';
import { mathsFromSelection } from '../extensions/Maths';
import { questionFromSelection } from '../extensions/Question';
import { objectTriggerStorage } from './NoteObjectTrigger';
import { markChoices } from '../textMarks';
import { useNoteStore } from '@/store/noteStore';

// What can be done with selected note text: THE list (CLAUDE.md "Selected text: one list of
// actions", adopted 2026-11-02), read by the `\` selection menu (SelectionMenu.tsx) and the
// right-click menu (contextMenu.ts), so the two always offer the same things, in the same groups,
// order, names and icons (2026-11-10: the right-click menu had built its families by hand, with
// labels and items of its own: Web link, Create from selection and the Glossary terms). Found
// 2026-11-02: each kept its own list, and "Add to dictionary", the Glossary kinds, Important and
// Review later were never on right-click. A new thing to do with selected text is one entry here.
//
// Groups, by what happens to the text (agreed with the user 2026-11-05): turn it into a block (a
// Glossary card, a quote…), mark it (the marks: textMarks.ts, the list Ctrl+Space reads too), link it
// (to a note, a hub; Glossary terms are their own list, `termsFor`), send it on.

export { SELECTION_ACTION_GROUPS, SELECTION_SUBMENU_SETS, selectionGroup, selectionGroups, type SelectionActionGroup, type SelectionGroupDef } from './selectionGroups';
import { SELECTION_ACTION_GROUPS, type SelectionActionGroup } from './selectionGroups';

const MAX_TERMS = 7;

export interface SelectionAction {
  key:    string;
  group:  SelectionActionGroup;
  icon:   ReactNode;
  label:  string;
  detail?: string;
  color?: string;
  // A set within a group (the Glossary kinds, the levels of Important…): drawn together.
  set?:   string;
  // The `\` menu's heading over it, when it's not the group's (the Glossary terms: Suggested…).
  heading?: string;
  shortcut?: string;
  run:    () => void;
}

export interface SelectionRange { from: number; to: number }

// A Dictionary word is a word or a short phrase.
const DICTIONARY_MAX_WORDS = 3;

// Everything for this selection, in group order; with a query (typed in the `\` menu), only what
// matches it, the Glossary terms ranked by it.
export function selectionActions(editor: Editor, range: SelectionRange, query = ''): SelectionAction[] {
  const q = query.trim().toLowerCase();
  const matches = (a: SelectionAction) => !q || a.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || a.label.toLowerCase().includes(q);
  const all = baseActions(editor, range).filter(matches);
  if (editor.isEditable) all.push(...termActions(editor, range, query));
  return all;
}

function baseActions(editor: Editor, range: SelectionRange): SelectionAction[] {
  const view = editor.view;
  const state = view.state;
  const storage = objectTriggerStorage(editor);
  const noteId = storage.getContext()?.noteId ?? null;
  const text = (sep: string) => view.state.doc.textBetween(range.from, range.to, sep);
  const send = (target: SendTarget, sep: string) => () => sendSelectedText(target, text(sep), noteId);
  const L = LABELS.selectionMenu;
  const tag = (typeKey: string) => BUILTIN_TAGS.find((t) => t.typeKey === typeKey)!;
  const card = (typeKey: string, label: string): SelectionAction => ({
    key: typeKey, group: 'turn', set: 'glossary', icon: tag(typeKey).icon, label, color: tag(typeKey).color,
    run: () => cardFromSelection(view, range.from, range.to, typeKey, storage.getContext()),
  });
  const words = cleanWord(text(' '));
  const editable = editor.isEditable;

  const out: SelectionAction[] = [];
  if (editable) {
    // A term already in the Glossary that the selected words name: "Link to “…”" right under the
    // card of its kind, so it's linked rather than made again (asked for by the user 2026-11-05).
    const existing = termsNamedIn(text(' '));
    const withLinks = (c: SelectionAction, typeKey: string): SelectionAction[] => [c, ...existing.filter((e) => e.typeKey === typeKey).map((e): SelectionAction => ({
      key: `link-term-${e.id}`, group: 'turn', set: 'glossary', icon: e.icon, label: L.linkExisting(e.term), detail: e.meaning || L.linkExistingHint, color: e.color,
      run: () => {
        linkToTerm(editor, range, e);
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.to)));
        view.focus();
      },
    }))];
    // A question is a card too (CARD_BLOCK_NODES); words ending in "?" make it the first offer.
    const question: SelectionAction = { key: 'question', group: 'turn', set: 'glossary', icon: QUESTION_ICON, label: L.question,
      run: () => questionFromSelection(view, range.from, range.to) };
    const asks = /\?\s*$/.test(text(' '));
    out.push(
      ...(asks ? [question] : []),
      ...withLinks(card('definition', L.definition), 'definition'), ...withLinks(card('concept', L.concept), 'concept'),
      // An acronym from "RECs (Renewable Energy Certificate)", "ASX: Australian Stock Exchange"…:
      // its fields filled by inferAcronymFromSelection.
      ...withLinks(card('acronym', L.acronym), 'acronym'), ...withLinks(card('profile', L.profile), 'profile'), ...withLinks(card('formula', L.formula), 'formula'),
      ...withLinks(card('fact', L.fact), 'fact'), ...withLinks(card('instance', L.example), 'instance'),
      ...(asks ? [] : [question]),
      { key: 'quote', group: 'turn', icon: quoteBlock.icon, label: LABELS.noteBlocks.quote.turnInto, run: () => quoteFromSelection(view, range.from, range.to) },
      { key: 'conclusion', group: 'turn', icon: conclusionBlock.icon, label: LABELS.noteBlocks.conclusion.turnInto, run: () => conclusionFromSelection(view, range.from, range.to) },
      { key: 'maths', group: 'turn', icon: mathsBlock.icon, label: LABELS.noteBlocks.maths.turnInto, run: () => mathsFromSelection(view, range.from, range.to) },
      { key: 'create', group: 'turn', set: 'create', icon: '🧩', label: L.createFrom, shortcut: 'Ctrl+Q', run: () => storage.openCreateFrom?.() },
    );
    // The annotations (textMarks.ts markChoices, the list Ctrl+Space shows too), each ✓ while on
    // (choosing it again takes it off).
    out.push(...annotationActions(editor, range));
    out.push(
      { key: 'web-link', group: 'link', icon: createElement(LinkIcon), label: L.webLink, shortcut: 'Ctrl+L', run: () => storage.openWebLink?.() },
      { key: 'link-to-note', group: 'link', icon: NOTE_LINK_ICON, label: LABELS.noteLinks.menu,
        run: () => storage.openNoteLinkPicker?.({ purpose: 'link', from: range.from, to: range.to }) },
    );
    if (!selectionTouchesHub(state)) out.push({ key: 'add-to-hub', group: 'link', icon: HUB_ICON, label: LABELS.hubs.menu, run: () => storage.openAddToHub?.() });
    if (!selectionTouchesInbox(state)) out.push({ key: 'send-to-inbox', group: 'send', set: 'move', icon: INBOX_ICON, label: LABELS.sendToInbox.menu, run: () => storage.openSendToInbox?.() });
  }
  out.push(
    { key: 'scratchpad', group: 'send', set: 'copy', icon: createElement(ScratchpadIcon), label: LABELS.sendSelection.toScratchpad, run: send('scratchpad', '\n') },
    { key: 'sticky', group: 'send', set: 'copy', icon: createElement(StickyIcon), label: LABELS.sendSelection.toSticky, run: send('sticky', '\n') },
    { key: 'reading-list', group: 'send', set: 'lists', icon: builtInListTypeIcon('lt-books'), label: LABELS.sendSelection.toReadingList, run: send('readingList', ' ') },
    { key: 'facts', group: 'send', set: 'lists', icon: builtInListTypeIcon('lt-facts'), label: LABELS.sendSelection.toFacts, run: send('facts', ' ') },
    { key: 'quotes', group: 'send', set: 'lists', icon: builtInListTypeIcon('lt-quotes'), label: LABELS.keptQuotes.add, run: send('quotes', ' ') },
  );
  out.push({ key: 'to-list', group: 'send', set: 'lists', icon: createElement(ListIcon), label: LABELS.sendToList.menu, run: () => {
    // The passage it came from, for each item's link back (a lasting block id, given now).
    const ctx = storage.getContext();
    const blockId = ctx ? ensureBlockId(ctx.noteId, ctx.tabId ?? null, range.from, view.state.schema) : null;
    useUIStore.getState().requestSendToList({ text: text('\n'), noteId: ctx?.noteId ?? null, tabId: ctx?.tabId ?? null, blockId });
  } });
  if (words && words.split(' ').length <= DICTIONARY_MAX_WORDS) {
    out.push({ key: 'dictionary', group: 'send', set: 'lists', icon: builtInListTypeIcon('lt-dictionary'), label: LABELS.dictionary.add, run: () => { void addWordFromSelection(words); } });
  }
  const rank = (a: SelectionAction) => SELECTION_ACTION_GROUPS.indexOf(a.group);
  return out.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map((x) => x.a);
}

// The annotations for a range as selection actions: the selected text, or a right-clicked line.
export function annotationActions(editor: Editor, range: SelectionRange): SelectionAction[] {
  const view = editor.view;
  return markChoices(useNoteStore.getState().noteTags, view.state, range.from, range.to).map((c) => ({
    key: c.key, group: 'mark', set: c.set, icon: c.on ? '✓' : c.icon, label: c.label, color: c.color, run: () => c.run(view),
  }));
}

const termFields = (e: GlossaryEntry) => [
  { text: e.term, weight: 3 },
  { text: e.meaning, weight: 1, counted: true },
  { text: e.noteTitle, weight: 1 },
];

// The Glossary terms to link the selection to, as actions (Link ▸ Glossary term on right-click,
// the end of the `\` menu), suggested ones first under their own heading.
export function termActions(editor: Editor, range: SelectionRange, query = ''): SelectionAction[] {
  const view = editor.view;
  const { terms, suggested } = termsFor(view.state.doc.textBetween(range.from, range.to, ' '), query);
  const L = LABELS.selectionMenu;
  return terms.slice(0, MAX_TERMS).map((e, i): SelectionAction => ({
    key: `term-${e.id}`, group: 'link', set: 'terms', heading: i < suggested ? L.suggested : L.glossaryTerms,
    icon: e.icon, label: e.term, detail: e.meaning || e.noteTitle, color: e.color,
    run: () => {
      linkToTerm(editor, range, e);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.to)));
      view.focus();
    },
  }));
}

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

// The Glossary terms the selected words name (any of its names, a plural too): the whole selection,
// or a whole-word part of it, or the selection a whole-word part of a longer name.
export function termsNamedIn(selected: string): GlossaryEntry[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/(\w{3,})s\b/g, '$1');
  const sel = norm(selected);
  if (sel.length < 3) return [];
  const words = (s: string) => ` ${s} `;
  return glossaryEntries().filter((e) => !e.locked && e.term).filter((e) =>
    [e.term, e.short, e.long].some((n) => {
      const name = n ? norm(n) : '';
      return name.length >= 3 && (name === sel || words(sel).includes(words(name)) || words(name).includes(words(sel)));
    })).slice(0, 3);
}

export function linkToTerm(editor: Editor, range: SelectionRange, entry: GlossaryEntry): void {
  linkConceptRef(editor.view, range.from, range.to, { id: entry.id, typeKey: entry.typeKey });
}
