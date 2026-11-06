import { useCalendarStore } from '@/store/calendarStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { onLoaded } from '@/services/sync/hydrating';
import { builtInKeys } from '@/utils/itemTypes';
import { EVENT_TYPE_ICON, TRAVEL_MODES } from '@/config/calendarEventTypes';
import type { CalendarEvent, CalendarEventType, TravelMode } from '@/types';

// Event kinds are back (2026-11-05, agreed with the user: a few built in, config/calendarEventTypes.ts,
// instead of Types). On 2026-11-03 every birthday and journey was turned into the default event
// with a Type or just an icon and Show quieter; this turns them back, and only this: an event whose
// Type was the default Birthday or a Journey (by its mode), or with no Type but the icon and look a
// birthday or journey was given (🎉 repeating yearly; a journey's icon, shown quieter). Its icon goes
// back to following its kind. Run at startup and after each sync load; an event that already has a
// kind is left alone.

const MODE_BY_ICON = new Map(TRAVEL_MODES.map((m) => [m.icon, m.value]));

// The kind an event should have, from what it was converted to; null if it's an ordinary event.
export function restoredKind(ev: CalendarEvent, keys: string[]): { eventType: CalendarEventType; travelMode: TravelMode | null } | null {
  if ((ev.eventType ?? 'default') !== 'default') return null;
  if (keys.includes('birthday')) return { eventType: 'birthday', travelMode: null };
  if (keys.includes('journey')) return { eventType: 'travel', travelMode: TRAVEL_MODES.find((m) => keys.includes(m.value))?.value ?? null };
  if (ev.typeId) return null;
  if (ev.icon === EVENT_TYPE_ICON.birthday && ev.repeat?.freq === 'yearly') return { eventType: 'birthday', travelMode: null };
  if (ev.quiet && ev.icon && (ev.icon === '🧳' || ev.icon === EVENT_TYPE_ICON.travel || MODE_BY_ICON.has(ev.icon))) return { eventType: 'travel', travelMode: MODE_BY_ICON.get(ev.icon) ?? null };
  return null;
}

let running = false;

export function restoreEventKinds(): number {
  if (running) return 0;
  running = true;
  try {
    const types = useItemTypeStore.getState().types;
    let n = 0;
    for (const ev of Object.values(useCalendarStore.getState().events)) {
      const kind = restoredKind(ev, builtInKeys(types, ev.typeId));
      if (!kind) continue;
      // The icon it was given by the conversion: back to following its kind (a journey's mode).
      const given = ev.icon === EVENT_TYPE_ICON[kind.eventType] || (kind.eventType === 'travel' && !!ev.icon && (ev.icon === '🧳' || MODE_BY_ICON.has(ev.icon)));
      useCalendarStore.getState().updateEvent(ev.id, { ...kind, icon: given ? null : ev.icon ?? null });
      n++;
    }
    return n;
  } finally {
    running = false;
  }
}

export function initEventKinds(): () => void {
  restoreEventKinds();
  return onLoaded(() => { restoreEventKinds(); });
}

// An event's kind and mode, for what compares them (an import checking whether its copy changed, or
// matching a birthday it already has): its own, or the one it will be given back.
export function legacyKindOf(ev: CalendarEvent): { eventType: CalendarEventType; travelMode: TravelMode | null } {
  if (ev.eventType === 'birthday' || ev.eventType === 'travel') return { eventType: ev.eventType, travelMode: ev.travelMode ?? null };
  return restoredKind(ev, builtInKeys(useItemTypeStore.getState().types, ev.typeId)) ?? { eventType: ev.eventType, travelMode: null };
}
