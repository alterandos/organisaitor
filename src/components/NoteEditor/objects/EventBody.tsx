import { useCalendarStore } from '@/store/calendarStore';
import type { CalendarEvent, CalendarEventId } from '@/types';
import { ObjectBody } from './ObjectBody';
import { NotifyChip, NotifyMeOption } from './NotifyChips';
import { defaultRule, eventPatch, eventRule, type NotifyRule } from '@/utils/notifyRule';
import { calendarFlags } from './flags';
import type { ArtifactBodyProps } from './artifactTypes';

// An Event's expanded pane: the second heading line gets its place, Endeavour and (when on) its
// notification after the date, times and options; the content its notes and links; the bottom bar
// what's off, including the opt-in "Notify me". Saved straight to the event.
export function EventBody({ id, heading, onToggle }: ArtifactBodyProps) {
  const event = useCalendarStore((s) => s.events[id as CalendarEventId]);
  if (!event) return null;
  const update = (changes: Partial<CalendarEvent>) => useCalendarStore.getState().updateEvent(id as CalendarEventId, changes);
  const timed = event.eventType !== 'birthday' && !!event.startTime;
  const rule = eventRule(event);
  const notify = (r: NotifyRule) => update(eventPatch(r));
  return (
    <ObjectBody
      heading={heading}
      onToggle={onToggle}
      notes={event.notes}
      links={event.links}
      collectionId={event.collectionId}
      onNotes={(notes) => update({ notes })}
      onLinks={(links) => update({ links })}
      onCollection={(collectionId) => update({ collectionId })}
      place={{ value: event.location, onChange: (location) => update({ location }) }}
      flags={calendarFlags(event, update)}
      extra={<NotifyChip item="event" timed={timed} rule={rule} onChange={notify} />}
      offExtra={rule.kind === 'off' && <NotifyMeOption onTurnOn={() => notify(defaultRule('event', timed))} />}
    />
  );
}
