// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { NoteTagMark } from './NoteTagMark';
import { ConceptRefMark, collectRefGroups, linkConceptRef, unlinkConceptRef } from './ConceptRef';
import { Importance, collectImportantPassages, cycleImportance, nextReview, setImportance, toggleReview } from './Importance';
import { NoteObjectTrigger } from '../objects/NoteObjectTrigger';
import { getSelectionMenu } from '../objects/selectionMenuState';
import { insertObjectTrigger } from '../objects/actions';
import { useNoteStore } from '@/store/noteStore';
import { glossaryEntries, glossaryReferences } from '@/services/glossary';
import { answerReview, dueReviews, reviewItems } from '@/services/noteReview';
import { registerLiveNoteEditor } from '@/services/liveNoteEditor';
import { collectReviewPassages, contentHasMark, countConceptRefs, updatePassageInContent } from '@/utils/noteContent';
import type { NoteId } from '@/types';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => { editor?.destroy(); registerLiveNoteEditor(null); });
beforeEach(() => useNoteStore.setState(useNoteStore.getInitialState(), true));

function make(content = '<p>Plants use photosynthesis to make sugar from light.</p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteTagMark, ConceptRefMark, Importance, NoteObjectTrigger],
    content,
  });
}
// The document position of `text`'s first character, and just after its last.
function rangeOf(text: string): { from: number; to: number } {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text?.includes(text)) from = pos + node.text.indexOf(text);
  });
  return { from, to: from + text.length };
}
const select = (text: string) => { const r = rangeOf(text); editor.commands.setTextSelection(r); return r; };
const json = () => JSON.stringify(editor.getJSON());

describe('Important levels', () => {
  it('Ctrl+1 steps Important → Very important → Critical → off, keeping one passage id', () => {
    make();
    select('photosynthesis');
    const levels: (number | null)[] = [];
    let ids = new Set<string | null>();
    for (let i = 0; i < 4; i++) {
      cycleImportance(editor.view);
      const p = collectImportantPassages(editor.state.doc);
      levels.push(p[0]?.level ?? null);
      ids = new Set([...ids, ...p.map((x) => x.passageId)]);
    }
    expect(levels).toEqual([1, 2, 3, null]);
    expect(ids.size).toBe(1);
  });

  it('draws one margin marker per line, with the highest level', () => {
    make('<p>One two three</p>');
    let r = rangeOf('One');
    setImportance(editor.view, r.from, r.to, 1);
    r = rangeOf('three');
    setImportance(editor.view, r.from, r.to, 3);
    const markers = [...editor.view.dom.querySelectorAll('[data-importance-marker]')].map((m) => m.textContent);
    expect(markers).toEqual(['❗']);
  });

  it('Review later puts it on the list (due tomorrow); Got it pushes it further out each time', () => {
    make();
    const r = rangeOf('photosynthesis');
    toggleReview(editor.view, r.from, r.to, '2026-10-07');
    const [p] = collectImportantPassages(editor.state.doc);
    expect(p).toMatchObject({ level: 1, reviewDue: '2026-10-08', reviewStep: 0 });
    expect(nextReview(0, 'good', '2026-10-08')).toEqual({ due: '2026-10-11', step: 1 });
    expect(nextReview(1, 'good', '2026-10-11')).toEqual({ due: '2026-10-18', step: 2 });
    expect(nextReview(2, 'again', '2026-10-18')).toEqual({ due: '2026-10-19', step: 0 });
    expect(nextReview(2, 'stop')).toEqual({ due: null, step: null });
    toggleReview(editor.view, r.from, r.to);
    expect(collectImportantPassages(editor.state.doc)[0]).toMatchObject({ reviewDue: null, level: 1 });
  });

  it('levels and review survive saving and loading', () => {
    make();
    const r = rangeOf('photosynthesis');
    setImportance(editor.view, r.from, r.to, 2);
    toggleReview(editor.view, r.from, r.to, '2026-10-07');
    const saved = editor.getJSON();
    const html = editor.getHTML();
    expect(html).toContain('data-level="2"');
    editor.commands.setContent(saved);
    expect(collectImportantPassages(editor.state.doc)[0]).toMatchObject({ level: 2, reviewDue: '2026-10-08' });
    editor.commands.setContent(html);
    expect(collectImportantPassages(editor.state.doc)[0]).toMatchObject({ level: 2, reviewDue: '2026-10-08' });
  });
});

describe('`\\` on a selection', () => {
  it('opens the selection menu instead of replacing the text', () => {
    make();
    const r = select('photosynthesis');
    const view = editor.view;
    const handled = view.someProp('handleTextInput', (f) => f(view, r.from, r.to, '\\', () => view.state.tr));
    expect(handled).toBe(true);
    expect(getSelectionMenu(editor.state)).toEqual(r);
    expect(editor.state.doc.textContent).toContain('photosynthesis');
    editor.commands.setTextSelection(1);
    expect(getSelectionMenu(editor.state)).toBeNull();   // moving away closes it
  });

  it('a selection across paragraphs opens it too (on the key, before the text would be replaced)', () => {
    make('<p>First line</p><p>Second line</p>');
    const from = rangeOf('line').from;
    const to = rangeOf('Second').to;
    editor.commands.setTextSelection({ from, to });
    const view = editor.view;
    const event = new KeyboardEvent('keydown', { key: '\\', bubbles: true, cancelable: true });
    expect(view.someProp('handleKeyDown', (f) => f(view, event))).toBe(true);
    expect(getSelectionMenu(editor.state)).toEqual({ from, to });
    expect(editor.state.doc.textContent).toBe('First lineSecond line');
  });

  it('the toolbar’s \\ button does the same with text selected', () => {
    make();
    select('sugar');
    insertObjectTrigger(editor.view);
    expect(getSelectionMenu(editor.state)).not.toBeNull();
    expect(editor.state.doc.textContent).not.toContain('\\');
  });
});

describe('text linked to a Glossary term', () => {
  it('links, groups across bold, and unlinks', () => {
    make('<p>The <strong>light</strong> reactions happen first.</p>');
    const r = rangeOf('The ');
    const end = rangeOf(' reactions').to;
    linkConceptRef(editor.view, r.from, end, { id: 'e1', typeKey: 'concept' });
    const groups = collectRefGroups(editor.state.doc);
    expect(groups).toHaveLength(1);
    expect(editor.state.doc.textBetween(groups[0].from, groups[0].to)).toBe('The light reactions');
    expect(countConceptRefs(json()).get('e1')).toBe(1);
    expect(contentHasMark(json(), { mark: 'conceptRef', attr: 'entryId', value: 'e1' })).toBe(true);
    unlinkConceptRef(editor.view, groups[0]);
    expect(collectRefGroups(editor.state.doc)).toEqual([]);
  });

  it('the Glossary lists definitions and concepts, with where each is referred to', () => {
    const notes = useNoteStore.getState();
    const noteA = notes.addNote({ title: 'Biology' });
    const noteB = notes.addNote({ title: 'Revision' });
    const id = notes.addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Photosynthesis', fields: { meaning: 'How plants make sugar' }, noteId: noteA as NoteId, collectionId: null });
    notes.addStructuredTagEntry({ typeKey: 'concept', tagId: 'builtin-concept', term: 'Energy', fields: { summary: 'Capacity to do work' }, noteId: noteA as NoteId, collectionId: null });
    make();
    const r = rangeOf('photosynthesis');
    linkConceptRef(editor.view, r.from, r.to, { id, typeKey: 'definition' });
    notes.updateNote(noteB as NoteId, { content: json() });
    const entries = glossaryEntries();
    expect(entries.map((e) => [e.term, e.kindLabel, e.meaning, e.noteTitle])).toEqual([
      ['Energy', 'Concept', 'Capacity to do work', 'Biology'],
      ['Photosynthesis', 'Definition', 'How plants make sugar', 'Biology'],
    ]);
    expect(glossaryReferences().get(id)).toEqual([{ noteId: noteB, count: 1 }]);
  });
});

describe('Review', () => {
  function noteWithReview(due: string) {
    make();
    const r = rangeOf('photosynthesis');
    toggleReview(editor.view, r.from, r.to, due);
    const noteId = useNoteStore.getState().addNote({ title: 'Biology', content: json() });
    return noteId as NoteId;
  }

  it('finds due passages with their context, and answering reschedules the stored note', () => {
    const noteId = noteWithReview('2026-10-06');   // due 2026-10-07
    expect(collectReviewPassages(json())[0]).toMatchObject({ text: 'photosynthesis', context: 'Plants use photosynthesis to make sugar from light.' });
    expect(dueReviews('2026-10-06')).toEqual([]);
    const [item] = dueReviews('2026-10-07');
    expect(item).toMatchObject({ noteId, tabId: null, text: 'photosynthesis', reviewStep: 0 });
    answerReview(item, 'good', '2026-10-07');
    expect(reviewItems()[0]).toMatchObject({ reviewDue: '2026-10-10', reviewStep: 1 });
    answerReview(reviewItems()[0], 'stop', '2026-10-10');
    expect(reviewItems()).toEqual([]);
  });

  it('answers through the editor when the passage’s text is open there', () => {
    const noteId = noteWithReview('2026-10-06');
    registerLiveNoteEditor({ noteId, tabId: null, view: editor.view });
    const before = useNoteStore.getState().notes[noteId].content;
    answerReview(dueReviews('2026-10-07')[0], 'again', '2026-10-07');
    expect(useNoteStore.getState().notes[noteId].content).toBe(before);   // the store is the editor's to write
    expect(collectImportantPassages(editor.state.doc)[0]).toMatchObject({ reviewDue: '2026-10-08', reviewStep: 0 });
  });

  it('updatePassageInContent leaves other passages alone', () => {
    make('<p>alpha beta</p>');
    let r = rangeOf('alpha');
    setImportance(editor.view, r.from, r.to, 1);
    r = rangeOf('beta');
    setImportance(editor.view, r.from, r.to, 1);
    const [a, b] = collectImportantPassages(editor.state.doc);
    const res = updatePassageInContent(json(), a.passageId!, { level: 3 });
    expect(res.changed).toBe(true);
    editor.commands.setContent(JSON.parse(res.content));
    expect(collectImportantPassages(editor.state.doc).map((p) => [p.passageId, p.level])).toEqual([[a.passageId, 3], [b.passageId, 1]]);
  });
});
