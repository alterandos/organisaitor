import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useRoutineStore } from '@/store/routineStore';
import { useNoteStore } from '@/store/noteStore';
import { useTrashStore } from '@/store/trashStore';
import { useUIStore } from '@/store/uiStore';
import { openOccurrenceNote, saveStreams, setTick, setTickField, toggleDone } from './rhythms';
import { rhythmStreams, tickIndex, tickKey } from '@/utils/rhythms';
import type { CollectionId, NoteTagId, RhythmStream } from '@/types';

beforeEach(() => {
  for (const s of [useTaskStore, useTrackerStore, useRoutineStore, useNoteStore, useTrashStore, useUIStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});

const ticks = () => tickIndex(useTrackerStore.getState().entries, useTaskStore.getState().collections);
const entries = () => Object.values(useTrackerStore.getState().entries);

function rhythm(): CollectionId {
  const id = useTaskStore.getState().addCollection({ kind: 'routine', name: 'GEOS215 weekly' });
  const reading: RhythmStream = {
    id: 'read', label: 'Reading', kind: 'doBy', typeId: null, rule: { kind: 'repeat', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [1] } },
    start: '2026-10-01', time: null, show: { calendar: 'marker', tasks: 'near', notify: false }, notebookId: null,
  };
  saveStreams(id, [...rhythmStreams(useTaskStore.getState().collections[id]), reading]);
  return id;
}

describe('ticking an occurrence', () => {
  it('done makes a tracker entry of the rhythm; undone forgets it, leaving nothing in the Recycling Bin', () => {
    const r = rhythm();
    toggleDone(r, 'read', '2026-10-05');
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ trackerId: r, date: '2026-10-05', data: { _stream: 'read', _status: 'done' } });
    expect(ticks().get(tickKey(r, 'read', '2026-10-05'))?.status).toBe('done');
    toggleDone(r, 'read', '2026-10-05');
    expect(entries()).toHaveLength(0);
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
  });

  it('skipped and not needed are kept; a filled-in field survives being undone', () => {
    const r = rhythm();
    setTickField(r, 'read', '2026-10-12', 'pages', '40–62');
    expect(ticks().get(tickKey(r, 'read', '2026-10-12'))).toMatchObject({ status: null, fields: { pages: '40–62' } });
    setTick(r, 'read', '2026-10-12', 'skipped');
    expect(ticks().get(tickKey(r, 'read', '2026-10-12'))?.status).toBe('skipped');
    setTick(r, 'read', '2026-10-12', null);
    expect(ticks().get(tickKey(r, 'read', '2026-10-12'))).toMatchObject({ status: null, fields: { pages: '40–62' } });
  });

  it("the routine's own stream keeps its day's checklist in step", () => {
    const r = rhythm();
    setTick(r, r, '2026-10-05', 'done');
    expect(entries()[0].data).toEqual({ _status: 'done' });
    expect(useRoutineStore.getState().instances[`${r}_2026-10-05`]?.completed).toBe(true);
    setTick(r, r, '2026-10-05', null);
    expect(useRoutineStore.getState().instances[`${r}_2026-10-05`]?.completed).toBe(false);
  });
});

describe('streams', () => {
  it('a routine saved unchanged stores no streams', () => {
    const id = useTaskStore.getState().addCollection({ kind: 'routine', name: 'Morning' });
    saveStreams(id, rhythmStreams(useTaskStore.getState().collections[id]));
    expect(useTaskStore.getState().collections[id].streams).toBeUndefined();
  });
});

describe("an occurrence's note", () => {
  it('is made once, in the stream’s notebook, and opened', () => {
    const r = rhythm();
    const nb = useNoteStore.getState().addNoteTag({ name: 'GEOS215', kind: 'area' });
    const c = useTaskStore.getState().collections[r];
    saveStreams(r, c.streams!.map((s) => (s.id === 'read' ? { ...s, notebookId: nb as NoteTagId } : s)));
    openOccurrenceNote(r, 'read', '2026-10-05');
    const notes = Object.values(useNoteStore.getState().notes);
    expect(notes).toHaveLength(1);
    expect(notes[0].tagIds).toEqual([nb]);
    expect(useUIStore.getState().editingNoteId).toBe(notes[0].id);
    expect(ticks().get(tickKey(r, 'read', '2026-10-05'))).toMatchObject({ status: null, noteId: notes[0].id });
    openOccurrenceNote(r, 'read', '2026-10-05');
    expect(Object.values(useNoteStore.getState().notes)).toHaveLength(1);
  });
});
