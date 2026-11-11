import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useUIStore } from '@/store/uiStore';
import { LINK_TARGETS, TASK_LINK_TARGETS, linkSnapshot } from './linkTargets';
import { openItem } from './openItem';
import { linksTo } from './linksTo';
import { linkTaskToEvent } from './eventTaskLinks';
import type { CrossAppRefType, ItemLinkTargetType, TaskId } from '@/types';

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useListStore.setState(useListStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});

// Every kind a link can point at has an entry (a new member of either union fails to compile in
// LINK_TARGETS, and this keeps the task-link list in step).
const ALL_REF_TYPES: CrossAppRefType[] = ['note', 'task', 'event', 'reminder', 'deadline', 'list', 'listItem', 'trackerEntry'];
const ALL_TASK_LINK_TYPES: ItemLinkTargetType[] = ['task', 'event', 'reminder', 'deadline'];

describe('the link-target registry', () => {
  it('has an entry for every CrossAppRefType and ItemLinkTargetType, each with an icon, a name, resolve and open', () => {
    for (const t of [...ALL_REF_TYPES, ...ALL_TASK_LINK_TYPES]) {
      const def = LINK_TARGETS[t];
      expect(def, t).toBeDefined();
      expect(def.type).toBe(t);
      expect(def.icon && def.label).toBeTruthy();
    }
    expect(TASK_LINK_TARGETS.sort()).toEqual([...ALL_TASK_LINK_TYPES].sort());
    for (const t of TASK_LINK_TARGETS) expect(LINK_TARGETS[t].storage).toContain('taskLink');
  });

  it('resolves what exists and returns null for what’s gone; a locked note shows as locked', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Plans' });
    const locked = useNoteStore.getState().addNote({ title: 'Secret' });
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [locked]: { ...s.notes[locked], isEncrypted: true, encryptedPayload: 'cipher', title: '' } } }));
    const snap = linkSnapshot();
    expect(LINK_TARGETS.note.resolve(snap, noteId)).toMatchObject({ title: 'Plans', locked: false });
    expect(LINK_TARGETS.note.resolve(snap, locked)).toMatchObject({ locked: true });
    expect(LINK_TARGETS.note.resolve(snap, 'gone')).toBeNull();
    expect(LINK_TARGETS.task.resolve(snap, 'gone')).toBeNull();
  });
});

describe('openItem', () => {
  it('a calendar item opened from the task pane closes the task pane and goes to the calendar at its date', () => {
    const e = useCalendarStore.getState().addEvent({ title: 'Exam', date: '2026-11-20' });
    const taskId = useTaskStore.getState().addTask({ title: 'Revise' });
    useUIStore.getState().setActiveView('tasks');
    useUIStore.getState().openTaskPane(taskId);
    expect(openItem('event', e, { occurrence: '2026-11-20' })).toBe(true);
    const ui = useUIStore.getState();
    expect(ui.editingTaskId).toBeNull();
    expect(ui.activeView).toBe('calendar');
    expect(ui.editingCalendarEventId).toBe(e);
  });

  it('a task opened from a calendar item stays over the calendar; from Notes it goes to Tasks and closes the panes', () => {
    const e = useCalendarStore.getState().addEvent({ title: 'Exam', date: '2026-11-20' });
    const taskId = useTaskStore.getState().addTask({ title: 'Revise' });
    useUIStore.getState().setActiveView('calendar');
    useUIStore.getState().openCalendarEventPane(e);
    openItem('task', taskId);
    let ui = useUIStore.getState();
    expect(ui.activeView).toBe('calendar');
    expect(ui.editingTaskId).toBe(taskId);
    expect(ui.editingCalendarEventId).toBe(e);
    useUIStore.getState().closeTaskPane();
    useUIStore.getState().setActiveView('notes');
    openItem('task', taskId);
    ui = useUIStore.getState();
    expect(ui.activeView).toBe('tasks');
    expect(ui.editingCalendarEventId).toBeNull();
  });

  it('returns false for something that no longer exists', () => {
    expect(openItem('task', 'gone')).toBe(false);
    expect(openItem('note', 'gone')).toBe(false);
  });
});

describe('linksTo: what links here, from both ways a link is stored', () => {
  it('finds every kind that can link to every kind it can (references and task links, with relation and date)', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const listId = useListStore.getState().addList({ name: 'Packing' });
    const e = useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2026-11-02', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null }, crossAppRefs: [{ type: 'note', id: noteId }, { type: 'list', id: listId }] });
    const r = useCalendarStore.getState().addReminder({ title: 'Call', date: '2026-11-02', crossAppRefs: [{ type: 'note', id: noteId }] });
    const d = useCalendarStore.getState().addDeadline({ title: 'Essay', date: '2026-11-02', crossAppRefs: [{ type: 'list', id: listId }] });
    useListStore.getState().updateListLinks(listId, { crossAppRefs: [{ type: 'note', id: noteId, tabId: 't1' }] });
    const a = useTaskStore.getState().addTask({ title: 'A', crossAppRefs: [{ type: 'note', id: noteId }, { type: 'list', id: listId }] }) as TaskId;
    const b = useTaskStore.getState().addTask({ title: 'B' }) as TaskId;
    useTaskStore.getState().addItemLink(b, 'dependsOn', a, 'needs it');
    linkTaskToEvent(a, 'prepFor', 'event', e, '2026-11-09');
    linkTaskToEvent(a, 'prepFor', 'event', e, '2026-11-16');
    linkTaskToEvent(b, 'related', 'reminder', r);
    linkTaskToEvent(b, 'followUpOf', 'deadline', d);

    const key = (l: { type: string; via: string; kind?: string; occurrence?: string; tabId?: string }) => [l.type, l.via, l.kind, l.occurrence, l.tabId].filter(Boolean).join(':');
    expect(linksTo('note', noteId).map(key).sort()).toEqual(['event:reference', 'list:reference:t1', 'reminder:reference', 'task:reference']);
    expect(linksTo('list', listId).map(key).sort()).toEqual(['deadline:reference', 'event:reference', 'task:reference']);
    expect(linksTo('event', e).map(key).sort()).toEqual(['task:taskLink:prepFor:2026-11-09', 'task:taskLink:prepFor:2026-11-16']);
    expect(linksTo('reminder', r).map(key)).toEqual(['task:taskLink:related']);
    expect(linksTo('deadline', d).map(key)).toEqual(['task:taskLink:followUpOf']);
    expect(linksTo('task', a)).toEqual([expect.objectContaining({ id: b, via: 'taskLink', kind: 'dependsOn', reason: 'needs it' })]);
  });
});
