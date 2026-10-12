// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { InboxExtensions, addItem, setInboxOrder, setItemStatus } from './Inbox';
import { NoteBlockSelect } from './blockDesigns';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { registerLiveNoteEditor } from '@/services/liveNoteEditor';
import { listInboxes, selectionTouchesInbox, sendToInbox } from '@/services/noteInbox';
import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import { useToastStore } from '@/store/toastStore';
import { useTrashStore } from '@/store/trashStore';
import { inboxesInContent } from '@/utils/noteInboxes';
import type { NoteId } from '@/types';

// The confirmation is answered by the test: `dialogs.answer`, and what it was asked is recorded.
const dialogs = vi.hoisted(() => ({ answer: true, asked: [] as string[] }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({
  confirmDialog: async (o: { title: string }) => { dialogs.asked.push(o.title); return dialogs.answer; },
  alertDialog: async () => {},
}));

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
let noteId: string;

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useToastStore.setState(useToastStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
  dialogs.answer = true;
  dialogs.asked = [];
});
afterEach(() => { registerLiveNoteEditor(null); editor?.destroy(); });

const INBOX = '<div data-type="inbox" data-inbox-id="IB1" data-order="newest"><div data-inbox-title>Ideas</div></div>';

// A note in the store, open in the editor (registered as the live one, as NoteEditor does).
function make(content = '<p></p>') {
  noteId = useNoteStore.getState().addNote({ title: 'Here' });
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...InboxExtensions, NoteBlockSelect],
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
const find = (name: string) => { const out: { pos: number; attrs: Record<string, unknown>; text: string }[] = []; editor.state.doc.descendants((n, pos) => { if (n.type.name === name) out.push({ pos, attrs: n.attrs, text: n.textContent }); }); return out; };
// Selects `text` in the editor.
function select(text: string) {
  let from = -1;
  editor.state.doc.descendants((n, pos) => { if (from < 0 && n.isText && n.text!.includes(text)) from = pos + n.text!.indexOf(text); });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + text.length)));
}
const here = () => ({ noteId, tabId: null });
const inboxHere = () => listInboxes().find((i) => i.inboxId === 'IB1')!;
const pressToast = (label: string) => useToastStore.getState().current!.actions.find((a) => a.label === label)!.onClick();

describe('inbox block', () => {
  it('`\\inbox` makes an inbox with an id, the cursor in its name', () => {
    make();
    type('\\inbox ');
    const [inbox] = find('inbox');
    expect(inbox.attrs.inboxId).toMatch(/^.{10}$/);
    expect(editor.state.selection.$from.parent.type.name).toBe('inboxTitle');
  });

  it('Enter in the name starts the first item; an empty last line starts the next; an empty item leaves', () => {
    make(INBOX);
    editor.commands.setTextSelection(4);
    key('Enter');
    type('One');
    expect(find('inboxItem').map((i) => i.text)).toEqual(['One']);
    editor.commands.splitBlock();   // a new, empty last line in the item…
    key('Enter');                   // …Enter there: the next item
    type('Two');
    expect(find('inboxItem').map((i) => i.text)).toEqual(['One', 'Two']);
    editor.commands.splitBlock();
    key('Enter');                   // a third, empty item
    expect(find('inboxItem')).toHaveLength(3);
    key('Enter');                   // Enter in an empty item: it goes, and the cursor leaves the inbox
    expect(find('inboxItem')).toHaveLength(2);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.$from.node(-1).type.name).not.toBe('inboxItem');
  });

  it('Backspace at the start of an item never merges it into the one before', () => {
    make(INBOX);
    addItem(editor.view, find('inbox')[0].pos);
    type('Old');
    addItem(editor.view, find('inbox')[0].pos);   // newest first: this one goes on top
    type('New');
    const items = () => find('inboxItem').map((i) => i.text);
    expect(items()).toEqual(['New', 'Old']);
    editor.commands.setTextSelection(find('inboxItem')[1].pos + 2);
    key('Backspace');
    expect(items()).toEqual(['New', 'Old']);
  });

  it('a new order re-sorts what is there; A–Z puts new items in their place', () => {
    make(INBOX);
    for (const t of ['Banana', 'Apple', 'Cherry']) { addItem(editor.view, find('inbox')[0].pos); type(t); }
    expect(find('inboxItem').map((i) => i.text)).toEqual(['Cherry', 'Apple', 'Banana']);
    setInboxOrder(editor.view, find('inbox')[0].pos, 'az');
    expect(find('inboxItem').map((i) => i.text)).toEqual(['Apple', 'Banana', 'Cherry']);
    addItem(editor.view, find('inbox')[0].pos);
    expect(find('inboxItem')[0].text).toBe('');
  });

  it('design, order, status and frame round-trip through JSON and HTML; copy gives a list', () => {
    make(INBOX.replace('data-order="newest"', 'data-order="oldest" data-variant="board" data-outlined="true"'));
    addItem(editor.view, find('inbox')[0].pos);
    type('Ship it');
    setItemStatus(editor.view, find('inboxItem')[0].pos, 'built');
    const check = () => {
      expect(find('inbox')[0].attrs).toMatchObject({ inboxId: 'IB1', variant: 'board', order: 'oldest', outlined: true });
      expect(find('inboxItem')[0].attrs).toMatchObject({ status: 'built' });
    };
    check();
    const json = editor.getJSON();
    const html = editor.getHTML();
    editor.commands.setContent(json);
    check();
    editor.commands.setContent(html);
    check();
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('Ideas\n- [Built] Ship it');
  });

  it('a copy of an inbox pasted into the same note gets its own ids', () => {
    make(INBOX + INBOX);
    const ids = find('inbox').map((i) => i.attrs.inboxId);
    editor.commands.insertContent('x');
    const after = find('inbox').map((i) => i.attrs.inboxId);
    expect(new Set(after).size).toBe(2);
    expect(ids[0]).toBe('IB1');
  });
});

describe('send to inbox', () => {
  it('within a note: the passage moves into the inbox, a marker stays, Ctrl+Z undoes it all', async () => {
    make(`<p>Keep this. Move this idea. Keep that.</p>${INBOX}`);
    select('Move this idea.');
    expect(await sendToInbox(editor.view, here(), inboxHere())).toBe(true);
    const [item] = find('inboxItem');
    expect(item.text).toBe('Move this idea.');
    expect(item.attrs).toMatchObject({ fromNote: noteId, status: 'idea' });
    const [stub] = find('movedStub');
    expect(stub.attrs).toMatchObject({ itemId: item.attrs.itemId, inboxId: 'IB1', noteId, title: 'Ideas' });
    expect(editor.state.doc.firstChild!.firstChild!.textContent).toBe('Keep this.  Keep that.');
    editor.commands.undo();
    expect(find('inboxItem')).toHaveLength(0);
    expect(find('movedStub')).toHaveLength(0);
    expect(editor.state.doc.firstChild!.firstChild!.textContent).toBe('Keep this. Move this idea. Keep that.');
  });

  it('the marker can be removed, and Ctrl+Z brings it back; the item stays', async () => {
    make(`<p>Move me</p>${INBOX}`);
    select('Move me');
    await sendToInbox(editor.view, here(), inboxHere());
    const stubPos = find('movedStub')[0].pos;
    editor.view.dispatch(editor.state.tr.delete(stubPos, stubPos + 1));
    expect(find('movedStub')).toHaveLength(0);
    expect(find('inboxItem')).toHaveLength(1);
    editor.commands.undo();
    expect(find('movedStub')).toHaveLength(1);
  });

  it('to a new inbox at the end of this note', async () => {
    make('<p>An idea</p><p>More</p>');
    select('An idea');
    await sendToInbox(editor.view, here(), { newHere: true });
    const inboxes = find('inbox');
    expect(inboxes).toHaveLength(1);
    expect(find('inboxTitle')[0].text).toBe('Inbox');
    expect(find('inboxItem')[0].text).toBe('An idea');
    pressToast('Undo');
    expect(find('inbox')).toHaveLength(0);
    expect(editor.state.doc.textContent).toContain('An idea');
  });

  it('to another note: the inbox there gets it (stored JSON); the toast’s Undo puts it back', async () => {
    make('<p>Send this away</p>');
    const otherId = useNoteStore.getState().addNote({ title: 'Ideas note' });
    useNoteStore.getState().updateNote(otherId, { content: JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [
      { type: 'inbox', attrs: { inboxId: 'OTHER', order: 'newest' }, content: [{ type: 'inboxTitle', content: [{ type: 'text', text: 'Elsewhere' }] }] },
    ] }] }) });
    const target = listInboxes().find((i) => i.inboxId === 'OTHER')!;
    select('Send this away');
    expect(await sendToInbox(editor.view, here(), target, { makeTask: true })).toBe(true);
    const stored = inboxesInContent(useNoteStore.getState().notes[otherId].content)[0];
    expect(stored.items.map((i) => i.text)).toEqual(['Send this away']);
    expect(find('movedStub')[0].attrs).toMatchObject({ noteId: otherId, title: 'Elsewhere' });
    // A task, linked to the inbox's note.
    const task = Object.values(useTaskStore.getState().tasks)[0];
    expect(task).toMatchObject({ title: 'Send this away', crossAppRefs: [{ type: 'note', id: otherId }] });
    expect(stored.items[0].taskId).toBe(task.id);
    // Ctrl+Z here doesn't half-undo it (the other note keeps its copy otherwise).
    editor.commands.undo();
    expect(find('movedStub')).toHaveLength(1);
    pressToast('Undo');
    expect(inboxesInContent(useNoteStore.getState().notes[otherId].content)[0].items).toEqual([]);
    expect(find('movedStub')).toHaveLength(0);
    expect(editor.state.doc.textContent).toBe('Send this away');
    expect(Object.keys(useTaskStore.getState().tasks)).toEqual([]);
    expect(Object.keys(useTrashStore.getState().entries)).toEqual([]);
  });

  it('text inside an inbox can’t be sent', () => {
    make(INBOX);
    addItem(editor.view, find('inbox')[0].pos);
    type('Inside');
    select('Inside');
    expect(selectionTouchesInbox(editor.state)).toBe(true);
  });
  it('out of an encrypted note into an unencrypted one: it asks first; No leaves the text where it was', async () => {
    make('<p>A secret plan</p>');
    useNoteStore.setState((st) => ({ notes: { ...st.notes, [noteId]: { ...st.notes[noteId as NoteId], isEncrypted: true } } }));
    const otherId = useNoteStore.getState().addNote({ title: 'Open ideas' });
    useNoteStore.getState().updateNote(otherId, { content: JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [
      { type: 'inbox', attrs: { inboxId: 'PLAIN', order: 'newest' }, content: [{ type: 'inboxTitle', content: [{ type: 'text', text: 'Ideas' }] }] },
    ] }] }) });
    const target = listInboxes().find((i) => i.inboxId === 'PLAIN')!;
    dialogs.answer = false;
    select('A secret plan');
    expect(await sendToInbox(editor.view, here(), target)).toBe(false);
    expect(dialogs.asked).toEqual(['Move it out of an encrypted note?']);
    expect(editor.state.doc.textContent).toBe('A secret plan');
    expect(inboxesInContent(useNoteStore.getState().notes[otherId].content)[0].items).toEqual([]);
    dialogs.answer = true;
    expect(await sendToInbox(editor.view, here(), target)).toBe(true);
    expect(inboxesInContent(useNoteStore.getState().notes[otherId].content)[0].items.map((it) => it.text)).toEqual(['A secret plan']);
  });

  it('within the same note, or from an unencrypted note, it doesn’t ask', async () => {
    make(`<p>Plain idea</p>${INBOX}`);
    select('Plain idea');
    await sendToInbox(editor.view, here(), inboxHere());
    useNoteStore.setState((st) => ({ notes: { ...st.notes, [noteId]: { ...st.notes[noteId as NoteId], isEncrypted: true } } }));
    editor.commands.insertContentAt(1, 'Secret idea ');
    select('Secret idea');
    await sendToInbox(editor.view, here(), { newHere: true });
    expect(dialogs.asked).toEqual([]);
  });
});
