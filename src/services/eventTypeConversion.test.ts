import { beforeEach, describe, expect, it } from 'vitest';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useCalendarStore } from '@/store/calendarStore';
import { legacyKindOf, restoreEventKinds } from './eventTypeConversion';
import { eventTypeIcon } from '@/config/calendarEventTypes';
import { BIRTHDAY_REPEAT } from '@/utils/calendarItemInput';
import type { CalendarEventId, ItemType, ItemTypeId } from '@/types';

beforeEach(() => {
  useItemTypeStore.setState(useItemTypeStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
});

const ev = (id: string) => useCalendarStore.getState().events[id as CalendarEventId];
const add = (patch: Parameters<ReturnType<typeof useCalendarStore.getState>['addEvent']>[0]) => useCalendarStore.getState().addEvent(patch);

describe('event kinds are back (2026-11-05): events converted on 2026-11-03 get theirs again', () => {
  it('an icon-only birthday (🎉, yearly) and journey (its mode’s icon, quiet) become a Birthday and a Travel event', () => {
    const b = add({ title: 'Mum', date: '1960-05-04', icon: '🎉', repeat: BIRTHDAY_REPEAT });
    const f = add({ title: 'To Rome', date: '2026-06-01', icon: '✈️', quiet: true });
    const plain = add({ title: 'Party', date: '2026-06-01', icon: '🎉' });   // not yearly: an ordinary event
    expect(restoreEventKinds()).toBe(2);
    expect(ev(b)).toMatchObject({ eventType: 'birthday', icon: null });
    expect(ev(f)).toMatchObject({ eventType: 'travel', travelMode: 'flight', icon: null, quiet: true });
    expect(eventTypeIcon(ev(f))).toBe('✈️');
    expect(ev(plain)).toMatchObject({ eventType: 'default', icon: '🎉' });
    expect(restoreEventKinds()).toBe(0);   // nothing twice
  });

  it('an event given the default Type gets the kind from it; the person’s own icon stays', () => {
    const typeId = 'type-train' as ItemTypeId;
    useItemTypeStore.setState({ types: { [typeId]: { id: typeId, name: 'Train', builtIn: 'train', extendsId: 'type-journey' } as unknown as ItemType,
      ['type-journey' as ItemTypeId]: { id: 'type-journey', name: 'Journey', builtIn: 'journey', extendsId: null } as unknown as ItemType } });
    const t = add({ title: 'To Sydney', date: '2026-06-01', icon: '🛤️' });
    useCalendarStore.getState().updateEvent(t, { typeId });
    expect(legacyKindOf(ev(t))).toEqual({ eventType: 'travel', travelMode: 'train' });
    restoreEventKinds();
    expect(ev(t)).toMatchObject({ eventType: 'travel', travelMode: 'train', icon: '🛤️' });
  });
});
