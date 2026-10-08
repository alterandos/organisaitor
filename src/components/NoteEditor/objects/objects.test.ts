// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { act, fireEvent } from '@testing-library/react';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from '../extensions/Section';
import { ArtifactLinkMark } from '../extensions/ArtifactLinkMark';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';
import { useTrashStore } from '@/store/trashStore';
import type { CalendarReminderId } from '@/types';
import { NoteObjectTrigger, objectTriggerStorage } from './NoteObjectTrigger';
import { ArtifactLinkGroups, collectArtifactGroups, setArtifactDisplay } from './artifactGroups';
import { getSession } from './session';
import { interpretQuery, matchKinds, NOTE_OBJECT_KINDS } from './kinds';
import { applyResolvedArtifactLink, insertObjectTrigger, setOverride } from './actions';
import { ARTIFACT_TYPES } from './artifactTypes';
import { getNoteBacklinks } from '@/store/noteBacklinks';
import { useDialogStore } from '@/store/dialogStore';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { flagMenuItems } from './flags';
import { expandShortWeekdays, readWhenInput, tidyObjectTitle } from './whenInput';
import { addDaysToIso, todayIso } from '@/utils/date';

// jsdom has no layout; ProseMirror's scroll-into-view asks for rects.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

const NOW = new Date(2026, 9, 6, 9, 0);   // Tue 6 Oct 2026, 09:00
const NOTE_ID = 'note-1';

let editor: Editor;

function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, ArtifactLinkMark, ArtifactLinkGroups, NoteObjectTrigger],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId: NOTE_ID, collectionId: null, now: NOW });
  editor.commands.focus('end');
}

// Typing, as the browser would: one transaction per chunk at the cursor (handleTextInput first,
// the way ProseMirror's input handling asks it).
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

function press(key: string, init: KeyboardEventInit = {}) {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  const handled = view.someProp('handleKeyDown', (f) => f(view, event)) ?? false;
  return handled;
}

const text = () => editor.state.doc.textContent;
const session = () => getSession(editor.state);
const reminders = () => Object.values(useCalendarStore.getState().reminders);
const linkMarks = () => {
  const out: { text: string; targetId: string; display: string }[] = [];
  editor.state.doc.descendants((node) => {
    const m = node.marks.find((mk) => mk.type.name === 'artifactLink');
    if (node.isText && m) out.push({ text: node.text!, targetId: m.attrs.targetId, display: m.attrs.display });
  });
  return out;
};
// A tick for the store refresh to redraw, inside act() so the expanded bodies' React roots render too.
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  // The panes word dates against the real clock ("Tomorrow"), so it has to be NOW too. Only Date
  // is faked: flush() needs real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useToastStore.setState(useToastStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
});
afterEach(() => { editor?.destroy(); vi.useRealTimers(); });

describe('the kind registry', () => {
  it('every kind has a unique keyword set and live link rendering for what it creates', () => {
    const words = NOTE_OBJECT_KINDS.flatMap((k) => [k.id, ...k.aliases].map((w) => w.toLowerCase()));
    expect(new Set(words).size).toBe(words.length);
    for (const k of NOTE_OBJECT_KINDS) expect(ARTIFACT_TYPES[k.targetType], k.id).toBeDefined();
  });

  it('matches exact keywords, then prefixes, then label words', () => {
    expect(matchKinds('').map((k) => k.id)).toEqual(NOTE_OBJECT_KINDS.map((k) => k.id));
    expect(matchKinds('rem').map((k) => k.id)).toEqual(['reminder']);
    expect(matchKinds('REMI').map((k) => k.id)).toEqual(['reminder']);
    expect(matchKinds('zzz')).toEqual([]);
  });
});

describe('readWhenInput (date/time boxes)', () => {
  it('reads short weekdays in a box, where the whole text is a date', () => {
    expect(readWhenInput('fri', NOW).date).toBe('2026-10-09');
    expect(readWhenInput('next sat', NOW).date).toBe('2026-10-10');
    expect(readWhenInput('12 oct', NOW).date).toBe('2026-10-12');
    expect(readWhenInput('fri 3pm', NOW)).toEqual({ date: '2026-10-09', time: '15:00', endTime: null });
    expect(readWhenInput('fri 1-2pm', NOW)).toEqual({ date: '2026-10-09', time: '13:00', endTime: '14:00' });
    expect(readWhenInput('5pm', NOW)).toEqual({ date: null, time: '17:00', endTime: null });
    expect(readWhenInput('whenever', NOW).date).toBeNull();
  });
});

describe('expandShortWeekdays (what is typed after \\reminder / \\event)', () => {
  it('reads a short weekday only where it can only be a day', () => {
    expect(expandShortWeekdays('lunch with Sam fri 1-2pm')).toBe('lunch with Sam friday 1-2pm');
    expect(expandShortWeekdays('essay due by tue')).toBe('essay due by tuesday');
    expect(expandShortWeekdays('call mum sat')).toBe('call mum saturday');
    expect(expandShortWeekdays('sat down with Sam')).toBe('sat down with Sam');
    expect(expandShortWeekdays('the sun is out')).toBe('the sun is out');
  });

  it('a trailing "important" after \\ is the flag, not part of the title', () => {
    make();
    type('\\ev lunch with Sam fri 1pm important');
    press('Enter');
    const e = Object.values(useCalendarStore.getState().events)[0];
    expect(e).toMatchObject({ important: true });
    expect(e.title.toLowerCase()).toBe('lunch with sam');
    expect(tidyObjectTitle('this is important')).toBe('this is');
    expect(tidyObjectTitle('important')).toBe('important');
  });
});

describe('interpretQuery', () => {
  it('is picking until a space follows the keyword', () => {
    expect(interpretQuery('')).toMatchObject({ phase: 'picking', word: '' });
    expect(interpretQuery('remi')).toMatchObject({ phase: 'picking', word: 'remi' });
    expect(interpretQuery('typo')).toMatchObject({ phase: 'picking', matches: [] });
  });

  it('is composing once a keyword (or a unique prefix of one) is followed by a space', () => {
    expect(interpretQuery('reminder call mum')).toMatchObject({ phase: 'composing', keywordLength: 9, body: 'call mum' });
    expect(interpretQuery('rem call mum')).toMatchObject({ phase: 'composing', keywordLength: 4, body: 'call mum' });
    expect(interpretQuery('reminder ')).toMatchObject({ phase: 'composing', body: '' });
  });

  it('is not an object when the word names nothing, starts with a space, or has another backslash', () => {
    expect(interpretQuery('typo call mum')).toBeNull();
    expect(interpretQuery(' call')).toBeNull();
    expect(interpretQuery('\\')).toBeNull();
  });
});

describe('starting a session', () => {
  it('starts on a typed \\ at the start of a line or after a space', () => {
    make();
    type('\\');
    expect(session()).toMatchObject({ anchor: 2, query: '' });
    make('<p>call</p>');
    type(' \\');
    expect(session()?.query).toBe('');
  });

  it('ignores a \\ inside a word, in code, or pasted', () => {
    make('<p>C:</p>');
    type('\\');
    expect(session()).toBeNull();
    make('<pre><code>x </code></pre>');
    type('\\');
    expect(session()).toBeNull();
    make();
    editor.view.dispatch(editor.state.tr.insertText('\\').setMeta('uiEvent', 'paste'));
    expect(session()).toBeNull();
  });

  it('\\\\ leaves one literal backslash and no session', () => {
    make();
    type('\\\\');
    expect(text()).toBe('\\');
    expect(session()).toBeNull();
  });

  it('the toolbar button starts one, adding a space after a word', () => {
    make('<p>call</p>');
    insertObjectTrigger(editor.view);
    expect(text()).toBe('call \\');
    expect(session()).not.toBeNull();
  });
});

describe('during a session', () => {
  it('Escape ends it and leaves the text as typed', () => {
    make();
    type('\\rem');
    expect(press('Escape')).toBe(true);
    expect(session()).toBeNull();
    expect(text()).toBe('\\rem');
    type(' call');
    expect(session()).toBeNull();
  });

  it('moving the cursor out of it ends it', () => {
    make('<p>before </p>');
    type('\\rem');
    editor.commands.setTextSelection(3);
    expect(session()).toBeNull();
  });

  it('deleting the \\ ends it', () => {
    make();
    type('\\');
    editor.view.dispatch(editor.state.tr.delete(2, 3));
    expect(session()).toBeNull();
  });

  it('Tab picks the highlighted kind and moves on to composing', () => {
    make();
    type('\\rem');
    expect(press('Tab')).toBe(true);
    expect(text()).toBe('\\reminder ');
    expect(session()?.interp.phase).toBe('composing');
  });

  it('Enter with nothing typed after the \\ is just a new line, unless the arrows were used', () => {
    make();
    type('\\');
    press('Enter');
    expect(session()).toBeNull();
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, '|')).toBe('\\|');
    make();
    type('\\');
    press('ArrowDown');
    expect(press('Enter')).toBe(true);
    expect(text()).toBe('\\event ');   // the arrow moved to the second kind
  });

  it('typing a space after a word that names nothing ends it', () => {
    make();
    type('\\typo x');
    expect(session()).toBeNull();
  });
});

describe('creating with Enter', () => {
  it('creates the reminder, replaces what was typed with its title, linked, and drops the keyword', () => {
    make();
    type('\\reminder Call mum tomorrow 5pm');
    expect(press('Enter')).toBe(true);

    expect(reminders()).toHaveLength(1);
    const r = reminders()[0];
    expect(r).toMatchObject({ title: 'Call mum', date: '2026-10-07', time: '17:00' });
    expect(r.crossAppRefs).toEqual([{ type: 'note', id: NOTE_ID }]);
    // The date and time live in the reminder now, not in the note's text.
    expect(text()).toBe('Call mum');
    expect(linkMarks()).toEqual([{ text: 'Call mum', targetId: r.id, display: 'basic' }]);
    expect(session()).toBeNull();
    // Carrying on typing doesn't join the link.
    type(' and more');
    expect(linkMarks()[0].text).toBe('Call mum');
    expect(useToastStore.getState().current?.message).toBe('Reminder created');
  });

  it('works mid-sentence, linking only what was typed for it', () => {
    make('<p>Note:</p>');
    type(' \\rem pay rent friday');
    press('Enter');
    expect(text()).toMatch(/^Note: pay rent$/i);
    expect(linkMarks().map((m) => m.text.toLowerCase())).toEqual(['pay rent']);
  });

  it('refuses with a reason when there is nothing to create', () => {
    make();
    type('\\reminder ');
    press('Enter');
    expect(reminders()).toHaveLength(0);
    expect(session()?.error).toBeTruthy();
  });

  it('uses fields typed into the preview over what the text says', () => {
    make();
    type('\\reminder Call mum tomorrow');
    setOverride(editor.view, 'time', '9:30am');
    setOverride(editor.view, 'title', 'Ring Mum');
    press('Enter');
    expect(reminders()[0]).toMatchObject({ title: 'Ring Mum', date: '2026-10-07', time: '09:30' });
    expect(text()).toBe('Ring Mum');
  });

  it('a field it cannot read stops Enter and says which', () => {
    make();
    type('\\reminder Call mum');
    setOverride(editor.view, 'date', 'whenever');
    press('Enter');
    expect(reminders()).toHaveLength(0);
    expect(session()?.error).toMatch(/date/i);
  });

  it('nothing typed but a title in the fields: the title becomes the linked text', () => {
    make();
    type('\\reminder ');
    setOverride(editor.view, 'title', 'Water plants');
    press('Enter');
    expect(text()).toBe('Water plants');
    expect(linkMarks()[0].text).toBe('Water plants');
  });

  it("the toast's Undo removes the reminder entirely and puts the typed words back", () => {
    make();
    type('\\reminder Call mum tomorrow 5pm');
    press('Enter');
    const id = reminders()[0].id;
    useToastStore.getState().current!.actions.find((a) => a.label === 'Undo')!.onClick();
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId]).toBeUndefined();
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
    expect(linkMarks()).toEqual([]);
    expect(text()).toBe('Call mum tomorrow 5pm');
  });
});

describe('Ctrl+Enter / All options: the full pane', () => {
  it('opens the calendar pane prefilled, with the title waiting to be linked', () => {
    make();
    type('\\reminder Call mum tomorrow 5pm');
    expect(press('Enter', { ctrlKey: true })).toBe(true);
    expect(reminders()).toHaveLength(0);
    const ui = useUIStore.getState();
    expect(ui.openModal).toBe('add-calendar-item');
    expect(ui.calendarItemKind).toBe('reminder');
    expect(ui.calendarItemTitle).toBe('Call mum');
    expect(ui.calendarItemDate).toBe('2026-10-07');
    expect(text()).toBe('Call mum');
    const pending = ui.pendingArtifactLink!;
    expect(editor.state.doc.textBetween(pending.from, pending.to)).toBe('Call mum');
    expect(pending).toMatchObject({ noteId: NOTE_ID, targetType: 'reminder', replaceWithTitle: true });
  });

  // The bug reported 2026-10-06: with nothing typed after the keyword, no link was waiting, so the
  // pane made a reminder with no link back to the note and no text in it.
  it('with nothing typed, still links back: once created, its final title is put in the note, linked', () => {
    make();
    type('\\reminder ');
    press('Enter', { ctrlKey: true });
    const pending = useUIStore.getState().pendingArtifactLink!;
    expect(pending).toMatchObject({ noteId: NOTE_ID, from: pending.to, replaceWithTitle: true });
    // What the pane does on submit: create with the backlink, report the id.
    const id = useCalendarStore.getState().addReminder({ title: 'Book dentist', date: '2026-10-09', crossAppRefs: [{ type: 'note', id: NOTE_ID }] });
    applyResolvedArtifactLink(editor.view, { ...pending, resolvedTargetId: id });
    expect(text()).toBe('Book dentist');
    expect(linkMarks()).toEqual([{ text: 'Book dentist', targetId: id, display: 'basic' }]);
  });

  it('a title changed in the pane replaces the text', () => {
    make();
    type('\\reminder Call mum tomorrow');
    press('Enter', { ctrlKey: true });
    const pending = useUIStore.getState().pendingArtifactLink!;
    const id = useCalendarStore.getState().addReminder({ title: 'Ring Mum about Sunday', date: '2026-10-07' });
    applyResolvedArtifactLink(editor.view, { ...pending, resolvedTargetId: id });
    expect(text()).toBe('Ring Mum about Sunday');
    expect(linkMarks()[0].text).toBe('Ring Mum about Sunday');
  });

  it("Ctrl+Q's selection is linked as it is (no title replacement)", () => {
    make('<p>call the bank about the card</p>');
    const id = useCalendarStore.getState().addReminder({ title: 'Bank', date: '2026-10-07' });
    applyResolvedArtifactLink(editor.view, { noteId: NOTE_ID, from: 2, to: 15, targetType: 'reminder', resolvedTargetId: id });
    expect(text()).toBe('call the bank about the card');
    expect(linkMarks()[0].text).toBe('call the bank');
  });
});

describe('linked text', () => {
  const linked = (id: string, t: string, display = 'basic') =>
    `<mark data-artifact-id="${id}" data-artifact-type="reminder" data-artifact-display="${display}">${t}</mark>`;

  function seedReminder(extra: Partial<Parameters<ReturnType<typeof useCalendarStore.getState>['addReminder']>[0]> = {}): string {
    return useCalendarStore.getState().addReminder({ title: 'Call mum', date: '2026-10-07', time: '17:00', ...extra });
  }
  const part = (p: string) => editor.view.dom.querySelectorAll(`[data-artifact-part="${p}"]`);

  it('pieces of one link across paragraphs and other marks are one link', () => {
    make(`<p>${linked('r1', 'one ')}<strong>${linked('r1', 'two')}</strong></p><p>${linked('r1', 'three')}</p>`);
    const groups = collectArtifactGroups(editor.state.doc);
    expect(groups).toHaveLength(1);
    expect(groups[0].fragments).toHaveLength(3);
  });

  it('the same item linked from two places with other text between is two links', () => {
    make(`<p>${linked('r1', 'a')} between ${linked('r1', 'b')}</p>`);
    expect(collectArtifactGroups(editor.state.doc)).toHaveLength(2);
  });

  it('draws one pane per link (one head, one tail), however many lines it spans', () => {
    const id = seedReminder();
    make(`<p>${linked(id, 'one')}</p><p>${linked(id, 'two')}</p><p>${linked(id, 'three')}</p>`);
    expect(part('head')).toHaveLength(1);
    expect(part('tail')).toHaveLength(1);
    expect(part('head')[0].textContent).toContain('⏰');
    expect(part('head')[0].textContent).toContain('Reminder');
  });

  it('the inline pane shows when, and icons for important, tentative and repeating', () => {
    const id = seedReminder({ important: true, status: 'tentative', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null } });
    make(`<p>${linked(id, 'Call mum')}</p>`);
    const tail = part('tail')[0].textContent!;
    expect(tail).toContain('Tomorrow');
    expect(tail).toContain('17:00');
    expect(part('head')[0].textContent).toContain('❗');   // before the title
    expect(tail).toContain('✏️');
    expect(tail).toContain('🔁');
  });

  it('shows the live state of the item, and follows it when it changes', async () => {
    const id = seedReminder();
    make(`<p>${linked(id, 'Call mum')}</p>`);
    expect(editor.view.dom.querySelector('[data-artifact-state="done"]')).toBeNull();
    useCalendarStore.getState().setOccurrenceDone('reminder', id as CalendarReminderId, '2026-10-07', true);
    await flush();
    expect(editor.view.dom.querySelector('[data-artifact-state="done"]')).not.toBeNull();
    useCalendarStore.getState().deleteReminder(id as CalendarReminderId);
    await flush();
    expect(editor.view.dom.querySelector('[data-artifact-state="missing"]')).not.toBeNull();
  });

  it('expanded: one pane — the paragraph becomes the box, and the body is inside it', async () => {
    const id = seedReminder({ notes: 'Ask about Sunday', links: ['https://example.com/plan'] });
    make(`<p>${linked(id, 'Call mum')}</p>`);
    setArtifactDisplay(editor.view, `reminder:${id}`, 0, 'expanded');
    expect(linkMarks().map((m) => m.display)).toEqual(['expanded']);
    await flush();
    const pane = editor.view.dom.querySelector('[data-artifact-pane="expanded"]')!;
    const body = part('body')[0] as HTMLElement;
    // Same box: the body is inside the paragraph that holds the heading.
    expect(pane.contains(body)).toBe(true);
    expect(pane.contains(part('head')[0])).toBe(true);
    // Top bar: icon, kind, title — the date and time move to the second heading line, under it.
    expect(part('tail')[0].textContent).not.toContain('Tomorrow');
    const [subheading, content] = [...body.firstElementChild!.children] as HTMLElement[];
    expect(subheading.textContent).toContain('Tomorrow');
    expect(subheading.textContent).toContain('17:00');
    // Then the content: notes and links, unlabelled.
    expect(content.textContent).toContain('Ask about Sunday');
    expect(content.textContent).toContain('example.com');
    expect(body.textContent).not.toMatch(/Notes:|Links:|Date|Time/);
    setArtifactDisplay(editor.view, `reminder:${id}`, 0, 'basic');
    expect(part('body')).toHaveLength(0);
    expect(editor.view.dom.querySelector('[data-artifact-pane]')).toBeNull();
  });

  it('clicking the heading (not a control) expands and collapses; the done box sits in the icon slot', () => {
    const id = seedReminder();
    make(`<p>${linked(id, 'Call mum')}</p>`);
    (part('head')[0] as HTMLElement).click();
    expect(linkMarks()[0].display).toBe('expanded');
    (part('tail')[0] as HTMLElement).click();
    expect(linkMarks()[0].display).toBe('basic');
    // No checkbox at the end any more; it's the icon's slot in the head (shown on hover by CSS).
    expect(part('tail')[0].textContent).not.toMatch(/☐|☑/);
    const head = part('head')[0] as HTMLElement;
    expect(head.dataset.canDone).toBe('1');
    head.querySelector<HTMLElement>('[title="Mark done"]')!.click();
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].doneDates).toEqual(['2026-10-07']);
    expect(linkMarks()[0].display).toBe('basic');
  });

  it('hovering any part of a link marks its head, so the icon can turn into the done box', () => {
    const id = seedReminder();
    make(`<p>${linked(id, 'Call mum')}</p>`);
    const text = editor.view.dom.querySelector('[data-artifact-state]')!;
    text.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect((part('head')[0] as HTMLElement).dataset.hover).toBe('1');
    editor.view.dom.dispatchEvent(new MouseEvent('mouseleave'));
    expect((part('head')[0] as HTMLElement).dataset.hover).toBeUndefined();
  });

  it('expanded: Important sits before the title, the other active options in the second heading line; a click removes either, and it comes back greyed at the bottom', async () => {
    const id = seedReminder({ important: true, status: 'tentative' });
    make(`<p>${linked(id, 'Call mum', 'expanded')}</p>`);
    await flush();
    const tail = () => part('tail')[0] as HTMLElement;
    const body = () => part('body')[0] as HTMLElement;
    const bottom = () => body().firstElementChild!.lastElementChild as HTMLElement;
    expect(part('head')[0].textContent).toContain('❗');
    expect(tail().textContent).not.toContain('✏️');
    const tentative = [...body().querySelectorAll('button')].find((b) => b.textContent === '✏️')!;
    expect(bottom().textContent).not.toContain('Tentative');
    act(() => { fireEvent.click(tentative); });
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].status).toBe('confirmed');
    await flush();
    expect(bottom().textContent).toContain('Tentative');
    (part('head')[0] as HTMLElement).querySelector<HTMLElement>('[title="Important — click to remove"]')!.click();
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].important).toBe(false);
    await flush();
    expect(part('head')[0].textContent).not.toContain('❗');
    expect(bottom().textContent).toContain('Important');
  });

  it('expanded: the place sits in the second heading line, not the bottom', async () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Lunch', date: '2026-10-07', startTime: '13:00', endTime: '14:00', location: 'The Fat Duck' });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="event" data-artifact-display="expanded">Lunch</mark></p>`);
    await flush();
    const [subheading] = [...(part('body')[0] as HTMLElement).firstElementChild!.children] as HTMLElement[];
    expect(subheading.textContent).toContain('13:00–14:00');
    expect(subheading.textContent).toContain('The Fat Duck');
  });

  it('options come from one list: greyed in the expanded body while off, and in the right-click menu', async () => {
    const id = seedReminder();
    const items = flagMenuItems(ARTIFACT_TYPES.reminder!.flags!(id));
    expect(items.map((i) => i.id)).toEqual(['important', 'tentative', 'repeat']);
    make(`<p>${linked(id, 'Call mum', 'expanded')}</p>`);
    await flush();
    const body = part('body')[0] as HTMLElement;
    const option = (label: string) => [...body.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
    act(() => { fireEvent.click(option('Important')!); });
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].important).toBe(true);
    // Repeat asks how often.
    act(() => { fireEvent.click(option('Repeat')!); });
    act(() => { fireEvent.click([...body.querySelectorAll('[role="option"]')].find((b) => b.textContent === 'Every week')!); });
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].repeat?.freq).toBe('weekly');
    await flush();
    // On now: shown in the heading, gone from the body.
    expect(part('head')[0].textContent).toContain('❗');
    expect(option('Important')).toBeUndefined();
  });

  it('a deadline shows when it notifies (it always does); a timed reminder has no such chip', async () => {
    const dl = useCalendarStore.getState().addDeadline({ title: 'Essay', date: '2026-10-09' });
    make(`<p><mark data-artifact-id="${dl}" data-artifact-type="deadline" data-artifact-display="expanded">Essay</mark></p>`);
    await flush();
    expect(part('body')[0].textContent).toContain('1 day before');
    expect(part('head')[0].textContent).toContain('🏁');
    const rem = seedReminder();
    make(`<p>${linked(rem, 'Call mum', 'expanded')}</p>`);
    await flush();
    expect(part('body')[0].textContent).not.toContain('before');
  });

  it('the date and time in the heading are click-to-edit, read like `\\` reads them', async () => {
    const id = seedReminder();
    make(`<p>${linked(id, 'Call mum')}</p>`);
    const editPart = (label: string, value: string, key = 'Enter') => {
      const span = [...part('tail')[0].querySelectorAll('span')].find((s) => s.textContent === label)!;
      span.click();
      const input = part('tail')[0].querySelector('input')!;
      input.value = value;
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      return input;
    };
    editPart('17:00', '9:30am');
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].time).toBe('09:30');
    await flush();
    editPart('Tomorrow', '12 oct');
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].date).toMatch(/-10-12$/);
    await flush();
    editPart('09:30', 'whenever');
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].time).toBe('09:30');
    // Kept open, outlined, for fixing.
    expect(part('tail')[0].querySelector('input')?.className).toMatch(/paneInputInvalid/);
  });

  it('the body edits by clicking: notes become a text box, saved on leaving it', async () => {
    const id = seedReminder({ notes: 'Ask about Sunday' });
    make(`<p>${linked(id, 'Call mum')}</p>`);
    setArtifactDisplay(editor.view, `reminder:${id}`, 0, 'expanded');
    await flush();
    const body = part('body')[0] as HTMLElement;
    act(() => { fireEvent.click(body.querySelector('[title="Click to edit"]')!); });
    const box = body.querySelector('textarea')!;
    act(() => { fireEvent.change(box, { target: { value: 'Ask about Sunday lunch' } }); });
    act(() => { fireEvent.blur(box); });
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].notes).toBe('Ask about Sunday lunch');
  });

  it('the title is editable text: End stays on an expanded heading, and typing there extends it', () => {
    const id = seedReminder();
    make(`<p>${linked(id, 'Call mum', 'expanded')}</p><p>next</p>`);
    editor.commands.setTextSelection(4);
    expect(press('End')).toBe(true);
    type('!');
    expect(linkMarks()[0].text).toBe('Call mum!');
    expect(text()).toBe('Call mum!next');
  });

  // Found in the app 2026-10-06: Enter at the end of a title carried the link onto the next line.
  it('Enter at the end of a title starts a plain line, whether just created or edited later', () => {
    make();
    type('\\reminder Call mum tomorrow');
    press('Enter');
    press('Enter');
    type('Plain text');
    expect(linkMarks().map((m) => m.text)).toEqual(['Call mum']);
    editor.commands.setTextSelection(2 + 'Call mum'.length);   // the end of the title, clicked later
    type('!');
    press('Enter');
    type('More plain');
    expect(linkMarks().map((m) => m.text)).toEqual(['Call mum!']);
  });

  it('a whole-day item is overdue only once its day is over', () => {
    const today = todayIso();
    const add = (date: string) => useCalendarStore.getState().addReminder({ title: 'x', date });
    expect(ARTIFACT_TYPES.reminder!.summarize(add(today))!.state).toBe('open');
    expect(ARTIFACT_TYPES.reminder!.summarize(add(addDaysToIso(today, -1)))!.state).toBe('overdue');
  });

  it('old links without a display load as inline', () => {
    make('<p><mark data-artifact-id="r1" data-artifact-type="task">x</mark></p>');
    expect(linkMarks()[0].display).toBe('basic');
  });
});

describe('defaults and events', () => {
  const events = () => Object.values(useCalendarStore.getState().events);

  it('a reminder that says nothing about when is tomorrow at midday; a date alone is a whole day', () => {
    make();
    type('\\rem call the bank');
    press('Enter');
    expect(reminders()[0]).toMatchObject({ title: 'call the bank', date: '2026-10-07', time: '12:00' });
    make();
    type('\\rem pay rent friday');
    press('Enter');
    expect(reminders().find((r) => r.title.toLowerCase() === 'pay rent')).toMatchObject({ date: '2026-10-09', time: null });
  });

  it('\\event reads a time range and a meeting link, and creates a linked event', () => {
    make();
    type('\\event lunch with Sam fri 1-2pm https://meet.example.com/abc');
    expect(press('Enter')).toBe(true);
    expect(events()).toHaveLength(1);
    const e = events()[0];
    expect(e).toMatchObject({ date: '2026-10-09', startTime: '13:00', endTime: '14:00', location: 'https://meet.example.com/abc' });
    expect(e.title.toLowerCase()).toBe('lunch with sam');
    expect(e.crossAppRefs).toEqual([{ type: 'note', id: NOTE_ID }]);
    expect(linkMarks()).toEqual([{ text: e.title, targetId: e.id, display: 'basic' }]);
  });

  it('an event that says nothing about when is tomorrow 12:00–13:00; a start alone gets an hour', () => {
    make();
    type('\\ev standup');
    press('Enter');
    expect(events()[0]).toMatchObject({ date: '2026-10-07', startTime: '12:00', endTime: '13:00' });
    make();
    type('\\event dentist tomorrow 3pm');
    press('Enter');
    expect(events().find((e) => e.title.toLowerCase() === 'dentist')).toMatchObject({ startTime: '15:00', endTime: '16:00' });
  });

  it("an event's heading shows the range; editing its start keeps its length", async () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Lunch', date: '2026-10-07', startTime: '13:00', endTime: '14:30' });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="event">Lunch</mark></p>`);
    const tail = () => editor.view.dom.querySelector('[data-artifact-part="tail"]')!;
    expect(tail().textContent).toContain('13:00–14:30');
    expect(ARTIFACT_TYPES.event!.editWhen!(id, 'time', '4pm')).toBe(true);
    expect(useCalendarStore.getState().events[id as never]).toMatchObject({ startTime: '16:00', endTime: '17:30' });
    expect(ARTIFACT_TYPES.event!.editWhen!(id, 'time', '9-10am')).toBe(true);
    expect(useCalendarStore.getState().events[id as never]).toMatchObject({ startTime: '09:00', endTime: '10:00' });
  });

  it("an event's body: the place, the options, and an opt-in notification", async () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Lunch', date: '2026-10-07', startTime: '13:00', location: 'The Fat Duck' });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="event" data-artifact-display="expanded">Lunch</mark></p>`);
    await flush();
    const body = editor.view.dom.querySelector<HTMLElement>('[data-artifact-part="body"]')!;
    expect(body.textContent).toContain('The Fat Duck');
    const notify = [...body.querySelectorAll('button')].find((b) => b.textContent?.includes('Notify me'))!;
    act(() => { fireEvent.click(notify); });
    expect(useCalendarStore.getState().events[id as never]).toMatchObject({ notifyBeforeValue: 1, notifyBeforeUnit: 'hours' });
  });
});

describe('every kind, the whole way through', () => {
  // A new kind must work end to end with nothing else touched: created from `\`, linked, drawn as
  // a pane from ARTIFACT_TYPES, and listed in the note's "Linked from" bar (deadlines once weren't).
  for (const kind of NOTE_OBJECT_KINDS) {
    it(`\\${kind.id}: created, linked, drawn, and listed in Linked from`, () => {
      make();
      type(`\\${kind.id} check the boiler tomorrow 3pm`);
      expect(press('Enter')).toBe(true);
      const [link] = linkMarks();
      expect(link?.text.toLowerCase()).toBe('check the boiler');
      const summary = ARTIFACT_TYPES[kind.targetType]!.summarize(link.targetId);
      expect(summary?.dateLabel).toBe('Tomorrow');
      expect(editor.view.dom.querySelector('[data-artifact-part="head"]')?.textContent).toContain(kind.label);
      expect(getNoteBacklinks(NOTE_ID).map((b) => `${b.type}:${b.id}`)).toContain(`${kind.targetType}:${link.targetId}`);
    });
  }
});

describe('deadlines', () => {
  const deadlines = () => Object.values(useCalendarStore.getState().deadlines);

  it('\\deadline reads what is due and when; nothing about when is tomorrow at midday', () => {
    make();
    type('\\deadline essay due fri 5pm');
    press('Enter');
    expect(deadlines()[0]).toMatchObject({ date: '2026-10-09', time: '17:00', crossAppRefs: [{ type: 'note', id: NOTE_ID }] });
    expect(deadlines()[0].title.toLowerCase()).toBe('essay');
    make();
    type('\\dl tax return');
    press('Enter');
    expect(deadlines().find((d) => d.title.toLowerCase() === 'tax return')).toMatchObject({ date: '2026-10-07', time: '12:00' });
  });

  it('its pane is the same as a reminder\'s: done in the icon slot, the options, its notify setting', async () => {
    const id = useCalendarStore.getState().addDeadline({ title: 'Essay', date: '2026-10-09', time: '17:00' });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="deadline" data-artifact-display="expanded">Essay</mark></p>`);
    await flush();
    const head = editor.view.dom.querySelector<HTMLElement>('[data-artifact-part="head"]')!;
    expect(head.textContent).toContain('🏁');
    expect(head.dataset.canDone).toBe('1');
    const body = editor.view.dom.querySelector<HTMLElement>('[data-artifact-part="body"]')!;
    expect(body.textContent).toContain('1 day before');
    expect(body.textContent).toContain('Important');
  });
});

describe('the pane, fifth round', () => {
  it('an event that has ended is "past" (drawn faded); a repeating one never is; done shows no word', () => {
    const ended = useCalendarStore.getState().addEvent({ title: 'Old', date: '2020-01-01', startTime: '10:00', endTime: '11:00' });
    const series = useCalendarStore.getState().addEvent({ title: 'Weekly', date: '2020-01-01', startTime: '10:00', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null } });
    expect(ARTIFACT_TYPES.event!.summarize(ended)!.state).toBe('past');
    expect(ARTIFACT_TYPES.event!.summarize(series)!.state).toBe('open');
    const rem = useCalendarStore.getState().addReminder({ title: 'Done one', date: '2026-10-07' });
    useCalendarStore.getState().setOccurrenceDone('reminder', rem as CalendarReminderId, '2026-10-07', true);
    make(`<p><mark data-artifact-id="${rem}" data-artifact-type="reminder">Done one</mark></p>`);
    expect(editor.view.dom.querySelector('[data-artifact-part="tail"]')!.textContent).not.toContain('Done');
    expect(editor.view.dom.querySelector('[data-artifact-state="done"]')).not.toBeNull();
  });

  it("a click on the expanded box's empty space, or its second line's, collapses it", async () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Call mum', date: '2026-10-07', time: '17:00' });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="reminder" data-artifact-display="expanded">Call mum</mark></p>`);
    await flush();
    (editor.view.dom.querySelector('[data-artifact-pane]') as HTMLElement).click();
    expect(linkMarks()[0].display).toBe('basic');
    setArtifactDisplay(editor.view, `reminder:${id}`, 0, 'expanded');
    await flush();
    const subheading = (editor.view.dom.querySelector('[data-artifact-part="body"]') as HTMLElement).firstElementChild!.firstElementChild as HTMLElement;
    act(() => { fireEvent.click(subheading); });
    expect(linkMarks()[0].display).toBe('basic');
  });

  it('↗ and the chevron sit together, so an expanded pane can right-align them', () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Call mum', date: '2026-10-07' });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="reminder">Call mum</mark></p>`);
    const open = editor.view.dom.querySelector('[data-artifact-part="tail"] [title="Open"]')!;
    expect(open.parentElement!.textContent).toBe('↗▾');
  });
});

describe('repeating items', () => {
  const weekly = { freq: 'weekly' as const, interval: 1, endKind: 'forever' as const, count: null, until: null };
  const today = todayIso();

  it('the pane shows the current occurrence; ticking it moves on to the next', () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: addDaysToIso(today, -14), time: '08:00', repeat: weekly });
    const def = ARTIFACT_TYPES.reminder!;
    const first = def.summarize(id)!;
    expect(first.repeats).toBe(true);
    expect(first.occurrence! >= today).toBe(true);
    expect(first.done).toBe(false);
    def.toggleDone!(id);
    const second = def.summarize(id)!;
    expect(second.occurrence).toBe(addDaysToIso(first.occurrence!, 7));
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].doneDates).toContain(first.occurrence);
  });

  it('lists its dates around the current one, each tickable and openable', () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: addDaysToIso(today, -14), repeat: weekly });
    const list = ARTIFACT_TYPES.reminder!.occurrences!(id)!;
    expect(list.rule).toBe('Every week');
    expect(list.items.filter((o) => o.current)).toHaveLength(1);
    expect(list.items.some((o) => o.past)).toBe(true);
    const later = list.items[list.items.length - 1];
    ARTIFACT_TYPES.reminder!.toggleOccurrenceDone!(id, later.date);
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].doneDates).toEqual([later.date]);
    openArtifactTarget('reminder', id, later.date);
    expect(useUIStore.getState()).toMatchObject({ editingCalendarReminderId: id, editingCalendarReminderOccurrence: later.date });
    expect(ARTIFACT_TYPES.reminder!.occurrences!(useCalendarStore.getState().addReminder({ title: 'Once', date: today }))).toBeNull();
  });

  it('a click on a repeating date in the inline pane expands it with the list of dates open', async () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: today, repeat: weekly });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="reminder">Bins</mark></p>`);
    const date = editor.view.dom.querySelector<HTMLElement>('[data-artifact-part="tail"] [title="See its dates"]')!;
    date.click();
    await flush();
    expect(linkMarks()[0].display).toBe('expanded');
    const list = editor.view.dom.querySelector('[data-artifact-part="body"] [role="listbox"]');
    expect(list?.textContent).toContain('Every week');
    expect(list?.querySelectorAll('[role="option"]').length).toBeGreaterThan(3);
  });

  // Found in the app 2026-10-06: ticking the current date from the list closed the list (the body
  // was rebuilt behind it). Its UI state now outlives a rebuild (paneState.ts).
  it('ticking the current date from the list keeps the list open, and the pane moves on', async () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: today, repeat: weekly });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="reminder">Bins</mark></p>`);
    editor.view.dom.querySelector<HTMLElement>('[data-artifact-part="tail"] [title="See its dates"]')!.click();
    await flush();
    const list = () => editor.view.dom.querySelector('[data-artifact-part="body"] [role="listbox"]');
    const current = list()!.querySelector<HTMLElement>('[aria-selected="true"] [title="Mark done"]')!;
    act(() => { fireEvent.click(current); });
    await flush();
    expect(list()).not.toBeNull();
    expect(list()!.querySelector('[aria-selected="true"]')!.textContent).not.toContain('Today');
  });

  it('a date taken out of the series shows in its list at the date it replaces, marked changed, opening the separate item', () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: today, time: '08:00', repeat: weekly });
    const replaced = addDaysToIso(today, 14);
    const copy = useCalendarStore.getState().detachReminderOccurrence(id as CalendarReminderId, replaced)!;
    useCalendarStore.getState().updateReminder(copy, { date: addDaysToIso(replaced, 1), time: '09:00' });
    const items = ARTIFACT_TYPES.reminder!.occurrences!(id)!.items;
    const changed = items.find((o) => o.changedId === copy)!;
    expect(changed.date).toBe(replaced);
    expect(changed.label).toContain('09:00');
    expect(items.filter((o) => o.date === replaced)).toHaveLength(1);   // the series' own date is gone (an exception)
    openArtifactTarget('reminder', changed.changedId!);
    expect(useUIStore.getState().editingCalendarReminderId).toBe(copy);
  });

  it('turning repeat off asks first, and only goes ahead on yes', async () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: today, repeat: weekly });
    const repeat = () => ARTIFACT_TYPES.reminder!.flags!(id).find((f) => f.id === 'repeat')!;
    repeat().toggle();
    await flush();
    let asked = useDialogStore.getState().queue[0];
    expect(asked.title).toBe('Stop repeating?');
    asked.resolve('cancel');
    useDialogStore.setState({ queue: [] });
    await flush();
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].repeat).not.toBeNull();
    repeat().toggle();
    await flush();
    asked = useDialogStore.getState().queue[0];
    asked.resolve('confirm');
    await flush();
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].repeat).toBeNull();
  });

  it('Important sits before the title, in both views', async () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: today, important: true });
    make(`<p><mark data-artifact-id="${id}" data-artifact-type="reminder">Bins</mark></p>`);
    const head = () => editor.view.dom.querySelector('[data-artifact-part="head"]')!;
    const tail = () => editor.view.dom.querySelector('[data-artifact-part="tail"]')!;
    expect(head().textContent).toContain('❗');
    expect(tail().textContent).not.toContain('❗');
    setArtifactDisplay(editor.view, `reminder:${id}`, 0, 'expanded');
    await flush();
    expect(head().textContent).toContain('❗');
    head().querySelector<HTMLElement>('[title="Important — click to remove"]')!.click();
    expect(useCalendarStore.getState().reminders[id as CalendarReminderId].important).toBe(false);
  });
});
