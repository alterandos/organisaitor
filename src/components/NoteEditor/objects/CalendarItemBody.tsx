import { useCalendarStore } from '@/store/calendarStore';
import type { CalendarDeadline, CalendarDeadlineId, CalendarReminder, CalendarReminderId } from '@/types';
import { ObjectBody } from './ObjectBody';
import { NotifyChip, NotifyMeOption } from './NotifyChips';
import { datedPatch, datedRule, defaultRule } from '@/utils/notifyRule';
import { calendarFlags } from './flags';
import { updateDated } from './calendarItems';
import type { ArtifactBodyProps } from './artifactTypes';

// A Reminder's or Deadline's expanded body: its notes, links, Endeavour, the options that are off,
// and when it notifies — saved straight to the calendar item (the same one the calendar shows).
// Date, time and the options that are on are in the heading. When it notifies is the same setting
// as the calendar panes' (utils/notifyRule.ts).
export function CalendarItemBody({ kind, id, heading, onToggle }: ArtifactBodyProps & { kind: 'reminder' | 'deadline' }) {
  const item = useCalendarStore((s) => (kind === 'reminder' ? s.reminders[id as CalendarReminderId] : s.deadlines[id as CalendarDeadlineId])) as CalendarReminder | CalendarDeadline | undefined;
  if (!item) return null;
  const update = (changes: Partial<CalendarReminder | CalendarDeadline>) => updateDated(kind, id, changes);
  const rule = datedRule(item, kind);
  const timed = !!item.time;
  return (
    <ObjectBody
      heading={heading}
      onToggle={onToggle}
      notes={item.notes}
      links={item.links}
      collectionId={item.collectionId}
      onNotes={(notes) => update({ notes })}
      onLinks={(links) => update({ links })}
      onCollection={(collectionId) => update({ collectionId })}
      flags={calendarFlags(item, update)}
      extra={<NotifyChip item={kind} timed={timed} rule={rule} onChange={(r) => update(datedPatch(r))} />}
      offExtra={rule.kind === 'off' && <NotifyMeOption onTurnOn={() => update(datedPatch(defaultRule(kind, timed)))} />}
    />
  );
}
