// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { frameButtons, frameMenuItem, setBlockFrame } from './blockDesigns';
import { QuestionExtensions, answerWithCard, setQuestionFollowUp, setQuestionStatus, toggleQuestionField } from './Question';
import { GlossaryCardExtensions } from './GlossaryCard';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { setBlockWidth } from './blockWidth';
import { useNoteStore } from '@/store/noteStore';
import { useCalendarStore } from '@/store/calendarStore';
import { collectQuestions, questionSubject, questionsInContent } from '@/utils/noteQuestions';
import { OVERVIEW_SOURCES } from '@/overview/sources';
import type { NoteId } from '@/types';

const confirm = vi.hoisted(() => ({ answer: true, asked: 0 }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({ confirmDialog: async () => { confirm.asked++; return confirm.answer; } }));

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
let noteId: NoteId;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  noteId = useNoteStore.getState().addNote({ title: 'Biology' }) as NoteId;
  confirm.answer = true;
  confirm.asked = 0;
});
afterEach(() => editor?.destroy());

function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...QuestionExtensions, ...GlossaryCardExtensions],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId, collectionId: null, now: new Date() });
  editor.commands.focus('end');
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const press = (key: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))) ?? false;
const qPos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'questionBlock') p = pos; }); return p; };
const q = () => editor.state.doc.nodeAt(qPos())!;
const parts = () => { const out: string[] = []; q().forEach((c, _o, i) => out.push(i === 0 ? `Q:${c.textContent}` : `${c.attrs.field}:${c.textContent}`)); return out; };

describe('question block', () => {
  it('`\\question` makes an open question with its own id, the cursor in it', () => {
    make();
    type('\\question ');
    expect(qPos()).toBeGreaterThanOrEqual(0);
    expect(q().attrs).toMatchObject({ status: 'open', followUp: null });
    expect(q().attrs.qid).toMatch(/^.{10}$/);
    type('What is osmosis?');
    expect(parts()).toEqual(['Q:What is osmosis?']);
    expect(press('Enter')).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('parts: Why and Answer shown and hidden (keeping their text); leads added, Enter makes another, an empty one goes', () => {
    make();
    type('\\question What is osmosis?');
    toggleQuestionField(editor.view, qPos(), 'why');
    type('Needed for the exam');
    toggleQuestionField(editor.view, qPos(), 'lead');
    type('Textbook ch. 4');
    press('Enter');
    type('Ask Sam');
    press('Enter');
    expect(parts()).toEqual(['Q:What is osmosis?', 'why:Needed for the exam', 'lead:Textbook ch. 4', 'lead:Ask Sam', 'lead:']);
    press('Enter');   // empty lead: it goes, and the cursor leaves the question
    expect(parts()).toEqual(['Q:What is osmosis?', 'why:Needed for the exam', 'lead:Textbook ch. 4', 'lead:Ask Sam']);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    toggleQuestionField(editor.view, qPos(), 'why');
    expect(parts()).not.toContain('why:Needed for the exam');
    toggleQuestionField(editor.view, qPos(), 'why');
    expect(parts()[1]).toBe('why:Needed for the exam');
  });

  it('writing an answer, then leaving it, marks an open question answered, as its own undo step; set back to open, it stays', async () => {
    make();
    type('\\question What is osmosis?');
    toggleQuestionField(editor.view, qPos(), 'answer');
    expect(editor.state.selection.$from.parent.attrs.field).toBe('answer');
    type('Water moving across a membrane');
    await new Promise((r) => setTimeout(r, 0));
    expect(q().attrs.status).toBe('open');            // not while typing
    press('Enter');                                    // the last part: out of the question
    await new Promise((r) => setTimeout(r, 0));
    expect(q().attrs).toMatchObject({ status: 'answered' });
    expect(q().attrs.answeredAt).toBeTruthy();
    editor.commands.undo();                            // Ctrl+Z: back to open, the answer kept
    expect(q().attrs.status).toBe('open');
    expect(parts()).toContain('answer:Water moving across a membrane');
    // In and out of an answer that was already there: still open.
    let answerPos = -1;
    editor.state.doc.descendants((n, pos) => { if (n.type.name === 'questionField' && n.attrs.field === 'answer') answerPos = pos; });
    editor.commands.setTextSelection(answerPos + 2);
    editor.commands.setTextSelection(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(q().attrs.status).toBe('open');
  });

  it('a question saved in the old Note design reads as Compact; its heading and icon follow its status', () => {
    make('<div data-type="question" data-qid="Q1" data-variant="note"><div data-qn-text>Why?</div></div>');
    expect(q().attrs.variant).toBe('compact');
    const dom = () => editor.view.dom.querySelector('[data-type="question"]')!;
    expect(dom().getAttribute('data-qn-heading')).toBe('Question');
    expect(dom().getAttribute('data-qn-icon')).toBe('❓');
    setQuestionStatus(editor.view, qPos(), 'answered');
    expect(dom().getAttribute('data-qn-heading')).toBe('Question · Answered');
    expect(dom().getAttribute('data-qn-icon')).toBe('✅');
  });

  it('a question is a card with its own border: Shade but no Outline, and an old outline stops drawing', () => {
    make('<div data-type="question" data-qid="Q1" data-outlined="true"><div data-qn-text>Why?</div></div>');
    expect(editor.view.dom.querySelector('[data-type="question"]')!.hasAttribute('data-outlined')).toBe(false);
    const frames = frameButtons(editor.view, () => qPos() + 1, q().attrs);
    expect([...frames.querySelectorAll('[data-block-frame]')].map((b) => b.getAttribute('data-block-frame'))).toEqual(['shaded', 'options']);
    setBlockFrame(editor.view, qPos(), { outlined: true, shaded: true });
    expect(q().attrs).toMatchObject({ outlined: false, shaded: true });
    const menu = frameMenuItem(editor.view, qPos(), q().attrs);
    expect(menu.submenu!.flat().map((i) => i.id)).toEqual(['frame-shaded', 'frame-shade-colour']);
  });

  it('answered: dated, and given an Answer part; dropped is kept', () => {
    make();
    type('\\question Why is the sky blue?');
    setQuestionStatus(editor.view, qPos(), 'answered');
    expect(q().attrs.status).toBe('answered');
    expect(q().attrs.answeredAt).toBeTruthy();
    expect(parts()).toEqual(['Q:Why is the sky blue?', 'answer:']);
    setQuestionStatus(editor.view, qPos(), 'dropped');
    expect(q().attrs).toMatchObject({ status: 'dropped', answeredAt: null });
  });

  it('follow up by a date asks before making a calendar reminder linked to the note', async () => {
    make();
    type('\\question What is osmosis?');
    await setQuestionFollowUp(editor.view, qPos(), '2026-10-20', { noteId, collectionId: null, now: new Date() });
    expect(confirm.asked).toBe(1);
    const reminders = Object.values(useCalendarStore.getState().reminders);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ date: '2026-10-20', title: 'Follow up: What is osmosis?', crossAppRefs: [{ type: 'note', id: noteId }] });
    expect(q().attrs).toMatchObject({ followUp: '2026-10-20', reminderId: reminders[0].id });

    confirm.answer = false;
    await setQuestionFollowUp(editor.view, qPos(), '2026-10-27', { noteId, collectionId: null, now: new Date() });
    expect(Object.values(useCalendarStore.getState().reminders)).toHaveLength(1);
    expect(q().attrs.followUp).toBe('2026-10-27');
  });

  it('answer with a card: a Glossary record from the question and its answer, its card after it, the question answered', () => {
    make();
    type('\\question What is osmosis?');
    toggleQuestionField(editor.view, qPos(), 'answer');
    type('Water moving across a membrane');
    answerWithCard(editor.view, qPos(), 'definition', { noteId, collectionId: null, now: new Date() });
    const entries = Object.values(useNoteStore.getState().structuredTagEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ typeKey: 'definition', term: 'osmosis', fields: { meaning: 'Water moving across a membrane' }, noteId });
    expect(q().attrs).toMatchObject({ status: 'answered', entryId: entries[0].id });
    expect(editor.state.doc.nodeAt(qPos() + q().nodeSize)?.attrs.entryId).toBe(entries[0].id);
    expect(parts()).toContain('Q:What is osmosis?');   // the question stays
  });

  it('a question has a width like a card: the column until set, then drawn narrower, with a handle; it round-trips', () => {
    make('<div data-type="question" data-qid="q1"><div data-qn-text>Why?</div></div>');
    const pos = () => { let p = -1; editor.state.doc.descendants((n, at) => { if (n.type.name === 'questionBlock') p = at; }); return p; };
    const dom = () => editor.view.dom.querySelector('[data-type="question"]') as HTMLElement;
    expect(dom().hasAttribute('data-block-width-shown')).toBe(false);
    expect(dom().querySelector(':scope > [data-block-resize]')).not.toBeNull();
    setBlockWidth(editor.view, pos(), 'half');
    expect(dom().getAttribute('data-block-width-shown')).toBe('half');
    setBlockWidth(editor.view, pos(), '42%');
    expect(dom().getAttribute('data-block-width-shown')).toBe('custom');
    expect(dom().style.getPropertyValue('--block-w')).toBe('42%');
    editor.commands.setContent(editor.getHTML());
    expect(editor.state.doc.nodeAt(pos())!.attrs.width).toBe('42%');
  });

  it('a drag on the width handle ends on release, though the drag redrew the question and its handle', () => {
    make('<div data-type="question" data-qid="q1"><div data-qn-text>Why?</div></div>');
    const dom = () => editor.view.dom.querySelector('[data-type="question"]') as HTMLElement;
    const handle = dom().querySelector(':scope > [data-block-resize]') as HTMLElement;
    handle.setPointerCapture = () => {};
    const ev = (type: string, x: number) => Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x }), { pointerId: 1 });
    dom().getBoundingClientRect = () => ({ left: 0, width: 400 } as DOMRect);
    (dom().parentElement as HTMLElement).getBoundingClientRect = () => ({ left: 0, width: 400 } as DOMRect);
    handle.dispatchEvent(ev('pointerdown', 400));
    expect(document.documentElement.hasAttribute('data-block-resizing')).toBe(true);
    window.dispatchEvent(ev('pointermove', 200));
    expect(handle.isConnected).toBe(false);   // the question was redrawn under the drag
    window.dispatchEvent(ev('pointerup', 200));
    expect(document.documentElement.hasAttribute('data-block-resizing')).toBe(false);
    let width: unknown;
    editor.state.doc.descendants((n) => { if (n.type.name === 'questionBlock') width = n.attrs.width; });
    expect(width).toBe('half');
  });

  it('round-trips through JSON and HTML, and copies as text', () => {
    make();
    type('\\question What is osmosis?');
    toggleQuestionField(editor.view, qPos(), 'lead');
    type('Textbook');
    setQuestionStatus(editor.view, qPos(), 'answered');
    const attrs = q().attrs;
    for (const content of [editor.getJSON(), editor.getHTML()]) {
      editor.commands.setContent(content);
      expect(q().attrs).toMatchObject({ qid: attrs.qid, status: 'answered', answeredAt: attrs.answeredAt });
      expect(parts()).toEqual(['Q:What is osmosis?', 'lead:Textbook', 'answer:']);
    }
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toContain('Q: What is osmosis? (Answered)\n- Lead: Textbook');
  });
});

describe('questions across notes', () => {
  it('what a question is about, for the card that answers it', () => {
    expect(questionSubject('What is osmosis?')).toBe('osmosis');
    expect(questionSubject('What are the mitochondria?')).toBe('mitochondria');
    expect(questionSubject('What does ASX stand for?')).toBe('ASX');
    expect(questionSubject("What's a gradient?")).toBe('gradient');
    expect(questionSubject('How does photosynthesis work?')).toBe('photosynthesis');
    expect(questionSubject('Why is it like that?')).toBe('Why is it like that');
  });

  it('are listed from notes for the Overview: open, answered as done, dropped left out', () => {
    const content = JSON.stringify({ type: 'doc', content: [
      { type: 'questionBlock', attrs: { qid: 'q1', status: 'open', followUp: '2026-10-20' }, content: [{ type: 'questionText', content: [{ type: 'text', text: 'What is osmosis?' }] }] },
      { type: 'questionBlock', attrs: { qid: 'q2', status: 'answered' }, content: [{ type: 'questionText', content: [{ type: 'text', text: 'Why?' }] }] },
      { type: 'questionBlock', attrs: { qid: 'q3', status: 'dropped' }, content: [{ type: 'questionText' }] },
    ] });
    expect(questionsInContent(content).map((x) => x.qid)).toEqual(['q1', 'q2', 'q3']);
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [noteId]: { ...s.notes[noteId], content } } }));
    expect(collectQuestions(Object.values(useNoteStore.getState().notes))).toHaveLength(3);
    const source = OVERVIEW_SOURCES.find((s) => s.key === 'question')!;
    const snap = { notes: useNoteStore.getState().notes, noteTags: {}, lockedNoteIds: new Set<string>() } as unknown as Parameters<typeof source.rows>[0];
    const rows = source.rows(snap, '2026-10-13').rows;
    expect(rows.map((r) => [r.title, r.status, r.when])).toEqual([['What is osmosis?', 'open', '2026-10-20'], ['Why?', 'done', null], ['Question', 'archived', null]]);
  });
});
