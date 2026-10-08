import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore, CALENDAR_LAST_EDITING_TTL_MS } from '@/store/uiStore';
import { MAX_NAV_HISTORY, placeKey, travel } from '@/store/navHistory';
import { useNoteStore } from '@/store/noteStore';

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
});

const back = () => useUIStore.getState().navHistory.map(placeKey);
const fwd = () => useUIStore.getState().navForward.map(placeKey);

describe('history — one back/forward stack of places (browser semantics)', () => {
  it('a normal navigation records where we came from and clears the forward stack', () => {
    useUIStore.getState().setActiveView('calendar');
    expect(back()).toEqual(['tasks']);
    useUIStore.getState().setActiveView('notes');
    expect(back()).toEqual(['calendar', 'tasks']);
    expect(fwd()).toEqual([]);
  });

  it('navigating to the current section is a no-op', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().setActiveView('calendar');
    expect(back()).toEqual(['tasks']);
  });

  it('back and forward move between the stacks', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().setActiveView('records');
    expect(useUIStore.getState().navigateBack()).toBe(true);
    expect(useUIStore.getState().activeView).toBe('calendar');
    expect(back()).toEqual(['tasks']);
    expect(fwd()).toEqual(['records']);
    useUIStore.getState().navigateForward();
    expect(useUIStore.getState().activeView).toBe('records');
    expect(back()).toEqual(['calendar', 'tasks']);
    expect(fwd()).toEqual([]);
  });

  it('a fresh navigation after going back clears the forward stack', () => {
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().navigateBack();
    useUIStore.getState().setActiveView('records');
    expect(fwd()).toEqual([]);
  });

  it('on an empty stack nothing moves, and navigateBack reports false', () => {
    expect(useUIStore.getState().navigateBack()).toBe(false);
    useUIStore.getState().navigateForward();
    expect(useUIStore.getState().activeView).toBe('tasks');
  });

  it(`the back stack is capped at MAX_NAV_HISTORY (${MAX_NAV_HISTORY})`, () => {
    const views = ['calendar', 'records', 'lists', 'portfolio'] as const;
    for (let i = 0; i < MAX_NAV_HISTORY + 10; i++) useUIStore.getState().setActiveView(views[i % views.length]);
    expect(useUIStore.getState().navHistory.length).toBe(MAX_NAV_HISTORY);
  });

  it('Calendar comes back to the period and view you were looking at', () => {
    const s = useUIStore.getState();
    s.setActiveView('calendar');
    useUIStore.setState({ calendarViewMode: 'week', calendarSelectedDate: '2026-12-10', calendarYear: 2026, calendarMonth: 11 });
    s.setActiveView('records');
    useUIStore.setState({ calendarViewMode: 'month', calendarYear: 2027, calendarMonth: 0 });   // moved on elsewhere
    useUIStore.getState().navigateBack();
    expect(useUIStore.getState()).toMatchObject({ activeView: 'calendar', calendarViewMode: 'week', calendarSelectedDate: '2026-12-10', calendarMonth: 11 });
  });

  it('Tasks comes back to the task that was open, and Lists to the list', () => {
    const s = useUIStore.getState();
    s.openTaskPane('task-1');
    s.setActiveView('lists');
    useUIStore.setState({ activeListId: 'list-a' });
    s.setActiveView('records');
    useUIStore.setState({ tasksLastEditingTaskId: 'task-2', listsLastActiveListId: 'list-b', activeListId: null });
    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().listsLastActiveListId).toBe('list-a');
    useUIStore.getState().navigateBack();
    expect(useUIStore.getState()).toMatchObject({ activeView: 'tasks', editingTaskId: 'task-1' });
  });

  it('travelHistory jumps several stops at once, keeping every stop in between', () => {
    const s = useUIStore.getState();
    s.setActiveView('calendar');
    s.setActiveView('records');
    s.setActiveView('lists');
    expect(useUIStore.getState().travelHistory(-3)).toBe(true);
    expect(useUIStore.getState().activeView).toBe('tasks');
    expect(fwd()).toEqual(['calendar', 'records', 'lists']);
    expect(useUIStore.getState().travelHistory(2)).toBe(true);
    expect(useUIStore.getState().activeView).toBe('records');
    expect(back()).toEqual(['calendar', 'tasks']);
    expect(fwd()).toEqual(['lists']);
    expect(useUIStore.getState().travelHistory(5)).toBe(false);
  });

  it('travel is pure: stacks in, target and stacks out', () => {
    const at = 'x';
    const r = travel([{ view: 'calendar', at }, { view: 'tasks', at }], [], { view: 'lists', at }, -2)!;
    expect(r.target.view).toBe('tasks');
    expect(r.back).toEqual([]);
    expect(r.forward.map(placeKey)).toEqual(['calendar', 'lists']);
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

describe('history — Notes keeps a stop per note', () => {
  it('walks back through several visited notes, then out of Notes', () => {
    const s = useUIStore.getState();
    s.setActiveView('records');
    s.setActiveView('notes');
    s.openNote('note1');
    s.openNote('note2');
    s.openNote('note3');
    expect(back()).toEqual(['notes:note2', 'notes:note1', 'records', 'tasks']);   // entering Notes with no note open isn't a stop of its own

    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note2');
    expect(fwd()).toEqual(['notes:note3']);
    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note1');
    useUIStore.getState().navigateForward();
    expect(useUIStore.getState().editingNoteId).toBe('note2');
    expect(fwd()).toEqual(['notes:note3']);
  });

  it('a stop per note, never for re-opening the same one', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.openNote('note1');
    s.openNote('note1');
    expect(back()).toEqual(['tasks']);
  });

  it('notes and sections share one stack: back from Tasks returns to the note you left', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.openNote('note1');
    s.openNote('note2');
    s.setActiveView('tasks');
    useUIStore.getState().navigateBack();
    expect(useUIStore.getState()).toMatchObject({ activeView: 'notes', editingNoteId: 'note2' });
    useUIStore.getState().navigateBack();
    expect(useUIStore.getState().editingNoteId).toBe('note1');
  });

  it('switching notebook or closing the note records the note that was open', () => {
    const s = useUIStore.getState();
    s.setActiveView('notes');
    s.setSelectedNoteTag('notebookA' as never);
    s.openNote('note1');
    s.setSelectedNoteTag('notebookB' as never);
    expect(useUIStore.getState().editingNoteId).toBeNull();
    expect(back()[0]).toBe('notes:note1');
    useUIStore.getState().openNote('note2');
    expect(back()).toEqual(['notes:note1', 'tasks']);   // not twice
    useUIStore.getState().closeNote();
    expect(back()[0]).toBe('notes:note2');
  });

  it('opening a note in another section (the quick-view pane) is not a stop', () => {
    useUIStore.getState().openNote('note1');
    expect(back()).toEqual([]);
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

describe('setSelectedNoteTag — keeps the path to the selected notebook open', () => {
  // Reported 2026-10-01: a notebook reached by hovering its parents open collapsed out of sight
  // as soon as the mouse left the tree, because selecting it didn't expand anything.
  it('selecting a nested notebook expands every ancestor, and leaves other expansions alone', () => {
    const add = useNoteStore.getState().addNoteTag;
    const uni = add({ name: 'University', kind: 'area' });
    const bio = add({ name: 'Biology', kind: 'area', parentTagId: uni });
    const genetics = add({ name: 'Genetics', kind: 'area', parentTagId: bio });
    const other = add({ name: 'Other', kind: 'area' });
    useUIStore.setState({ expandedNoteTagIds: [other] });

    useUIStore.getState().setSelectedNoteTag(genetics);
    expect([...useUIStore.getState().expandedNoteTagIds].sort()).toEqual([bio, other, uni].sort());
  });
});

describe('session memory', () => {
  it('the notebook tree remembers which notebooks were expanded across a reload', () => {
    useUIStore.getState().toggleNoteTagExpanded('nb-1' as never);
    const saved = useUIStore.persist.getOptions().partialize!(useUIStore.getState()) as { expandedNoteTagIds?: string[] };
    expect(saved.expandedNoteTagIds).toEqual(['nb-1']);
  });

  it('migrating from v3 backfills an empty expanded list', () => {
    const migrated = useUIStore.persist.getOptions().migrate!({ activeView: 'notes' }, 3) as { expandedNoteTagIds: string[] };
    expect(migrated.expandedNoteTagIds).toEqual([]);
  });
});
