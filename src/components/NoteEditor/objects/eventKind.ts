import { useCalendarStore } from '@/store/calendarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import { trashedBy, deleteForever } from '@/services/trash';
import { inferCalendarItemFromSelection } from '@/utils/textToTask';
import { buildCalendarEventInput } from '@/utils/calendarItemInput';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import type { CalendarEventId, RepeatConfig } from '@/types';
import type { NoteObjectKind } from './types';
import { formatObjectDay, formatObjectTimeRange, formatObjectWhen } from './format';
import { DEFAULT_OBJECT_TIME, defaultObjectDate, endAfter, expandShortWeekdays, readWhenInput, tidyObjectTitle } from './whenInput';

export interface EventDraft {
  title:     string;
  date:      string | null;   // null = today
  startTime: string | null;   // null = whole day
  endTime:   string | null;
  location:  string | null;
  notes:     string | null;   // further links found in the text
  eventType: 'default' | 'birthday' | 'travel';
  important: boolean;
  tentative: boolean;
  repeat:    { freq: RepeatConfig['freq']; interval: number } | null;
}

const L = LABELS.noteObjects.event;

const today = () => todayIsoInZone(resolveTimezone(useSettingsStore.getState().timezone));

// `\event lunch with Sam fri 1-2pm`. Read by the same parser as Ctrl+Q's "Create ▸ Calendar item"
// (time ranges, meeting links as the place, birthday/travel), with the kind decided. Saying nothing
// about when means tomorrow 12:00–13:00; a start alone gets an hour.
export const eventKind: NoteObjectKind<EventDraft> = {
  id:         'event',
  targetType: 'event',
  label:      LABELS.calendarItemKind.event,
  icon:       ITEM_TYPE_ICON.event,
  aliases:    ['ev', 'e', 'meet', 'meeting'],
  hint:       L.hint,

  parse(body, ctx) {
    const cal = inferCalendarItemFromSelection(expandShortWeekdays(body), [], ctx.now);
    const birthday = cal.eventType === 'birthday';
    const unsaid = !cal.date && !cal.startTime && !birthday;
    const startTime = unsaid ? DEFAULT_OBJECT_TIME : birthday ? null : cal.startTime;
    return {
      title:     tidyObjectTitle(cal.title),
      date:      unsaid ? defaultObjectDate(ctx.now) : cal.date,
      startTime,
      endTime:   birthday ? null : cal.endTime ?? (startTime ? endAfter(startTime) : null),
      location:  cal.location,
      notes:     cal.notes,
      eventType: cal.eventType,
      important: cal.important,
      tentative: cal.tentative,
      repeat:    cal.repeat,
    };
  },

  fields(draft) {
    return [
      { key: 'title', label: L.fieldTitle, value: draft.title, placeholder: L.titlePlaceholder },
      { key: 'date', label: L.fieldDate, value: draft.date ? formatObjectDay(draft.date) : '', placeholder: L.datePlaceholder },
      { key: 'time', label: L.fieldTime, value: draft.startTime ? formatObjectTimeRange(draft.startTime, draft.endTime) : '', placeholder: L.timePlaceholder },
      { key: 'where', label: L.fieldWhere, value: draft.location ?? '', placeholder: L.wherePlaceholder },
    ];
  },

  applyField(draft, key, raw, ctx) {
    const text = raw.trim();
    if (key === 'title') return { ...draft, title: text };
    if (key === 'where') return { ...draft, location: text || null };
    if (key === 'date') {
      if (!text) return { ...draft, date: null };
      const { date } = readWhenInput(text, ctx.now);
      return date ? { ...draft, date } : null;
    }
    if (key === 'time') {
      if (!text) return { ...draft, startTime: null, endTime: null };
      const { time, endTime } = readWhenInput(text, ctx.now);
      return time ? { ...draft, startTime: time, endTime: endTime ?? endAfter(time) } : null;
    }
    return draft;
  },

  validate: (draft) => (draft.title.trim() ? null : L.needsTitle),

  create(draft, ctx, backLinks) {
    return useCalendarStore.getState().addEvent(buildCalendarEventInput({
      title:        draft.title.trim(),
      date:         draft.date ?? today(),
      startTime:    draft.startTime,
      endTime:      draft.endTime,
      location:     draft.location,
      notes:        draft.notes,
      eventType:    draft.eventType,
      collectionId: ctx.collectionId,
      repeat:       draft.repeat ? { ...draft.repeat, endKind: 'forever', count: null, until: null } : null,
      status:       draft.tentative ? 'tentative' : 'confirmed',
      important:    draft.important,
      crossAppRefs: backLinks,
    }));
  },

  discard(id) {
    for (const entry of trashedBy(() => useCalendarStore.getState().deleteEvent(id as CalendarEventId))) deleteForever(entry);
  },

  openFull(draft, ctx) {
    useUIStore.getState().showAddCalendarItem(draft.date ?? undefined, 'event', draft.startTime ?? undefined, draft.title, {
      endTime:      draft.endTime,
      notes:        draft.notes,
      location:     draft.location,
      collectionId: ctx.collectionId,
      eventType:    draft.eventType,
      tentative:    draft.tentative,
      important:    draft.important,
      repeat:       draft.repeat,
    });
  },

  describe: (draft) => `${draft.title.trim()} · ${formatObjectWhen(draft.date ?? today(), draft.startTime, undefined, draft.endTime)}`,
  linkText: (draft) => draft.title.trim(),
};
