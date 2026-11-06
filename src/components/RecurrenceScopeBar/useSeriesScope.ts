import { useState } from 'react';
import { useCalendarStore } from '@/store/calendarStore';
import { LABELS } from '@/config/labels';

// Which dates a repeating item's pane changes (SeriesScope.tsx has the line that chooses it).

export type SeriesKind = 'event' | 'reminder' | 'deadline';
export type SeriesScope = 'all' | 'this' | 'following';

const S = LABELS.calendarSeries;

function storeFor(kind: SeriesKind) {
  const s = useCalendarStore.getState();
  return kind === 'event'
    ? { detach: s.detachEventOccurrence, split: s.splitEventSeries, skip: s.skipEventOccurrence, endBefore: s.endEventSeriesBefore }
    : kind === 'reminder'
      ? { detach: s.detachReminderOccurrence, split: s.splitReminderSeries, skip: s.skipReminderOccurrence, endBefore: s.endReminderSeriesBefore }
      : { detach: s.detachDeadlineOccurrence, split: s.splitDeadlineSeries, skip: s.skipDeadlineOccurrence, endBefore: s.endDeadlineSeriesBefore };
}

// Which dates the pane's changes go to, and the change itself: to the whole series, or to a copy of
// this date (or this and the following) made at the first change, then the pane moves to it.
export function useSeriesScope<P>({ kind, id, repeats, occurrence, update, onSwitch }: {
  kind: SeriesKind; id: string | null; repeats: boolean; occurrence: string | null;
  update: (id: string, patch: P) => void; onSwitch: (newId: string) => void;
}) {
  const [scope, setScope] = useState<SeriesScope>('all');
  const live: SeriesScope = repeats && occurrence ? scope : 'all';
  const scopedUpdate = (itemId: string, patch: P) => {
    if (live === 'all' || !occurrence || itemId !== id) { update(itemId, patch); return; }
    const st = storeFor(kind);
    const newId = (live === 'this' ? st.detach : st.split)(itemId as never, occurrence) as string | null;
    if (!newId) { update(itemId, patch); return; }
    update(newId, patch);
    onSwitch(newId);
  };
  // Delete only this date or this and the following; false: delete everything (the pane's own).
  const scopedDelete = (): boolean => {
    if (live === 'all' || !id || !occurrence) return false;
    const st = storeFor(kind);
    (live === 'this' ? st.skip : st.endBefore)(id as never, occurrence);
    return true;
  };
  const deleteLabel = (whole: string) => (live === 'this' ? S.deleteThis : live === 'following' ? S.deleteFollowing : whole);
  return { scope: live, setScope, update: scopedUpdate, deleteScoped: scopedDelete, deleteLabel };
}

