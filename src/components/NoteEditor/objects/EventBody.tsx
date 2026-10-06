import { useCalendarStore } from '@/store/calendarStore';
import type { CalendarEvent, CalendarEventId } from '@/types';
import { ObjectBody } from './ObjectBody';
import { BeforeNotifyChip, NotifyMeOption } from './NotifyChips';
import { calendarFlags } from './flags';
import type { ArtifactBodyProps } from './artifactTypes';

// An Event's expanded pane: the second heading line gets its place, Endeavour and (when on) its
// notification after the date, times and options; the content its notes and links; the bottom bar
// what's off, including the opt-in "Notify me". Saved straight to the event.
export function EventBody({ id, heading, onToggle }: ArtifactBodyProps) {
  const event = useCalendarStore((s) => s.events[id as CalendarEventId]);
  if (!event) return null;
  const update = (changes: Partial<CalendarEvent>) => useCalendarStore.getState().updateEvent(id as CalendarEventId, changes);
  const notify = (notifyBeforeValue: number | null, notifyBeforeUnit: CalendarEvent['notifyBeforeUnit']) => update({ notifyBeforeValue, notifyBeforeUnit });
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
      extra={<BeforeNotifyChip value={event.notifyBeforeValue} unit={event.notifyBeforeUnit} onChange={notify} />}
      offExtra={event.notifyBeforeValue === null && <NotifyMeOption onTurnOn={() => notify(1, 'hours')} />}
    />
  );
}
