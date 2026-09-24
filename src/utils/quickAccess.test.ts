import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useUIStore } from '@/store/uiStore';
import { useRecentItemsStore } from '@/store/recentItemsStore';
import { searchQuickAccessItems, resolveRecentItems, pruneStaleRecentEntries, navigateToQuickAccessItem } from '@/utils/quickAccess';
import type { TaskId } from '@/types';
import type { NoteId } from '@/types/notes';

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useListStore.setState(useListStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useRecentItemsStore.setState(useRecentItemsStore.getInitialState(), true);
});

describe('searchQuickAccessItems', () => {
  it('matches case-insensitively across every provider type', () => {
    useTaskStore.getState().addTask({ title: 'Buy Milk' });
    useNoteStore.getState().addNote({ title: 'Milkshake recipe' });
    const results = searchQuickAccessItems('milk');
    expect(results.some((r) => r.type === 'task' && r.title === 'Buy Milk')).toBe(true);
    expect(results.some((r) => r.type === 'note' && r.title === 'Milkshake recipe')).toBe(true);
  });

  it('an empty (or whitespace-only) query returns nothing', () => {
    useTaskStore.getState().addTask({ title: 'Anything' });
    expect(searchQuickAccessItems('')).toEqual([]);
    expect(searchQuickAccessItems('   ')).toEqual([]);
  });

  it('excludes archived tasks and notes from results', () => {
    const id = useTaskStore.getState().addTask({ title: 'Findme task' }) as TaskId;
    useTaskStore.getState().archiveTask(id);
    expect(searchQuickAccessItems('findme').some((r) => r.type === 'task')).toBe(false);
  });

  it('caps results per provider type at limitPerType', () => {
    for (let i = 0; i < 10; i++) useTaskStore.getState().addTask({ title: `Match ${i}` });
    expect(searchQuickAccessItems('match', 3).filter((r) => r.type === 'task').length).toBe(3);
  });

  it('a title that doesn\'t contain the query is not returned', () => {
    useTaskStore.getState().addTask({ title: 'Completely unrelated' });
    expect(searchQuickAccessItems('zzz')).toEqual([]);
  });
});

describe('resolveRecentItems / pruneStaleRecentEntries', () => {
  it('resolves a live entry and reports a deleted one as stale', () => {
    const id = useTaskStore.getState().addTask({ title: 'Still here' }) as TaskId;
    const now = new Date().toISOString();
    const { items, stale } = resolveRecentItems([
      { type: 'task', entityId: id, lastVisitedAt: now, visitCount: 1 },
      { type: 'task', entityId: 'deleted-id', lastVisitedAt: now, visitCount: 1 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].entityId).toBe(id);
    expect(stale).toHaveLength(1);
    expect(stale[0].entityId).toBe('deleted-id');
  });

  it('an archived task resolves as stale too, not just a deleted one', () => {
    const id = useTaskStore.getState().addTask({ title: 'X' }) as TaskId;
    useTaskStore.getState().archiveTask(id);
    const { items, stale } = resolveRecentItems([{ type: 'task', entityId: id, lastVisitedAt: new Date().toISOString(), visitCount: 1 }]);
    expect(items).toHaveLength(0);
    expect(stale).toHaveLength(1);
  });

  it('pruneStaleRecentEntries removes exactly the given entries from recentItemsStore', () => {
    useRecentItemsStore.getState().recordVisit('task', 'keep');
    useRecentItemsStore.getState().recordVisit('task', 'drop');
    pruneStaleRecentEntries([{ type: 'task', entityId: 'drop', lastVisitedAt: new Date().toISOString(), visitCount: 1 }]);
    const remaining = Object.values(useRecentItemsStore.getState().items).map((i) => i.entityId);
    expect(remaining).toEqual(['keep']);
  });
});

describe('encrypted notes/lists resolve through the locked view, not the raw store', () => {
  it('an encrypted note without a decrypted cache shows the locked title and a 🔒 icon', () => {
    const id = useNoteStore.getState().addNote({ title: 'Plain title' }) as NoteId;
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [id]: { ...s.notes[id], isEncrypted: true, encryptedPayload: 'cipher', title: '' } } }));
    const result = resolveRecentItems([{ type: 'note', entityId: id, lastVisitedAt: new Date().toISOString(), visitCount: 1 }]);
    expect(result.items[0].title).toBe('Encrypted note');
    expect(result.items[0].icon).toBe('🔒');
  });
});

describe('navigateToQuickAccessItem', () => {
  it('a task item switches to Tasks and opens the task pane', () => {
    const id = useTaskStore.getState().addTask({ title: 'X' }) as TaskId;
    navigateToQuickAccessItem({ key: `task:${id}`, type: 'task', entityId: id, title: 'X', subtitle: '', icon: '' });
    expect(useUIStore.getState().activeView).toBe('tasks');
    expect(useUIStore.getState().editingTaskId).toBe(id);
  });

  it('an endeavour item switches to Tasks and focuses that Endeavour filter', () => {
    const id = useTaskStore.getState().addCollection({ kind: 'project', name: 'Proj' });
    navigateToQuickAccessItem({ key: `endeavour:${id}`, type: 'endeavour', entityId: id, title: 'Proj', subtitle: '', icon: '' });
    expect(useUIStore.getState().activeView).toBe('tasks');
    expect(useUIStore.getState().activeCollectionIdByView.tasks).toBe(id);
  });

  it('a notebook item switches to Notes and selects that notebook', () => {
    const id = useNoteStore.getState().addNoteTag({ name: 'Uni', kind: 'area' });
    navigateToQuickAccessItem({ key: `notebook:${id}`, type: 'notebook', entityId: id, title: 'Uni', subtitle: '', icon: '' });
    expect(useUIStore.getState().activeView).toBe('notes');
    expect(useUIStore.getState().selectedNoteTagId).toBe(id);
  });

  it('an unknown provider type is a harmless no-op', () => {
    expect(() => navigateToQuickAccessItem({ key: 'x', type: 'nope' as never, entityId: 'x', title: '', subtitle: '', icon: '' })).not.toThrow();
  });
});
