import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useRoutineStore } from '@/store/routineStore';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { trashedBy, deleteForever } from '@/services/trash';
import { TICK, readTick, rhythmStreams, isRhythm, type Tick } from '@/utils/rhythms';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { CollectionId, NoteTagId, RhythmStream, TickStatus, TrackerEntryId } from '@/types';

// Making and changing what happened to a rhythm's occurrences (docs/features/endeavours.md phase
// 4). A tick is a tracker entry of the rhythm (utils/rhythms.ts says how it's read), so it syncs
// and shows in Records. Every board, list and notification that ticks an occurrence comes here.

function findTick(rhythmId: string, streamId: string, date: string): Tick | undefined {
  const rhythm = useTaskStore.getState().collections[rhythmId as CollectionId];
  if (!isRhythm(rhythm)) return undefined;
  for (const e of Object.values(useTrackerStore.getState().entries)) {
    if (e.trackerId !== rhythmId || e.date !== date) continue;
    const read = readTick(e, rhythm);
    if (read.streamId === streamId) return read.tick;
  }
  return undefined;
}

// The routine's own stream (a routine never given streams) keeps its checklist in step.
const isOwnStream = (rhythmId: string, streamId: string) => rhythmId === streamId;

// Done, skipped or not needed; null takes it back to not dealt with. An occurrence holding nothing
// else is then forgotten (its entry deleted, and not kept in the Recycling Bin: it was only a tick).
export function setTick(rhythmId: string, streamId: string, date: string, status: TickStatus | null): void {
  const tracker = useTrackerStore.getState();
  const tick = findTick(rhythmId, streamId, date);
  const own = isOwnStream(rhythmId, streamId);
  if (tick) {
    const entry = tracker.entries[tick.entryId as TrackerEntryId];
    if (status === null && Object.keys(tick.fields).length === 0 && !tick.noteId) {
      for (const t of trashedBy(() => tracker.deleteEntry(tick.entryId as TrackerEntryId))) deleteForever(t);
    } else {
      tracker.updateEntry(tick.entryId as TrackerEntryId, { data: { ...entry.data, [TICK.status]: status ?? 'open' } });
    }
  } else if (status !== null) {
    tracker.addEntry({
      trackerId: rhythmId as CollectionId, date, notes: null,
      data: { ...(own ? {} : { [TICK.stream]: streamId }), [TICK.status]: status },
    });
  }
  if (own) {
    const routines = useRoutineStore.getState();
    if (status === 'done') routines.completeRoutine(rhythmId as CollectionId, date, (findTick(rhythmId, streamId, date)?.entryId ?? null) as TrackerEntryId | null);
    else routines.reopenRoutine(rhythmId as CollectionId, date);
  }
}

export function toggleDone(rhythmId: string, streamId: string, date: string): void {
  const tick = findTick(rhythmId, streamId, date);
  setTick(rhythmId, streamId, date, tick?.status === 'done' ? null : 'done');
}

// One of the occurrence's Type fields. Filling one in doesn't tick it.
export function setTickField(rhythmId: string, streamId: string, date: string, fieldId: string, value: unknown): void {
  const tracker = useTrackerStore.getState();
  const tick = findTick(rhythmId, streamId, date);
  if (tick) {
    const entry = tracker.entries[tick.entryId as TrackerEntryId];
    tracker.updateEntry(tick.entryId as TrackerEntryId, { data: { ...entry.data, [fieldId]: value } });
    return;
  }
  tracker.addEntry({
    trackerId: rhythmId as CollectionId, date, notes: null,
    data: { ...(isOwnStream(rhythmId, streamId) ? {} : { [TICK.stream]: streamId }), [TICK.status]: 'open', [fieldId]: value },
  });
}

// Opens the occurrence's note, making it first if there isn't one: in the stream's notebook, filed
// under the rhythm's Endeavour, titled with the stream and the date.
export function openOccurrenceNote(rhythmId: string, streamId: string, date: string): void {
  const rhythm = useTaskStore.getState().collections[rhythmId as CollectionId];
  const stream = rhythm && rhythmStreams(rhythm).find((s) => s.id === streamId);
  if (!rhythm || !stream) return;
  const ui = useUIStore.getState();
  const existing = findTick(rhythmId, streamId, date)?.noteId;
  if (existing && useNoteStore.getState().notes[existing as never]) {
    ui.setActiveView('notes');
    ui.openNote(existing);
    return;
  }
  const noteId = useNoteStore.getState().addNote({
    title: LABELS.rhythms.noteTitle(stream.label, formatDate(date + 'T00:00:00')),
    tagIds: stream.notebookId ? [stream.notebookId as NoteTagId] : [],
    collectionId: rhythm.collectionId,
  });
  const tracker = useTrackerStore.getState();
  const tick = findTick(rhythmId, streamId, date);
  if (tick) {
    tracker.updateEntry(tick.entryId as TrackerEntryId, { data: { ...tracker.entries[tick.entryId as TrackerEntryId].data, [TICK.note]: noteId } });
  } else {
    tracker.addEntry({
      trackerId: rhythmId as CollectionId, date, notes: null,
      data: { ...(isOwnStream(rhythmId, streamId) ? {} : { [TICK.stream]: streamId }), [TICK.status]: 'open', [TICK.note]: noteId },
    });
  }
  ui.setActiveView('notes');
  ui.openNote(noteId);
}

// Saves a rhythm's streams. Left absent while they're still just the routine read as one stream,
// so a routine opened and saved unchanged stores nothing new.
export function saveStreams(rhythmId: string, streams: RhythmStream[]): void {
  const rhythm = useTaskStore.getState().collections[rhythmId as CollectionId];
  if (!isRhythm(rhythm)) return;
  const unchanged = !rhythm.streams && JSON.stringify(streams) === JSON.stringify(rhythmStreams(rhythm));
  if (unchanged) return;
  useTaskStore.getState().updateCollection(rhythm.id, { streams });
}
