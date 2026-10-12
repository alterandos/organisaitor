// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { HubExtensions } from './Hub';
import { NoteBlockSelect } from './blockDesigns';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { registerLiveNoteEditor } from '@/services/liveNoteEditor';
import { addLinkToHub, addPassageToHub, listHubs, openHubFromMarker, removeLink, selectionTouchesHub, setLinkRelation } from '@/services/noteHubs';
import { useNoteStore } from '@/store/noteStore';
import { useToastStore } from '@/store/toastStore';
import { hubsInContent } from '@/utils/noteHubs';
import type { NoteId } from '@/types';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
let noteId: string;

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useToastStore.setState(useToastStore.getInitialState(), true);
});
afterEach(() => { registerLiveNoteEditor(null); editor?.destroy(); });

const HUB = '<div data-type="hub" data-hub-id="H1"><div data-hub-title>Inflation</div><div data-hub-take>Mostly expectations</div></div>';

function make(content = '<p></p>') {
  noteId = useNoteStore.getState().addNote({ title: 'Econ' });
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...HubExtensions, NoteBlockSelect],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId, collectionId: null, now: new Date() });
  registerLiveNoteEditor({ noteId, tabId: null, view: editor.view });
  useNoteStore.getState().updateNote(noteId as NoteId, { content: JSON.stringify(editor.getJSON()) });
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const key = (k: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: k })));
const links = () => { const out: { pos: number; attrs: Record<string, unknown> }[] = []; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'hubLink') out.push({ pos, attrs: n.attrs }); }); return out; };
const hubPos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'hub') p = pos; }); return p; };
const marksOf = (doc = editor.state.doc) => { const out: Record<string, unknown>[] = []; doc.descendants((n) => { for (const m of n.marks) if (m.type.name === 'hubRef') out.push(m.attrs); }); return out; };
function select(text: string) {
  let from = -1;
  editor.state.doc.descendants((n, pos) => { if (from < 0 && n.isText && n.text!.includes(text)) from = pos + n.text!.indexOf(text); });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + text.length)));
}
const here = () => ({ noteId, tabId: null });
const hubHere = () => listHubs().find((h) => h.hubId === 'H1')!;
const pressToast = (label: string) => useToastStore.getState().current!.actions.find((a) => a.label === label)!.onClick();

describe('hub block', () => {
  it('`\\hub` makes a hub with an id, the cursor in its name; Enter goes to the take, then out', () => {
    make();
    type('\\hub ');
    expect(hubPos()).toBeGreaterThanOrEqual(0);
    expect(editor.state.doc.nodeAt(hubPos())!.attrs.hubId).toMatch(/^.{10}$/);
    type('Inflation');
    key('Enter');
    expect(editor.state.selection.$from.parent.type.name).toBe('hubTake');
    type('Mostly expectations');
    key('Enter');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('links are kept grouped by relation; changing a relation moves the link to its group', () => {
    make(HUB);
    addLinkToHub(editor.view, hubPos(), { kind: 'note', noteId: 'n9', label: 'Some note' }, 'related');
    addLinkToHub(editor.view, hubPos(), { kind: 'glossary', entryId: 'e1', label: 'Money supply' }, 'causes');
    addLinkToHub(editor.view, hubPos(), { kind: 'note', noteId: 'n8', label: 'Oil shocks' }, 'exampleOf');
    expect(links().map((l) => l.attrs.relation)).toEqual(['causes', 'exampleOf', 'related']);
    setLinkRelation(editor.view, links()[2].pos, 'causes');
    expect(links().map((l) => [l.attrs.relation, l.attrs.label])).toEqual([['causes', 'Money supply'], ['causes', 'Some note'], ['exampleOf', 'Oil shocks']]);
    // A heading is drawn before each group.
    expect([...editor.view.dom.querySelectorAll('[data-hub-heading]')].map((h) => h.getAttribute('data-hub-heading'))).toEqual(['causes', 'exampleOf']);
  });

  it('design, links and frame round-trip through JSON and HTML; copy lists the links', () => {
    make(HUB.replace('data-hub-id="H1"', 'data-hub-id="H1" data-variant="compact" data-shaded="true"'));
    addLinkToHub(editor.view, hubPos(), { kind: 'glossary', entryId: 'e1', label: 'Money supply' }, 'causes');
    const check = () => {
      expect(editor.state.doc.nodeAt(hubPos())!.attrs).toMatchObject({ hubId: 'H1', variant: 'compact', shaded: true });
      expect(links()[0].attrs).toMatchObject({ kind: 'glossary', entryId: 'e1', relation: 'causes', label: 'Money supply' });
    };
    check();
    const json = editor.getJSON();
    const html = editor.getHTML();
    editor.commands.setContent(json);
    check();
    editor.commands.setContent(html);
    check();
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('Inflation\nMostly expectations\n- Causes: Money supply');
  });
});

describe('add to hub', () => {
  it('within a note: the passage stays, gets a mark and one marker; the hub gets a preview link', () => {
    make(`<p>Rates rose sharply in 2022.</p>${HUB}`);
    select('Rates rose sharply');
    expect(addPassageToHub(editor.view, here(), hubHere(), 'supports')).toBe(true);
    const [link] = links();
    expect(link.attrs).toMatchObject({ kind: 'passage', relation: 'supports', noteId, label: 'Rates rose sharply' });
    expect(marksOf()).toEqual([{ hubId: 'H1', linkId: link.attrs.linkId, hubNoteId: noteId, hubTitle: 'Inflation' }]);
    expect(editor.state.doc.textContent).toContain('Rates rose sharply in 2022.');
    expect(editor.view.dom.querySelectorAll('[data-hub-marker]')).toHaveLength(1);
  });

  it('a passage can be in two hubs (two marks on the same text)', () => {
    make(`<p>Central banks</p>${HUB}${HUB.replace('H1', 'H2').replace('Inflation', 'Policy')}`);
    select('Central banks');
    addPassageToHub(editor.view, here(), hubHere(), 'related');
    select('Central banks');
    addPassageToHub(editor.view, here(), listHubs().find((h) => h.hubId === 'H2')!, 'partOf');
    expect(marksOf().map((m) => m.hubId).sort()).toEqual(['H1', 'H2']);
  });

  it('to a hub in another note (stored): the link goes there, the mark here; removing the link takes the mark off', () => {
    make('<p>Oil shocks of the 1970s</p>');
    const otherId = useNoteStore.getState().addNote({ title: 'Hubs' });
    useNoteStore.getState().updateNote(otherId, { content: JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [
      { type: 'hub', attrs: { hubId: 'FAR' }, content: [{ type: 'hubTitle', content: [{ type: 'text', text: 'Energy' }] }, { type: 'hubTake' }] },
    ] }] }) });
    select('Oil shocks');
    addPassageToHub(editor.view, here(), listHubs().find((h) => h.hubId === 'FAR')!, 'exampleOf');
    const stored = hubsInContent(useNoteStore.getState().notes[otherId].content)[0];
    expect(stored.links.map((l) => [l.relation, l.label, l.noteId])).toEqual([['exampleOf', 'Oil shocks', noteId]]);
    expect(marksOf()[0]).toMatchObject({ hubId: 'FAR', hubNoteId: otherId, hubTitle: 'Energy' });
    // The toast's Undo takes both back.
    pressToast('Undo');
    expect(hubsInContent(useNoteStore.getState().notes[otherId].content)[0].links).toEqual([]);
    expect(marksOf()).toEqual([]);
  });

  it('removing a link in this note takes its mark off the passage', () => {
    make(`<p>Expectations matter</p>${HUB}`);
    select('Expectations');
    addPassageToHub(editor.view, here(), hubHere(), 'supports');
    removeLink(editor.view, links()[0].pos);
    expect(links()).toEqual([]);
    expect(marksOf()).toEqual([]);
  });

  it('a marker whose link is gone takes itself off when clicked; one whose link is there is kept', () => {
    make(`<p>Keep me</p><p>Lose me</p>${HUB}`);
    select('Keep me');
    addPassageToHub(editor.view, here(), hubHere(), 'related');
    select('Lose me');
    addPassageToHub(editor.view, here(), hubHere(), 'related');
    const [, gone] = links();
    const goneMark = marksOf().find((m) => m.linkId === gone.attrs.linkId)! as { hubId: string; linkId: string; hubNoteId: string };
    editor.view.dispatch(editor.state.tr.delete(gone.pos, gone.pos + 1));   // the link deleted some other way
    openHubFromMarker(editor.view, goneMark);
    expect(marksOf().map((m) => m.linkId)).toEqual([links()[0].attrs.linkId]);
    // The other one is still in the hub (in the open editor, not yet saved): it stays.
    const kept = marksOf()[0] as { hubId: string; linkId: string; hubNoteId: string };
    openHubFromMarker(editor.view, kept);
    expect(marksOf()).toHaveLength(1);
  });

  it('text inside a hub can’t be added to one', () => {
    make(HUB);
    select('Mostly');
    expect(selectionTouchesHub(editor.state)).toBe(true);
  });
});
