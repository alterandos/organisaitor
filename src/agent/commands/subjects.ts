import { LABELS } from '@/config/labels';
import { TYPES_ENABLED } from '@/config/features';
import { z } from 'zod';
import { defineCommand } from '@/agent/types';
import { read, write } from '@/agent/access';
import { AgentError } from '@/agent/errors';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import { clashingClasses } from '@/utils/classClashes';
import { resolveItemType } from '@/utils/itemTypes';
import { itemOccurrences, repeatingItemsOf } from '@/utils/itemOccurrences';
import { addDaysToIso } from '@/utils/date';
import { expandRepeat, isOccurrenceSkipped } from '@/utils/recurrence';
import { blankDraft, classTitles, draftFromDeadline, draftFromEvent, isSubject, scheduleListOf, workListOf, worthOf, WORTH_FIELD, type SubjectItemDraft } from '@/utils/subjectItems';
import type { CalendarDeadline, CalendarEvent, Collection, EndeavourPeriod } from '@/types';
import { compact, dateStr, endeavourSummary, idStr, repeatSchema, repeatText, requireEndeavour, timeStr, toRepeatConfig } from './shared';

// Semesters and subjects (docs/features/endeavours.md phase 7 (d)), through the same templates and
// services as the template picker and the subject editor: a semester holds a period, breaks and an
// exam period that its subjects take live; a subject holds two lists of its real items, Schedule
// (calendar events: what you go to) and Work (Deadlines: what you do or hand in).

const breakSchema = z.object({ label: z.string().trim().max(100).default(''), from: dateStr, to: dateStr });

const byId = (list: Collection[]) => Object.fromEntries(list.map((c) => [c.id, c]));
const assertOrder = (from: string | null | undefined, to: string | null | undefined, what: string) => {
  if (from && to && to < from) throw new AgentError('invalid', `${what}: the end is before the start.`);
};
const assertNoDuplicate = (name: string) => {
  const dupe = read.endeavours().find((e) => !e.archivedAt && e.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (dupe) throw new AgentError('conflict', `An Endeavour named "${dupe.name}" already exists (id ${dupe.id}). Use that one.`);
};

function requireSubject(id: string): Collection {
  const c = requireEndeavour(id);
  if (!isSubject(c)) throw new AgentError('invalid', `"${c.name}" isn't a subject. Its Schedule and Work are kept on subjects: make one with create_subject.`);
  return c;
}

function typeIdOf(name: string | null | undefined) {
  if (!name) return null;
  const t = read.itemTypes().find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  if (!t) throw new AgentError('invalid', `No Type named "${name}". Types: ${read.itemTypes().map((x) => x.name).join(', ') || 'none yet'}.`);
  return t.id;
}

function periodOut(id: string) {
  const eff = effectivePeriod(id, byId(read.endeavours()));
  if (!eff) return null;
  const p = eff.period;
  return compact({
    start: p.start, end: p.end, breaks: p.breaks.map((b) => ({ label: b.label, from: b.from, to: b.to })),
    exams: p.exams ?? undefined, inheritedFrom: eff.inherited ? read.endeavour(eff.from)?.name : undefined,
  });
}

function itemOut(d: SubjectItemDraft, id: string) {
  return compact({
    id, title: d.title, type: d.typeId ? read.itemTypes().find((t) => t.id === d.typeId)?.name : undefined,
    date: d.date, start: d.start, end: d.end, place: d.place, worth: worthOf(d) ?? undefined, notes: d.notes,
    repeat: d.follow ? undefined : repeatText(d.repeat), follows: d.follow ?? undefined,
  });
}

const itemFields = {
  title:  z.string().trim().min(1).max(200),
  type:   z.string().trim().max(100).nullish().describe(TYPES_ENABLED ? 'A Type by name (Lecture, Tutorial, Assessment, Essay, Exam, Reading…), from get_subject or get_context' : 'Types are switched off for now: leave this out'),
  date:   dateStr.describe('Schedule: its (first) date. Work: when it is due. Ignored when followClass is given'),
  start:  timeStr.nullish().describe('Schedule: from. Work: due by'),
  end:    timeStr.nullish().describe('Schedule only: until'),
  place:  z.string().trim().max(300).nullish().describe('Schedule only: where'),
  worth:  z.number().min(0).max(100).nullish().describe(TYPES_ENABLED
    ? 'Work only: what it counts for, in percent (kept in its Type\'s Weight field, so give a Type that has one, such as Assessment)'
    : 'Work only: what it counts for, in percent (kept as the first line of its notes, "Worth 40%")'),
  notes:  z.string().max(2000).nullish().describe('Anything else, e.g. "best 8 of 9 count"'),
  repeat: repeatSchema.nullish().describe('How it repeats. A subject\'s repeats end with its period and skip its breaks by themselves'),
  onDates: z.array(dateStr).min(1).max(60).optional().describe('Instead of repeat: every date it falls on (an almost-weekly quiz)'),
  followClass: z.object({
    title: z.string().trim().min(1).describe('A repeating Schedule item\'s title, e.g. "GEOS215 lecture": every item with that title is followed'),
    offsetDays: z.number().int().min(-30).max(30).describe('-1 = the day before each, 0 = the same day, 2 = two days after'),
  }).optional().describe('Work only, instead of date and repeat: before or after each class'),
};

type ItemInput = { [K in keyof typeof itemFields]?: z.output<(typeof itemFields)[K]> };

// Types switched off: an item's worth is the first line of its notes ("Worth 40%"), replaced when it changes.
const WORTH_LINE = /^Worth \d+(?:\.\d+)?%$/;
function withWorthNote(notes: string | null, worth: number | null): string | null {
  const rest = (notes ?? '').split('\n').filter((l) => !WORTH_LINE.test(l.trim())).join('\n').trim();
  return [worth !== null ? LABELS.subjectEditor.worthNote(worth) : '', rest].filter(Boolean).join('\n') || null;
}

// The draft an input describes, on top of `base` (a new item's blank, or the item as it is).
function applyInput(base: SubjectItemDraft, i: ItemInput): SubjectItemDraft {
  const work = base.kind === 'work';
  if (!work && (i.followClass || i.worth != null)) throw new AgentError('invalid', 'followClass and worth are for Work items only.');
  if (work && (i.end || i.place)) throw new AgentError('invalid', 'end and place are for Schedule items only.');
  if (i.repeat && i.onDates) throw new AgentError('invalid', 'Give repeat or onDates, not both.');
  const d: SubjectItemDraft = { ...base };
  if (i.title !== undefined) d.title = i.title;
  // Types are switched off for now (config/features.ts): none can be given, and worth goes in the notes.
  if (!TYPES_ENABLED && i.type) throw new AgentError('invalid', 'Types are switched off in this app for now: leave type out (put what kind of item it is in its title or notes).');
  if (i.type !== undefined) d.typeId = TYPES_ENABLED ? typeIdOf(i.type) : null;
  if (i.date !== undefined) d.date = i.date;
  if (i.start !== undefined) d.start = i.start ?? null;
  if (i.end !== undefined) d.end = i.end ?? null;
  if (i.place !== undefined) d.place = i.place ?? null;
  if (i.notes !== undefined) {
    // Types switched off: new notes keep the worth line they replace, unless a worth is given too.
    const kept = TYPES_ENABLED ? null : (base.notes ?? '').split('\n').map((l) => l.trim()).find((l) => WORTH_LINE.test(l));
    d.notes = [kept, i.notes].filter(Boolean).join('\n') || null;
  }
  if (i.worth !== undefined && TYPES_ENABLED) d.typeFields = { ...d.typeFields, [WORTH_FIELD]: i.worth ?? null };
  if (i.worth !== undefined && !TYPES_ENABLED) d.notes = withWorthNote(d.notes, i.worth ?? null);
  if (i.repeat !== undefined) { d.repeat = i.repeat ? toRepeatConfig(i.repeat) : null; d.follow = null; }
  if (i.onDates) {
    const dates = [...new Set(i.onDates)].sort();
    d.repeat = { freq: 'dates', interval: 1, endKind: 'forever', count: null, until: null, dates };
    d.date = dates[0];
    d.follow = null;
  }
  if (i.followClass) { d.follow = { title: i.followClass.title, offsetDays: i.followClass.offsetDays }; d.repeat = null; }
  assertOrder(d.start, d.end, 'Times');
  if (i.worth != null && TYPES_ENABLED) {
    const types = Object.fromEntries(read.itemTypes().map((t) => [t.id, t]));
    if (!resolveItemType(types, d.typeId)?.fields.some((f) => f.id === WORTH_FIELD)) throw new AgentError('invalid', 'worth is kept in a Type\'s Weight field: give a type that has one, such as Assessment.');
  }
  return d;
}

function save(subject: Collection, d: SubjectItemDraft, existing?: string) {
  if (d.follow && !classTitles(scheduleListOf(subject.id, Object.fromEntries(read.events().map((e) => [e.id, e])))).includes(d.follow.title)) {
    throw new AgentError('invalid', `No repeating Schedule item titled "${d.follow.title}" in ${subject.name}. Call get_subject for its classes.`);
  }
  const id = write.saveSubjectItem(subject.id, d, existing);
  if (!id) throw new AgentError('invalid', 'The classes it follows have no dates yet, so there is nothing to put it on.');
  return id;
}

export const createSemester = defineCommand({
  name: 'create_semester',
  description:
    'Set up a semester (an Endeavour): its teaching period, breaks and exam period, its subjects (each a subject Endeavour part of it, taking its dates and breaks live), ' +
    'and, if wanted, an admin list, a weekly planning rhythm and a goal for the average. Check get_context first: it may already exist. ' +
    'Add classes and work to each subject with add_subject_item. Because this makes a lot at once, the user is asked to approve it.',
  tier: 'create',
  approval: 'review',
  input: z.object({
    name: z.string().trim().min(1).max(200),
    teachingStart: dateStr.nullish(),
    teachingEnd: dateStr.nullish(),
    examsFrom: dateStr.nullish(),
    examsTo: dateStr.nullish(),
    breaks: z.array(breakSchema).max(10).default([]),
    subjects: z.array(z.string().trim().min(1).max(200)).max(12).default([]).describe('Each subject\'s name, code first if it has one: "GEOS215 Climate Systems"'),
    adminList: z.boolean().default(true).describe('An admin list (enrolment, fees, forms)'),
    planWeekOn: z.number().int().min(0).max(6).nullish().describe('A weekly planning rhythm on this weekday (0 = Sunday); absent = none'),
    averageTarget: z.number().min(1).max(100).nullish().describe('A goal for the average mark, in percent; absent = none'),
  }),
  describe: (i) => `Set up semester "${i.name}"${i.subjects.length ? ` with ${i.subjects.length} subject${i.subjects.length === 1 ? '' : 's'}` : ''}`,
  run: (input, ctx) => {
    assertNoDuplicate(input.name);
    assertOrder(input.teachingStart, input.teachingEnd, 'Teaching');
    assertOrder(input.examsFrom, input.examsTo, 'Exams');
    for (const b of input.breaks) assertOrder(b.from, b.to, `Break "${b.label}"`);
    const id = write.applyTemplate('semester', {
      name: input.name, start: input.teachingStart ?? '', end: input.teachingEnd ?? '', examsFrom: input.examsFrom ?? '', examsTo: input.examsTo ?? '',
      breaks: input.breaks.map((b, n) => ({ _id: `b${n}`, label: b.label, from: b.from, to: b.to })),
      subjects: input.subjects.join('\n'), admin: input.adminList, planDay: input.planWeekOn ?? -1, average: input.averageTarget ?? null,
    }, null);
    ctx.seen('endeavour', id);
    const subjects = read.endeavours().filter((c) => c.links?.some((l) => l.kind === 'partOf' && l.targetId === id));
    return { created: endeavourSummary(requireEndeavour(id)), subjects: subjects.map((s) => ({ id: s.id, name: s.name })), period: periodOut(id) };
  },
});

export const createSubject = defineCommand({
  name: 'create_subject',
  description:
    'Set up a subject (an Endeavour with a notebook, the University Types, and optionally a goal for its mark), part of a semester if given, ' +
    'whose period and breaks it then takes. Then add its classes (Schedule) and work with add_subject_item.',
  tier: 'create',
  approval: 'auto',
  input: z.object({
    name: z.string().trim().min(1).max(200).describe('Its name, without the code: "Climate Systems"'),
    code: z.string().trim().max(40).nullish().describe('Its code, e.g. GEOS215'),
    semesterId: idStr.nullish().describe('The semester (or any Endeavour) it is part of'),
    targetMark: z.number().min(1).max(100).nullish().describe('A goal: at least this mark, in percent'),
  }),
  describe: (i) => `Set up subject "${[i.code, i.name].filter(Boolean).join(' ')}"`,
  run: (input, ctx) => {
    const full = [input.code, input.name].filter(Boolean).join(' ');
    assertNoDuplicate(full);
    if (input.semesterId) requireEndeavour(input.semesterId);
    const id = write.applyTemplate('subject', { code: input.code ?? '', name: input.name, target: input.targetMark ?? null }, input.semesterId ?? null);
    ctx.seen('endeavour', id);
    return { created: endeavourSummary(requireEndeavour(id)), period: periodOut(id) };
  },
});

export const getSubject = defineCommand({
  name: 'get_subject',
  description:
    'A subject\'s period (its own or its semester\'s), and its two lists: Schedule (calendar events: classes, labs, field trips) and Work (Deadlines: readings, quizzes, assignments, exams), ' +
    'each with its id for update_subject_item. For a semester, lists its subjects and period.',
  tier: 'read',
  approval: 'auto',
  input: z.object({ endeavourId: idStr }),
  run: (input, ctx) => {
    const c = requireEndeavour(input.endeavourId);
    ctx.seen('endeavour', c.id);
    const parts = read.endeavours().filter((x) => !x.archivedAt && x.links?.some((l) => l.kind === 'partOf' && l.targetId === c.id));
    if (!isSubject(c)) return compact({ endeavour: endeavourSummary(c), period: periodOut(c.id), subjects: parts.filter(isSubject).map((s) => ({ id: s.id, name: s.name })) });
    const events = Object.fromEntries(read.events().map((e) => [e.id, e]));
    const deadlines = Object.fromEntries(read.deadlines().map((d) => [d.id, d]));
    const schedule = scheduleListOf(c.id, events);
    const work = workListOf(c.id, deadlines);
    for (const e of schedule) ctx.seen('event', e.id);
    for (const d of work) ctx.seen('deadline', d.id);
    // The last two weeks: Work behind (not done), classes not marked as attended.
    const today = read.today();
    const recent = itemOccurrences(repeatingItemsOf(c.id, events, deadlines), { events, deadlines }, addDaysToIso(today, -14), addDaysToIso(today, -1), today)
      .filter((o) => o.state === 'behind' || o.state === 'notMarked')
      .map((o) => ({ itemId: (o.copy ?? o.series).id, title: (o.copy ?? o.series).title, date: o.date, state: o.state }));
    return compact({
      subject: endeavourSummary(c), period: periodOut(c.id),
      schedule: schedule.map((e) => itemOut(draftFromEvent(e), e.id)),
      work: work.map((d) => itemOut(draftFromDeadline(d, events), d.id)),
      behindOrUnmarked: recent,
    });
  },
});

export const addSubjectItem = defineCommand({
  name: 'add_subject_item',
  description:
    'Add to a subject\'s Schedule (kind "schedule": what you go to, e.g. a weekly lecture or a one-off field trip) or Work (kind "work": what you do or hand in, ' +
    'e.g. a weekly quiz worth 10%, an essay, or a reading 1 day before each lecture via followClass). Repeats end with the subject\'s period and skip its breaks by themselves. ' +
    'Call get_subject first for its classes and Types.',
  tier: 'create',
  approval: 'auto',
  input: z.object({
    subjectId: idStr, kind: z.enum(['schedule', 'work']), ...itemFields,
    inClass: z.enum(['instead', 'during', 'both']).optional()
      .describe('When it falls in a repeating class of the subject (an in-class essay or quiz): shown instead of the class that day, during it (drawn on the class), or both as a clash (the default)'),
  }),
  describe: (i) => `Add "${i.title}" to the subject's ${i.kind === 'work' ? 'Work' : 'Schedule'}`,
  run: (input, ctx) => {
    const subject = requireSubject(input.subjectId);
    const { subjectId: _s, kind, inClass, ...fields } = input;
    void _s;
    const draft = applyInput(blankDraft(kind, input.date), fields);
    if (inClass && inClass !== 'both') {
      // The subject's own class it falls in (clashes are with any event; the agent's inClass means its classes).
      const clash = clashingClasses({ date: draft.date, start: draft.start, end: draft.end }, Object.fromEntries(read.events().filter((e) => e.collectionId === subject.id && e.repeat).map((e) => [e.id, e])))[0];
      if (!clash) throw new AgentError('invalid', 'It doesn\'t fall in any repeating class of this subject; leave inClass out.');
      draft.onClass = { eventId: clash.event.id, date: clash.dates[0], mode: inClass === 'instead' ? 'replaces' : 'during' };
    }
    const id = save(subject, draft);
    ctx.seen(kind === 'work' ? 'deadline' : 'event', id);
    return { added: id };
  },
});

export const updateSubjectItem = defineCommand({
  name: 'update_subject_item',
  description:
    'Change an item of a subject\'s Schedule or Work (ids from get_subject): its title, Type, date, times, place, worth, notes, how it repeats, or the class it follows. ' +
    'Only the fields given change. To change one date of a repeating item only, use edit_occurrence; to remove an item, archive_item.',
  tier: 'modify',
  approval: 'auto',
  input: z.object({ itemId: idStr, ...Object.fromEntries(Object.entries(itemFields).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof itemFields]: z.ZodOptional<(typeof itemFields)[K]> } }),
  describe: () => 'Change an item of a subject',
  run: (input, ctx) => {
    const { itemId, ...fields } = input;
    const event = read.event(itemId);
    const deadline = event ? undefined : read.deadline(itemId);
    const item: CalendarEvent | CalendarDeadline | undefined = event ?? deadline;
    if (!item?.collectionId) throw new AgentError('not_found', `No Schedule or Work item with id "${itemId}". Call get_subject for the ids.`);
    const subject = requireSubject(item.collectionId);
    const events = Object.fromEntries(read.events().map((e) => [e.id, e]));
    const base = event ? draftFromEvent(event) : draftFromDeadline(deadline!, events);
    const id = save(subject, applyInput(base, fields as ItemInput), itemId);
    ctx.seen(event ? 'event' : 'deadline', id);
    const after = event ? read.event(id) : read.deadline(id);
    return { updated: after ? itemOut(event ? draftFromEvent(after as CalendarEvent) : draftFromDeadline(after as CalendarDeadline, events), id) : id };
  },
});

export const setPeriod = defineCommand({
  name: 'set_period',
  description:
    'Set an Endeavour\'s period: teaching start and end, its breaks and an exam period (a semester\'s; a subject with its own dates, such as a summer subject). ' +
    'Everything part of it takes it live, and its classes and repeating work end with it and skip its breaks. inherit: true takes the one from what it\'s part of instead.',
  tier: 'modify',
  approval: 'auto',
  input: z.object({
    endeavourId: idStr,
    inherit: z.boolean().optional().describe('Drop its own period and take the one above'),
    start: dateStr.nullish(),
    end: dateStr.nullish(),
    breaks: z.array(breakSchema).max(10).optional().describe('Replaces its breaks'),
    examsFrom: dateStr.nullish(),
    examsTo: dateStr.nullish(),
  }),
  describe: (i) => (i.inherit ? 'Take the period from above' : 'Set the period'),
  run: (input, ctx) => {
    const c = requireEndeavour(input.endeavourId);
    ctx.seen('endeavour', c.id);
    if (input.inherit) {
      write.updateEndeavour(c.id, { period: null });
      return { period: periodOut(c.id) };
    }
    const base: EndeavourPeriod = c.period ?? structuredClone(effectivePeriod(c.id, byId(read.endeavours()))?.period ?? { start: null, end: null, breaks: [] });
    const next: EndeavourPeriod = {
      ...base,
      ...(input.start !== undefined ? { start: input.start ?? null } : {}),
      ...(input.end !== undefined ? { end: input.end ?? null } : {}),
      ...(input.breaks ? { breaks: input.breaks.map((b, n) => ({ id: `b${n}-${b.from}`, label: b.label, from: b.from, to: b.to })) } : {}),
    };
    if (input.examsFrom !== undefined || input.examsTo !== undefined) {
      const from = input.examsFrom === undefined ? base.exams?.from : input.examsFrom;
      const to = input.examsTo === undefined ? base.exams?.to : input.examsTo;
      next.exams = from ? { from, to: to ?? from } : null;
    }
    assertOrder(next.start, next.end, 'Period');
    assertOrder(next.exams?.from, next.exams?.to, 'Exams');
    for (const b of next.breaks) assertOrder(b.from, b.to, `Break "${b.label}"`);
    write.updateEndeavour(c.id, { period: next });
    return { period: periodOut(c.id) };
  },
});

export const markSubjectDate = defineCommand({
  name: 'mark_subject_date',
  description:
    'Mark one date of a subject\'s repeating item: Work done (or not done), or a class attended (or not). Ids and dates from get_subject ' +
    '(its behindOrUnmarked list). Only Work counts as behind; a class not marked shows as not attended.',
  tier: 'modify',
  approval: 'auto',
  input: z.object({ itemId: idStr, date: dateStr, done: z.boolean().default(true).describe('false takes the mark off') }),
  describe: (i) => `Mark ${i.date} ${i.done ? 'done' : 'not done'}`,
  run: (input, ctx) => {
    const event = read.event(input.itemId);
    const deadline = event ? undefined : read.deadline(input.itemId);
    const item = event ?? deadline;
    if (!item?.collectionId) throw new AgentError('not_found', `No Schedule or Work item with id "${input.itemId}". Call get_subject for the ids.`);
    requireSubject(item.collectionId);
    const falls = item.date === input.date ? !isOccurrenceSkipped(item.repeat, item.date) : !!item.repeat && expandRepeat(item.date, item.repeat, input.date, input.date).length > 0;
    if (!falls) throw new AgentError('invalid', `"${item.title}" doesn't fall on ${input.date}.`);
    write.markDate(event ? 'class' : 'work', item.id, input.date, input.done);
    ctx.seen(event ? 'event' : 'deadline', item.id);
    return { marked: { itemId: item.id, date: input.date, [event ? 'attended' : 'done']: input.done } };
  },
});

export const SUBJECT_COMMANDS = [createSemester, createSubject, getSubject, addSubjectItem, updateSubjectItem, setPeriod, markSubjectDate];
