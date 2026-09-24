import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore, MAX_SECTION_HISTORY, CALENDAR_LAST_EDITING_TTL_MS } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
});

describe('setActiveView — back/forward history (browser semantics)', () => {
  it('a normal ("push") navigation records where we came from and clears the forward stack', () => {
    useUIStore.getState().setActiveView('calendar');
    expect(useUIStore.getState().sectionHistory).toEqual([{ view: 'tasks' }]);

    useUIStore.getState().setActiveView('notes');
    expect(useUIStore.getState().sectionHistory).toEqual([{ view: 'calendar' }, { view: 'tasks' }]);
    expect(useUIStore.getState().sectionForwardHistory).toEqual([]);
  });

  it('navigating to the current section is a no-op', () => {
    useUIStore.getState().setActiveView('calendar');
    const before = useUIStore.getState();
    useUIStore.getState().setActiveView('calendar');
    expect(useUIStore.getState().sectionHistory).toEqual(before.sectionHistory);
  });

  it('navigateBack pops the back stack, switches section, and pushes onto the FORWARD stack', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().setActiveView('notes');

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().activeView).toBe('calendar');
    expect(useUIStore.getState().sectionHistory).toEqual([{ view: 'tasks' }]);
    expect(useUIStore.getState().sectionForwardHistory).toEqual([{ view: 'notes' }]);
  });

  it('navigateForward pops the forward stack, switches section, and pushes onto the BACK stack', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().navigateBack(); // back to tasks; forward now has [calendar]

    useUIStore.getState().navigateForward();
    expect(useUIStore.getState().activeView).toBe('calendar');
    expect(useUIStore.getState().sectionForwardHistory).toEqual([]);
    expect(useUIStore.getState().sectionHistory).toEqual([{ view: 'tasks' }]);
  });

  it('a fresh push after going back clears the forward stack, same as a browser', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().navigateBack(); // forward: [calendar]
    useUIStore.getState().setActiveView('records'); // a genuinely new navigation
    expect(useUIStore.getState().sectionForwardHistory).toEqual([]);
  });

  it('navigateBack/navigateForward on an empty stack does nothing', () => {
    const before = useUIStore.getState().activeView;
    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().activeView).toBe(before);
    useUIStore.getState().navigateForward();
    expect(useUIStore.getState().activeView).toBe(before);
  });

  it(`the back stack is capped at MAX_SECTION_HISTORY (${MAX_SECTION_HISTORY})`, () => {
    const views: Array<'tasks' | 'calendar' | 'records' | 'lists' | 'notes' | 'portfolio' | 'fitness'> =
      ['calendar', 'records', 'lists', 'notes', 'portfolio', 'fitness', 'tasks', 'calendar'];
    for (const v of views) useUIStore.getState().setActiveView(v);
    expect(useUIStore.getState().sectionHistory.length).toBe(MAX_SECTION_HISTORY);
  });
});

describe('setActiveView — Calendar last-edited pane memory (30-min TTL)', () => {
  it('leaving Calendar with an event pane open remembers it, and returning within the TTL reopens it', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().openCalendarEventPane('evt-1');
    useUIStore.getState().setActiveView('tasks');
    expect(useUIStore.getState().editingCalendarEventId).toBeNull();
    expect(useUIStore.getState().calendarLastEditing).toEqual({ type: 'event', id: 'evt-1', at: expect.any(String) });

    useUIStore.getState().setActiveView('calendar');
    expect(useUIStore.getState().editingCalendarEventId).toBe('evt-1');
  });

  it('remembers a reminder pane the same way', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().openCalendarReminderPane('rem-1');
    useUIStore.getState().setActiveView('records');
    useUIStore.getState().setActiveView('calendar');
    expect(useUIStore.getState().editingCalendarReminderId).toBe('rem-1');
    expect(useUIStore.getState().editingCalendarEventId).toBeNull();
  });

  it('does not reopen the pane once the memory is older than the TTL', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().openCalendarEventPane('evt-stale');
    useUIStore.getState().setActiveView('tasks');

    const stale = useUIStore.getState().calendarLastEditing!;
    useUIStore.setState({
      calendarLastEditing: { ...stale, at: new Date(Date.now() - CALENDAR_LAST_EDITING_TTL_MS - 1000).toISOString() },
    });

    useUIStore.getState().setActiveView('calendar');
    expect(useUIStore.getState().editingCalendarEventId).toBeNull();
    // The stale memory itself is left alone (not cleared) — only reopening is gated by freshness.
    expect(useUIStore.getState().calendarLastEditing?.id).toBe('evt-stale');
  });

  it('no memory is recorded when no pane was open on leaving Calendar', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().setActiveView('tasks');
    expect(useUIStore.getState().calendarLastEditing).toBeNull();
  });

  it('staying inside Calendar (e.g. opening a different pane) does not touch the remembered value', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().openCalendarEventPane('evt-1');
    useUIStore.getState().setActiveView('tasks');
    useUIStore.getState().setActiveView('calendar'); // reopens evt-1, sets calendarLastEditing again
    useUIStore.getState().closeCalendarEventPane();
    // Closing the pane while still in Calendar doesn't erase the memory — "last edited"
    // persists until superseded by opening a different one, not "currently open".
    expect(useUIStore.getState().calendarLastEditing?.id).toBe('evt-1');
  });
});

describe('setActiveView — Tasks last-edited pane memory (no TTL)', () => {
  it('leaving Tasks with a pane open remembers it, and returning reopens it', () => {
    useUIStore.getState().setActiveView('tasks');
    useUIStore.getState().openTaskPane('task-1');
    useUIStore.getState().setActiveView('calendar');
    expect(useUIStore.getState().editingTaskId).toBeNull();
    expect(useUIStore.getState().tasksLastEditingTaskId).toBe('task-1');

    useUIStore.getState().setActiveView('tasks');
    expect(useUIStore.getState().editingTaskId).toBe('task-1');
  });
});

describe("openNote / navigateBack / navigateForward — Notes' own note-level stack", () => {
  it('walks back through several visited notes in the order they were left (note-level stops only — tab-level "last tab per note" restoration is notesTabMemory, tested separately)', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.openNote('note1'); // tab switches within a note never call openNote — no stops from those
    s.openNote('note2');
    s.openNote('note3');
    expect(useUIStore.getState().editingNoteId).toBe('note3');
    expect(useUIStore.getState().notesHistory).toEqual([{ noteId: 'note2' }, { noteId: 'note1' }]);

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note2');
    expect(useUIStore.getState().notesHistory).toEqual([{ noteId: 'note1' }]);
    expect(useUIStore.getState().notesForwardHistory).toEqual([{ noteId: 'note3' }]);

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note1');
    expect(useUIStore.getState().notesHistory).toEqual([]);
    expect(useUIStore.getState().notesForwardHistory).toEqual([{ noteId: 'note2' }, { noteId: 'note3' }]);
  });

  it('navigateForward retraces the same path back', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.openNote('note1');
    s.openNote('note2');
    s.openNote('note3');
    s.navigateBack();
    s.navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note1');

    useUIStore.getState().navigateForward();
    expect(useUIStore.getState().editingNoteId).toBe('note2');
    expect(useUIStore.getState().notesHistory).toEqual([{ noteId: 'note1' }]);
    expect(useUIStore.getState().notesForwardHistory).toEqual([{ noteId: 'note3' }]);

    useUIStore.getState().navigateForward();
    expect(useUIStore.getState().editingNoteId).toBe('note3');
    expect(useUIStore.getState().notesHistory).toEqual([{ noteId: 'note2' }, { noteId: 'note1' }]);
    expect(useUIStore.getState().notesForwardHistory).toEqual([]);
  });

  it('once the note-stack is exhausted, navigateBack falls through to leaving the section', () => {
    const s = useUIStore.getState();
    s.setActiveView('records'); // establishes a section to fall back to
    s.setActiveView('notes');
    s.openNote('note1');
    expect(useUIStore.getState().notesHistory).toEqual([]); // first note opened — nothing to push back from

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().activeView).toBe('records');
  });

  it('re-opening the note that is already open does not push a stop', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.openNote('note1');
    s.openNote('note1');
    expect(useUIStore.getState().notesHistory).toEqual([]);
  });

  it('opening a genuinely new note clears the forward stack, same as a normal push', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.openNote('note1');
    s.openNote('note2');
    s.navigateBack(); // forward: [note2]
    expect(useUIStore.getState().notesForwardHistory).toEqual([{ noteId: 'note2' }]);

    useUIStore.getState().openNote('note3'); // a genuinely new navigation, not a back/forward step
    expect(useUIStore.getState().notesForwardHistory).toEqual([]);
  });

  it("the note-stack survives leaving Notes for another section and coming back via a normal nav click (not Alt+Left/Right)", () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.openNote('note1');
    s.openNote('note2');
    s.setActiveView('tasks');
    s.setActiveView('notes'); // ordinary re-entry, restores note2 via notesLastEditingNoteId
    expect(useUIStore.getState().editingNoteId).toBe('note2');
    expect(useUIStore.getState().notesHistory).toEqual([{ noteId: 'note1' }]);

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note1');
  });

  // Regression: a note switch that goes through a DIFFERENT notebook in between (the real
  // reported bug, 2026-09-25) — setSelectedNoteTag nulls editingNoteId directly when the
  // notebook changes, so by the time openNote ran for the second note, openNote's own
  // prevId (read from s.editingNoteId) was already null and had nothing to push. The note
  // being left must be captured at the moment it's actually left, not only inside openNote.
  it('switching to a different notebook in between two notes still pushes a stop for the note that was open', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.setSelectedNoteTag('notebookA' as never);
    s.openNote('note1');
    s.setSelectedNoteTag('notebookB' as never); // switching notebooks closes the open note
    expect(useUIStore.getState().editingNoteId).toBeNull();
    expect(useUIStore.getState().notesHistory).toEqual([{ noteId: 'note1' }]);

    useUIStore.getState().openNote('note2');
    expect(useUIStore.getState().editingNoteId).toBe('note2');
    expect(useUIStore.getState().notesHistory).toEqual([{ noteId: 'note1' }]); // not duplicated

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note1');
  });

  it('closeNote() (deselecting a note, e.g. Escape) also pushes a stop for the note that was open', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.openNote('note1');
    s.closeNote();
    expect(useUIStore.getState().editingNoteId).toBeNull();
    expect(useUIStore.getState().notesHistory).toEqual([{ noteId: 'note1' }]);

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note1');
  });
});

describe('openNote — keeps the notebook tree in sync with whatever note is actually shown', () => {
  // Reported 2026-09-25: navigating back through notes (via the stack above) correctly
  // reopened the right note, but the tree stayed showing whichever notebook was selected
  // before — because nothing updated selectedNoteTagId/expandedNoteTagIds when a note was
  // opened via anything other than clicking it from within its own already-selected notebook.
  it('opening a note in a DIFFERENT notebook updates selectedNoteTagId to that notebook', () => {
    const notebookA = useNoteStore.getState().addNoteTag({ name: 'A', kind: 'area' });
    const notebookB = useNoteStore.getState().addNoteTag({ name: 'B', kind: 'area' });
    const noteA = useNoteStore.getState().addNote({ title: 'Note A', tagIds: [notebookA] });
    const noteB = useNoteStore.getState().addNote({ title: 'Note B', tagIds: [notebookB] });

    useUIStore.getState().setSelectedNoteTag(notebookA);
    useUIStore.getState().openNote(noteA);
    expect(useUIStore.getState().selectedNoteTagId).toBe(notebookA);

    // Jump straight to note B without going through "select notebook B first" — the way
    // Alt+Left/Right, Quick Access, and cross-app links all open a note.
    useUIStore.getState().openNote(noteB);
    expect(useUIStore.getState().selectedNoteTagId).toBe(notebookB);
  });

  it("navigating BACK to a note in a different notebook also re-syncs the tree, not just the editor", () => {
    const notebookA = useNoteStore.getState().addNoteTag({ name: 'A', kind: 'area' });
    const notebookB = useNoteStore.getState().addNoteTag({ name: 'B', kind: 'area' });
    const noteA = useNoteStore.getState().addNote({ title: 'Note A', tagIds: [notebookA] });
    const noteB = useNoteStore.getState().addNote({ title: 'Note B', tagIds: [notebookB] });

    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().setSelectedNoteTag(notebookA);
    useUIStore.getState().openNote(noteA);
    useUIStore.getState().setSelectedNoteTag(notebookB);
    useUIStore.getState().openNote(noteB);
    expect(useUIStore.getState().selectedNoteTagId).toBe(notebookB);

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe(noteA);
    expect(useUIStore.getState().selectedNoteTagId).toBe(notebookA);
  });

  it('expands every collapsed ancestor of the target notebook, so its row is actually visible in the tree', () => {
    const parent = useNoteStore.getState().addNoteTag({ name: 'Parent', kind: 'area' });
    const child  = useNoteStore.getState().addNoteTag({ name: 'Child', kind: 'area', parentTagId: parent });
    const note   = useNoteStore.getState().addNote({ title: 'Nested note', tagIds: [child] });

    expect(useUIStore.getState().expandedNoteTagIds).toEqual([]);
    useUIStore.getState().openNote(note);
    expect(useUIStore.getState().expandedNoteTagIds).toContain(parent);
  });

  it('a note with no notebook tag at all leaves the current tree selection alone', () => {
    const notebookA = useNoteStore.getState().addNoteTag({ name: 'A', kind: 'area' });
    const orphanNote = useNoteStore.getState().addNote({ title: 'No notebook' });

    useUIStore.getState().setSelectedNoteTag(notebookA);
    useUIStore.getState().openNote(orphanNote);
    expect(useUIStore.getState().selectedNoteTagId).toBe(notebookA);
  });
});
