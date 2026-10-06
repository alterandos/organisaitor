import { useCalendarStore } from '@/store/calendarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import { trashedBy, deleteForever } from '@/services/trash';
import { inferCalendarItemFromSelection } from '@/utils/textToTask';
import { buildCalendarDeadlineInput, buildCalendarReminderInput } from '@/utils/calendarItemInput';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import type { CalendarDeadlineId, CalendarReminderId, RepeatConfig } from '@/types';
import type { NoteObjectKind } from './types';
import { formatObjectDay, formatObjectTime, formatObjectWhen } from './format';
import { DEFAULT_OBJECT_TIME, defaultObjectDate, expandShortWeekdays, readWhenInput, tidyObjectTitle } from './whenInput';

// A Reminder or a Deadline: the two calendar kinds with the same shape (a date, an optional time,
// done per occurrence), made by `\reminder` and `\deadline` from this one definition so they can't
// drift apart. What differs is only which store action and input builder each uses.
export interface DatedDraft {
  title:     string;
  date:      string | null;   // null = today
  time:      string | null;   // null = whole day
  notes:     string | null;   // links found in the text
  important: boolean;
  tentative: boolean;
  repeat:    { freq: RepeatConfig['freq']; interval: number } | null;
}

type DatedKindId = 'reminder' | 'deadline';

const today = () => todayIsoInZone(resolveTimezone(useSettingsStore.getState().timezone));

const STORE = {
  reminder: {
    add:    (input: Parameters<typeof buildCalendarReminderInput>[0]) => useCalendarStore.getState().addReminder(buildCalendarReminderInput(input)),
    remove: (id: string) => useCalendarStore.getState().deleteReminder(id as CalendarReminderId),
  },
  deadline: {
    add:    (input: Parameters<typeof buildCalendarDeadlineInput>[0]) => useCalendarStore.getState().addDeadline(buildCalendarDeadlineInput(input)),
    remove: (id: string) => useCalendarStore.getState().deleteDeadline(id as CalendarDeadlineId),
  },
} as const;

// The same reading of the text as Ctrl+Q's "Create ▸ Calendar item" (one parser, one set of
// phrase cues), except the kind is already decided. Saying nothing about when means tomorrow at
// 12:00; a date alone is a whole day.
export function datedObjectKind(kind: DatedKindId, aliases: string[]): NoteObjectKind<DatedDraft> {
  const L = LABELS.noteObjects[kind];
  return {
    id:         kind,
    targetType: kind,
    label:      LABELS.calendarItemKind[kind],
    icon:       ITEM_TYPE_ICON[kind],
    aliases,
    hint:       L.hint,

    parse(body, ctx) {
      const cal = inferCalendarItemFromSelection(expandShortWeekdays(body), [], ctx.now);
      const unsaid = !cal.date && !cal.startTime;
      return {
        title:     tidyObjectTitle(cal.title),
        date:      unsaid ? defaultObjectDate(ctx.now) : cal.date,
        time:      unsaid ? DEFAULT_OBJECT_TIME : cal.startTime,
        notes:     cal.notes,
        important: cal.important,
        tentative: cal.tentative,
        repeat:    cal.repeat,
      };
    },

    fields(draft) {
      return [
        { key: 'title', label: L.fieldTitle, value: draft.title, placeholder: L.titlePlaceholder },
        { key: 'date', label: L.fieldDate, value: draft.date ? formatObjectDay(draft.date) : '', placeholder: L.datePlaceholder },
        { key: 'time', label: L.fieldTime, value: draft.time ? formatObjectTime(draft.time) : '', placeholder: L.timePlaceholder },
      ];
    },

    applyField(draft, key, raw, ctx) {
      const text = raw.trim();
      if (key === 'title') return { ...draft, title: text };
      if (key === 'date') {
        if (!text) return { ...draft, date: null };
        const { date } = readWhenInput(text, ctx.now);
        return date ? { ...draft, date } : null;
      }
      if (key === 'time') {
        if (!text) return { ...draft, time: null };
        const { time } = readWhenInput(text, ctx.now);
        return time ? { ...draft, time } : null;
      }
      return draft;
    },

    validate: (draft) => (draft.title.trim() ? null : L.needsTitle),

    create(draft, ctx, backLinks) {
      return STORE[kind].add({
        title:        draft.title.trim(),
        date:         draft.date ?? today(),
        time:         draft.time,
        notes:        draft.notes,
        collectionId: ctx.collectionId,
        repeat:       draft.repeat ? { ...draft.repeat, endKind: 'forever', count: null, until: null } : null,
        status:       draft.tentative ? 'tentative' : 'confirmed',
        important:    draft.important,
        crossAppRefs: backLinks,
      });
    },

    discard(id) {
      for (const entry of trashedBy(() => STORE[kind].remove(id))) deleteForever(entry);
    },

    openFull(draft, ctx) {
      useUIStore.getState().showAddCalendarItem(draft.date ?? undefined, kind, draft.time ?? undefined, draft.title, {
        notes:        draft.notes,
        collectionId: ctx.collectionId,
        tentative:    draft.tentative,
        important:    draft.important,
        repeat:       draft.repeat,
      });
    },

    describe: (draft) => `${draft.title.trim()} · ${formatObjectWhen(draft.date ?? today(), draft.time)}`,
    linkText: (draft) => draft.title.trim(),
  };
}
