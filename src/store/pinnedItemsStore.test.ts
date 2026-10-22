import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePinnedItemsStore } from '@/store/pinnedItemsStore';
import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';
import { resolvePinnedItems } from '@/utils/quickAccess';
import { adoptLegacyNotePins, isPinned, pinMenuItem, togglePin } from '@/services/quickAccessPins';
import type { Note, NoteId } from '@/types/notes';

const order = () => Object.values(usePinnedItemsStore.getState().pins).sort((a, b) => a.order - b.order).map((p) => p.id);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-01T09:00:00Z'));
  // Starts empty: the scratchpad's default pin has its own tests below.
  usePinnedItemsStore.setState({ ...usePinnedItemsStore.getInitialState(), pins: {} }, true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => vi.useRealTimers());

describe('the scratchpad is pinned by default', () => {
  it('a fresh install starts with it pinned', () => {
    expect(Object.keys(usePinnedItemsStore.getInitialState().pins)).toEqual(['place:scratchpad']);
  });

  it('an existing install gets it once, after its own pins (v1 → v2)', async () => {
    localStorage.setItem('quick-access-pins', JSON.stringify({ version: 1, state: { pins: {
      'note:n1': { id: 'note:n1', type: 'note', entityId: 'n1', order: 0, createdAt: 'x', updatedAt: 'x' },
    } } }));
    vi.resetModules();
    const { usePinnedItemsStore: fresh } = await import('@/store/pinnedItemsStore');
    const pins = Object.values(fresh.getState().pins).sort((a, b) => a.order - b.order).map((p) => p.id);
    expect(pins).toEqual(['note:n1', 'place:scratchpad']);
    localStorage.removeItem('quick-access-pins');
  });
});

describe('pinnedItemsStore', () => {
  it('pins once per item, at the end, and unpins', () => {
    const s = usePinnedItemsStore.getState();
    s.pin('note', 'n1');
    s.pin('place', 'review');
    s.pin('note', 'n1');
    expect(order()).toEqual(['note:n1', 'place:review']);
    s.unpin('note', 'n1');
    expect(order()).toEqual(['place:review']);
  });

  it('reorder puts the named pins first and bumps updatedAt only on the ones that moved', () => {
    const s = usePinnedItemsStore.getState();
    s.pin('note', 'a'); s.pin('note', 'b'); s.pin('note', 'c');
    vi.setSystemTime(new Date('2030-01-02T09:00:00Z'));
    s.reorder(['note:c', 'note:b']);
    expect(order()).toEqual(['note:c', 'note:b', 'note:a']);
    expect(usePinnedItemsStore.getState().pins['note:b'].updatedAt).toBe('2030-01-01T09:00:00.000Z');
    expect(usePinnedItemsStore.getState().pins['note:c'].updatedAt).toBe('2030-01-02T09:00:00.000Z');
  });
});

describe('resolvePinnedItems', () => {
  it('lists the pins in order with live titles, skipping ones whose item is gone, without removing them', () => {
    const note = useNoteStore.getState().addNote({ title: 'Essay plan' });
    const gone = useNoteStore.getState().addNote({ title: 'Old' });
    const project = useTaskStore.getState().addCollection({ kind: 'project', name: 'Report' });
    const s = usePinnedItemsStore.getState();
    s.pin('endeavour', project); s.pin('note', note); s.pin('note', gone); s.pin('place', 'review');
    useNoteStore.getState().updateNote(note, { title: 'Essay outline' });
    useNoteStore.setState((st) => { const notes = { ...st.notes }; delete notes[gone as NoteId]; return { notes }; });
    const items = resolvePinnedItems(usePinnedItemsStore.getState().pins);
    expect(items.map((i) => i.title)).toEqual(['Report', 'Essay outline', expect.any(String)]);
    expect(items[2].type).toBe('place');
    expect(usePinnedItemsStore.getState().pins[`note:${gone}`]).toBeDefined();
  });
});

describe('togglePin', () => {
  it('pins and unpins with a toast whose Undo reverses it, back in the same place', () => {
    const a = useNoteStore.getState().addNote({ title: 'A' });
    usePinnedItemsStore.getState().pin('place', 'review');
    togglePin('note', a);
    expect(isPinned('note', a)).toBe(true);
    expect(useToastStore.getState().current?.message).toContain('Pinned “A”');
    useToastStore.getState().current?.actions[0].onClick();
    expect(isPinned('note', a)).toBe(false);

    usePinnedItemsStore.getState().pin('note', a);
    usePinnedItemsStore.getState().reorder([`note:${a}`]);
    togglePin('note', a);
    expect(isPinned('note', a)).toBe(false);
    useToastStore.getState().current?.actions[0].onClick();
    expect(order()).toEqual([`note:${a}`, 'place:review']);
  });

  it('the right-click item follows whether the item is pinned', () => {
    expect(pinMenuItem('list', 'l1').label).toBe('Pin to Quick Access');
    usePinnedItemsStore.getState().pin('list', 'l1');
    expect(pinMenuItem('list', 'l1').label).toBe('Unpin from Quick Access');
  });
});

describe('adoptLegacyNotePins', () => {
  it('pins notes that still carry the old flag, drops the flag, and leaves updatedAt alone', () => {
    const a = useNoteStore.getState().addNote({ title: 'A' });
    const b = useNoteStore.getState().addNote({ title: 'B' });
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [a]: { ...s.notes[a], pinned: true } as Note, [b]: { ...s.notes[b], pinned: false } as Note } }));
    const before = useNoteStore.getState().notes[a].updatedAt;
    adoptLegacyNotePins();
    expect(order()).toEqual([`note:${a}`]);
    expect('pinned' in useNoteStore.getState().notes[a]).toBe(false);
    expect('pinned' in useNoteStore.getState().notes[b]).toBe(false);
    expect(useNoteStore.getState().notes[a].updatedAt).toBe(before);
  });
});

describe('uiStore Quick Access tabs', () => {
  it('a tab\'s own key closes it, the other tab\'s key switches to it', () => {
    const ui = () => useUIStore.getState();
    ui().toggleQuickAccess('pinned');
    expect([ui().quickAccessOpen, ui().quickAccessTab]).toEqual([true, 'pinned']);
    ui().toggleQuickAccess('goto');
    expect([ui().quickAccessOpen, ui().quickAccessTab]).toEqual([true, 'goto']);
    ui().toggleQuickAccess('goto');
    expect(ui().quickAccessOpen).toBe(false);
  });
});
