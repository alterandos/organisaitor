import { repeatSummary } from '@/services/recurringTasks';
import { formatDate } from '@/utils/date';
import type { SubjectItemDraft } from '@/utils/subjectItems';

// When an item read from a course outline happens, in one line, for the list shown before it's made:
// "Every week on Wed · 10:00–12:00", "23 Oct 2026", "1 day before each lecture".
export function itemWhen(d: SubjectItemDraft): string {
  const time = d.start ? (d.end ? `${d.start}–${d.end}` : d.start) : '';
  const when = d.follow
    ? `${Math.abs(d.follow.offsetDays)} day${Math.abs(d.follow.offsetDays) === 1 ? '' : 's'} ${d.follow.offsetDays < 0 ? 'before' : 'after'} each ${d.follow.title}`
    : d.repeat ? repeatSummary(d.repeat) : formatDate(`${d.date}T00:00:00`);
  return [when, time, d.place ?? ''].filter(Boolean).join(' · ');
}
