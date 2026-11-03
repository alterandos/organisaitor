import { beforeEach, describe, expect, it } from 'vitest';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useCalendarStore } from '@/store/calendarStore';
import { convertLegacyEventTypes, initEventTypeConversion, legacyKindOf } from './eventTypeConversion';
import { setEventType } from './itemTypes';
import { builtInKeys, eventPresets } from '@/utils/itemTypes';
import { BIRTHDAY_REPEAT } from '@/utils/calendarItemInput';
import type { CalendarEventId } from '@/types';

beforeEach(() => {
  useItemTypeStore.setState(useItemTypeStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
});

const ev = (id: string) => useCalendarStore.getState().events[id as CalendarEventId];
const types = () => Object.values(useItemTypeStore.getState().types);

describe('the event type retired for Types (2026-11-03)', () => {
  it('a birthday becomes the Birthday Type, with its icon, and keeps its yearly repeat', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Mum', date: '2026-05-04', eventType: 'birthday', repeat: BIRTHDAY_REPEAT });
    expect(convertLegacyEventTypes()).toBe(1);
    const e = ev(id);
    expect(e.eventType).toBe('default');
    expect(e.icon).toBe('🎉');
    expect(e.quiet).toBe(false);
    expect(e.repeat).toEqual(BIRTHDAY_REPEAT);
    expect(builtInKeys(useItemTypeStore.getState().types, e.typeId)).toEqual(['birthday']);
    expect(legacyKindOf(e)).toEqual({ eventType: 'birthday', travelMode: null });
  });

  it('a flight becomes a Flight, a kind of Journey: shown quieter with ✈️; one copy of each Type however many', () => {
    const a = useCalendarStore.getState().addEvent({ title: 'To Rome', date: '2026-06-01', eventType: 'travel', travelMode: 'flight' });
    const b = useCalendarStore.getState().addEvent({ title: 'Back', date: '2026-06-09', eventType: 'travel', travelMode: 'flight' });
    const c = useCalendarStore.getState().addEvent({ title: 'Somewhere', date: '2026-06-10', eventType: 'travel' });
    convertLegacyEventTypes();
    expect(ev(a)).toMatchObject({ icon: '✈️', quiet: true, travelMode: null, eventType: 'default' });
    expect(ev(b).typeId).toBe(ev(a).typeId);
    expect(ev(c)).toMatchObject({ icon: '🧳', quiet: true });
    expect(types().map((t) => t.name).sort()).toEqual(['Flight', 'Journey']);
    expect(legacyKindOf(ev(a))).toEqual({ eventType: 'travel', travelMode: 'flight' });
  });

  it('an event that already has a Type keeps it, and its own icon', () => {
    const typeId = useItemTypeStore.getState().addItemType({ name: 'Exam', icon: '📝', extendsId: null, fields: [], defaults: {}, parts: [] });
    const id = useCalendarStore.getState().addEvent({ title: 'Flight to exam', date: '2026-06-01', eventType: 'travel', icon: '🛫' });
    useCalendarStore.getState().updateEvent(id, { typeId });
    convertLegacyEventTypes();
    expect(ev(id)).toMatchObject({ typeId, icon: '🛫', quiet: true });
  });

  it('once started, an event arriving as a birthday is converted straight away', () => {
    const stop = initEventTypeConversion();
    const id = useCalendarStore.getState().addEvent({ title: 'Sam', date: '2026-02-02', eventType: 'birthday' });
    expect(ev(id)).toMatchObject({ eventType: 'default', icon: '🎉' });
    stop();
  });

  it('a Type preselects only: changing an event’s Type in its pane brings its icon and Show quieter', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Trip', date: '2026-06-01' });
    const journey = useItemTypeStore.getState().addItemType({ name: 'Journey', icon: '🧳', extendsId: null, fields: [], defaults: { quiet: true }, parts: [] });
    expect(eventPresets(useItemTypeStore.getState().types, journey)).toEqual({ icon: '🧳', quiet: true, allDay: false, repeat: null });
    setEventType(id as CalendarEventId, journey);
    expect(ev(id)).toMatchObject({ typeId: journey, icon: '🧳', quiet: true });
    useCalendarStore.getState().updateEvent(id as CalendarEventId, { quiet: false });
    expect(ev(id).quiet).toBe(false);
  });
});
