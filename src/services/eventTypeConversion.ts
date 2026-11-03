import { useCalendarStore } from '@/store/calendarStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { onLoaded } from '@/services/sync/hydrating';
import { addBuiltInType } from '@/services/itemTypes';
import { builtInKeys, eventPresets } from '@/utils/itemTypes';
import type { CalendarEvent, CalendarEventType, ItemTypeId, TravelMode } from '@/types';

// The event's own type (birthday, travel) retired for Types (2026-11-03, agreed with the user).
// What still says "birthday" or "travel" (an event from before, an import, the agent, words read as
// a birthday or a flight) is turned here, and only here, into the default Type (Birthday, or a
// Journey of its mode: config/builtInTypes.ts EVENT_DEFAULTS), the person's own copy made the first
// time, with that Type's icon and Show quieter. An event that already has a Type keeps it.

const isLegacy = (ev: CalendarEvent) => ev.eventType === 'birthday' || ev.eventType === 'travel';

// The person's copy of the default Type for a birthday or a journey (by its mode); null otherwise.
export function typeForEventKind(eventType: CalendarEventType | undefined, travelMode: TravelMode | null | undefined): ItemTypeId | null {
  if (eventType === 'birthday') return addBuiltInType('birthday');
  if (eventType === 'travel') return addBuiltInType(travelMode ?? 'journey');
  return null;
}

let running = false;

export function convertLegacyEventTypes(): number {
  if (running) return 0;
  running = true;
  try {
    const legacy = Object.values(useCalendarStore.getState().events).filter(isLegacy);
    for (const ev of legacy) {
      const typeId = ev.typeId ?? typeForEventKind(ev.eventType, ev.travelMode);
      const presets = eventPresets(useItemTypeStore.getState().types, typeId);
      useCalendarStore.getState().updateEvent(ev.id, {
        eventType:  'default',
        travelMode: null,
        typeId,
        typeFields: ev.typeFields ?? {},
        icon:       ev.icon ?? presets?.icon ?? null,
        quiet:      ev.quiet ?? (ev.eventType === 'travel' || !!presets?.quiet),
      });
    }
    return legacy.length;
  } finally {
    running = false;
  }
}

// At startup, after each sync load, and whenever an event arrives still saying birthday or travel.
export function initEventTypeConversion(): () => void {
  convertLegacyEventTypes();
  const offLoaded = onLoaded(() => { convertLegacyEventTypes(); });
  const offStore = useCalendarStore.subscribe((s, prev) => {
    if (s.events !== prev.events && Object.values(s.events).some(isLegacy)) convertLegacyEventTypes();
  });
  return () => { offLoaded(); offStore(); };
}

// What an event would have said before: 'birthday' or 'travel' (with its mode) from its Type, for
// what still compares in those words (an import checking whether its copy changed, or matching a
// birthday it already has).
const MODES: TravelMode[] = ['flight', 'train', 'bus', 'car', 'ferry'];
export function legacyKindOf(ev: CalendarEvent): { eventType: CalendarEventType; travelMode: TravelMode | null } {
  if (isLegacy(ev)) return { eventType: ev.eventType, travelMode: ev.travelMode ?? null };
  const keys = builtInKeys(useItemTypeStore.getState().types, ev.typeId);
  if (keys.includes('birthday')) return { eventType: 'birthday', travelMode: null };
  if (keys.includes('journey')) return { eventType: 'travel', travelMode: MODES.find((m) => keys.includes(m)) ?? null };
  return { eventType: ev.eventType, travelMode: null };
}
