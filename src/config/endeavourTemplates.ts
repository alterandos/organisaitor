import { nanoid } from 'nanoid';
import type { GoalMeasure, RepeatConfig, StreamKind, TaskKind } from '@/types';
import type { StarterSet } from '@/config/typeStarters';
import { CLASS_TYPES, readCourseOutline, weekDate } from '@/utils/courseOutline';
import { addDaysToIso, todayIso } from '@/utils/date';

// Templates that set up a whole Endeavour (docs/features/endeavours.md phase 6, "Easy creation").
// A template is its form (inputs) and a pure `plan` from what's filled in to what will be made;
// services/endeavourTemplates.ts makes a plan (with one Undo). A new template is one entry here.
// The University set of Types comes with the University subject template, never built in.
//
// Flexibility first (the user, 2026-10-30): a template speeds things up but can't foresee every
// course, so what varies is a list of rows the person adds to ("rows" inputs: a repeating group,
// each row its own details), never a fixed set of fields.

export type TemplateInputKind = 'text' | 'date' | 'time' | 'days' | 'weekday' | 'number' | 'checkbox' | 'lines' | 'rows';

export interface SelectOption { value: string; label: string }

// A field in one row of a "rows" input.
export interface TemplateColumn {
  id:           string;
  label:        string;
  kind:         'text' | 'time' | 'date' | 'weekday' | 'number' | 'select';
  // A select's choices: fixed, or worked out from the rest of the form (the classes added above).
  options?:     SelectOption[] | ((values: TemplateValues) => SelectOption[]);
  placeholder?: string;
  // Shown only when the row's other fields make it relevant (a weekday for a weekly task).
  showIf?:      (row: TemplateRow) => boolean;
  initial?:     unknown;
}

export type TemplateRow = Record<string, unknown> & { _id: string };

export interface TemplateInput {
  id:           string;
  label:        string;
  kind:         TemplateInputKind;
  placeholder?: string;
  initial?:     unknown;
  hint?:        string;
  columns?:     TemplateColumn[];   // rows
  addLabel?:    string;             // rows: "+ Add a class"
}

export type TemplateValues = Record<string, unknown>;

export interface PlanBlock { key: string; title: string; days: number[]; start: string; end: string; location: string | null }
export interface PlanEvent { title: string; date: string; start: string | null; end: string | null; location: string | null }
export interface PlanStream {
  label:      string;
  kind:       StreamKind;
  start:      string;
  time:       string | null;
  rule:       { kind: 'repeat'; repeat: RepeatConfig } | { kind: 'relative'; blockKeys: string[]; offsetDays: number };
  typeName:   string | null;
  toNotebook: boolean;          // its notes go in the plan's notebook
  worth:      number | null;
}
export type PlanGoalMeasure =
  | Exclude<GoalMeasure, { kind: 'consistency' } | { kind: 'tracker' }>
  | { kind: 'consistency'; streamLabel: string; count: number; outOf: number };

export interface TemplatePlan {
  endeavour:    { name: string; kind: 'project' | 'list'; deadline: string | null };
  notebook:     { name: string } | null;
  timetable:    { name: string; startDate: string | null; endDate: string | null; blocks: PlanBlock[] } | null;
  events:       PlanEvent[];
  rhythm:       { name: string; streams: PlanStream[] } | null;
  starterTypes: StarterSet | null;
  deadlines:    { title: string; date: string; typeName: string | null; fields: Record<string, unknown> }[];
  tasks:        { title: string; kind: TaskKind }[];
  goals:        { title: string; by: string | null; measure: PlanGoalMeasure }[];
}

export interface EndeavourTemplate {
  id:          string;
  label:       string;
  icon:        string;
  description: string;
  inputs:      TemplateInput[];
  // The magic wand (components/MagicWand): reads pasted text into the form's values.
  wand?:       { hint: string; read: (text: string, values: TemplateValues) => TemplateValues | null };
  plan:        (values: TemplateValues) => TemplatePlan;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const days = (v: unknown) => (Array.isArray(v) ? (v as number[]) : []);
const rows = (v: unknown) => (Array.isArray(v) ? (v as TemplateRow[]) : []);
const weekly = (d: number[], interval = 1): RepeatConfig => ({ freq: 'weekly', interval, endKind: 'forever', count: null, until: null, daysOfWeek: d });
export const newRow = (fields: Record<string, unknown> = {}): TemplateRow => ({ _id: nanoid(8), ...fields });

const EMPTY_PLAN = { notebook: null, timetable: null, events: [], rhythm: null, starterTypes: null, deadlines: [], tasks: [], goals: [] };

// ── University subject: the rows ────────────────────────────────────────────

const CLASS_OPTIONS: SelectOption[] = CLASS_TYPES.map((t) => ({ value: t, label: t }));
const TASK_KINDS: SelectOption[] = [{ value: 'doBy', label: 'To do' }, { value: 'submit', label: 'To hand in' }];
const FREQUENCIES: SelectOption[] = [
  { value: 'weekly', label: 'Every week' }, { value: 'fortnightly', label: 'Every 2 weeks' },
  { value: 'before', label: 'Before each class' }, { value: 'after', label: 'After each class' },
];
const TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: '—' }, { value: 'Assessment', label: 'Assessment' }, { value: 'Essay', label: 'Essay' },
  { value: 'Exam', label: 'Exam' }, { value: 'Reading', label: 'Reading' },
];
const WHEN_MODES: SelectOption[] = [
  { value: 'date', label: 'On a date' }, { value: 'week', label: 'In a teaching week' },
  { value: 'after', label: 'After…' }, { value: 'before', label: 'Before…' },
];
const UNITS: SelectOption[] = [{ value: 'days', label: 'days' }, { value: 'weeks', label: 'weeks' }];

// The class types added in "Regular classes", for a routine task that follows them.
const classTypesIn = (v: TemplateValues): SelectOption[] =>
  [...new Set(rows(v.classes).map((r) => str(r.type)).filter(Boolean))].map((t) => ({ value: t, label: t }));
// What a one-off task can be dated from: teaching's start and end, and each one-off class.
const anchorsIn = (v: TemplateValues): SelectOption[] => [
  { value: 'start', label: 'Teaching starts' }, { value: 'end', label: 'Teaching ends' },
  ...rows(v.oneOffs).filter((r) => str(r.title)).map((r) => ({ value: r._id, label: str(r.title) })),
];

const isRepeat = (r: TemplateRow) => r.freq === 'weekly' || r.freq === 'fortnightly';
const isRelativeTask = (r: TemplateRow) => r.freq === 'before' || r.freq === 'after';
const whenIs = (...modes: string[]) => (r: TemplateRow) => modes.includes(str(r.when) || 'date');

// A one-off row's date: on a date, a teaching week's day, or so long before or after an anchor.
function rowDate(r: TemplateRow, v: TemplateValues, resolved: Map<string, string>): string | null {
  const start = str(v.start) || null;
  const mode = str(r.when) || 'date';
  if (mode === 'date') return str(r.date) || null;
  if (mode === 'week') return start && num(r.week) ? weekDate(start, num(r.week)!, typeof r.day === 'number' && r.day >= 0 ? r.day : null) : null;
  const anchor = str(r.anchor) === 'start' ? start : str(r.anchor) === 'end' ? str(v.end) || null : resolved.get(str(r.anchor)) ?? null;
  if (!anchor) return null;
  const n = (num(r.offset) ?? 0) * (r.unit === 'weeks' ? 7 : 1);
  return addDaysToIso(anchor, mode === 'before' ? -n : n);
}

const WHEN_COLUMNS: TemplateColumn[] = [
  { id: 'when', label: 'When', kind: 'select', options: WHEN_MODES, initial: 'date' },
  { id: 'date', label: 'Date', kind: 'date', showIf: whenIs('date') },
  { id: 'week', label: 'Week', kind: 'number', showIf: whenIs('week') },
  { id: 'day', label: 'Day', kind: 'weekday', showIf: whenIs('week'), initial: -1 },
  { id: 'offset', label: 'How long', kind: 'number', showIf: whenIs('after', 'before'), initial: 1 },
  { id: 'unit', label: 'Unit', kind: 'select', options: UNITS, showIf: whenIs('after', 'before'), initial: 'weeks' },
];

export const ENDEAVOUR_TEMPLATES: EndeavourTemplate[] = [
  {
    id: 'university-subject', label: 'University subject', icon: '🎓',
    description: 'Its notebook and timetable, its classes (regular and one-off), its routine tasks as a weekly rhythm, its assessments as Deadlines, and a goal. Adds the University Types.',
    inputs: [
      { id: 'code', label: 'Code', kind: 'text', placeholder: 'GEOS215' },
      { id: 'name', label: 'Name', kind: 'text', placeholder: 'Climate Systems' },
      { id: 'start', label: 'Teaching starts', kind: 'date' },
      { id: 'end', label: 'Teaching ends', kind: 'date' },
      {
        id: 'classes', label: 'Regular classes', kind: 'rows', addLabel: '+ Add a class', initial: [],
        hint: 'One row a session: two lectures at different times are two rows.',
        columns: [
          { id: 'type', label: 'Class', kind: 'select', options: CLASS_OPTIONS, initial: 'Lecture' },
          { id: 'day', label: 'Day', kind: 'weekday', initial: 1 },
          { id: 'start', label: 'From', kind: 'time' },
          { id: 'end', label: 'Until', kind: 'time' },
          { id: 'location', label: 'Where', kind: 'text' },
        ],
      },
      {
        id: 'oneOffs', label: 'One-off classes', kind: 'rows', addLabel: '+ Add a one-off class', initial: [],
        hint: 'A lab, a field trip, a guest lecture: on a date or in a teaching week.',
        columns: [
          { id: 'type', label: 'Class', kind: 'select', options: CLASS_OPTIONS, initial: 'Lab' },
          { id: 'title', label: 'Name', kind: 'text', placeholder: 'Lab 1' },
          ...WHEN_COLUMNS.filter((c) => c.id === 'when' || c.id === 'date' || c.id === 'week' || c.id === 'day').map((c) => (c.id === 'when' ? { ...c, options: WHEN_MODES.slice(0, 2) } : c)),
          { id: 'start', label: 'From', kind: 'time' },
          { id: 'end', label: 'Until', kind: 'time' },
          { id: 'location', label: 'Where', kind: 'text' },
        ],
      },
      {
        id: 'routines', label: 'Routine tasks', kind: 'rows', addLabel: '+ Add a routine task', initial: [],
        hint: 'What comes round again: a reading before each lecture, a weekly quiz, a problem set every two weeks.',
        columns: [
          { id: 'what', label: 'What', kind: 'text', placeholder: 'Reading' },
          { id: 'kind', label: 'It is', kind: 'select', options: TASK_KINDS, initial: 'doBy' },
          { id: 'freq', label: 'How often', kind: 'select', options: FREQUENCIES, initial: 'weekly' },
          { id: 'day', label: 'On', kind: 'weekday', showIf: isRepeat, initial: 5 },
          { id: 'time', label: 'By', kind: 'time', showIf: isRepeat },
          { id: 'cls', label: 'Class', kind: 'select', options: classTypesIn, showIf: isRelativeTask },
          { id: 'offset', label: 'Days', kind: 'number', showIf: isRelativeTask, initial: 1 },
          { id: 'worth', label: 'Worth (%)', kind: 'number' },
          { id: 'type', label: 'Type', kind: 'select', options: TYPE_OPTIONS, initial: '' },
        ],
      },
      {
        id: 'tasks', label: 'Assessments and one-off tasks', kind: 'rows', addLabel: '+ Add an assessment', initial: [],
        hint: 'Dated, in a teaching week, or so long after something: "2 weeks after Lab 1".',
        columns: [
          { id: 'title', label: 'What', kind: 'text', placeholder: 'Lab report 1' },
          { id: 'type', label: 'Type', kind: 'select', options: TYPE_OPTIONS.filter((o) => o.value !== 'Reading'), initial: 'Assessment' },
          { id: 'worth', label: 'Worth (%)', kind: 'number' },
          ...WHEN_COLUMNS,
          { id: 'anchor', label: 'From', kind: 'select', options: anchorsIn, showIf: whenIs('after', 'before'), initial: 'start' },
        ],
      },
      { id: 'target', label: 'Mark you’re aiming for (%)', kind: 'number', initial: 75 },
    ],
    wand: {
      hint: 'Paste the course outline: its classes, labs and assessments are read from it, to check before anything is made.',
      read: (text, values) => {
        const o = readCourseOutline(text, str(values.start) || null);
        if (!o.code && o.classes.length === 0 && o.oneOffs.length === 0 && o.assessments.length === 0) return null;
        const routines = rows(values.routines);
        const hasLecture = o.classes.some((c) => c.type === 'Lecture');
        // Read again, what's already there isn't added twice (2026-10-30: lectures came twice).
        const classes = rows(values.classes), oneOffs = rows(values.oneOffs), tasks = rows(values.tasks);
        const has = (list: TemplateRow[], match: (r: TemplateRow) => boolean) => list.some(match);
        return {
          ...(o.code ? { code: o.code } : {}), ...(o.name ? { name: o.name } : {}),
          ...(o.start && !str(values.start) ? { start: o.start } : {}), ...(o.end && !str(values.end) ? { end: o.end } : {}),
          classes: [...classes, ...o.classes.filter((c) => !has(classes, (r) => r.type === c.type && r.day === c.day && r.start === c.start))
            .map((c) => newRow({ type: c.type, day: c.day, start: c.start, end: c.end, location: c.location ?? '' }))],
          oneOffs: [...oneOffs, ...o.oneOffs.filter((c) => !has(oneOffs, (r) => str(r.title) === c.title && r.date === c.date))
            .map((c) => newRow({ type: c.type, title: c.title, when: 'date', date: c.date, start: c.start ?? '', end: c.end ?? '', location: c.location ?? '' }))],
          tasks: [...tasks, ...o.assessments.filter((a) => !has(tasks, (r) => str(r.title) === a.title && r.date === a.date))
            .map((a) => newRow({ title: a.title, type: a.typeName, worth: a.weight, when: 'date', date: a.date }))],
          routines: o.readings && hasLecture && !routines.some((r) => /reading/i.test(str(r.what)))
            ? [...routines, newRow({ what: 'Reading', kind: 'doBy', freq: 'before', cls: 'Lecture', offset: 1, type: 'Reading' })]
            : routines,
        };
      },
    },
    plan: (v) => {
      const title = [str(v.code), str(v.name)].filter(Boolean).join(' ') || 'New subject';
      const short = str(v.code) || title;
      const start = str(v.start) || todayIso();

      const blocks: PlanBlock[] = rows(v.classes)
        .filter((r) => typeof r.day === 'number' && r.day >= 0 && str(r.start) && str(r.end))
        .map((r) => ({ key: r._id, title: `${short} ${str(r.type).toLowerCase() || 'class'}`, days: [r.day as number], start: str(r.start), end: str(r.end), location: str(r.location) || null }));
      const blocksOf = (type: string) => rows(v.classes).filter((r) => str(r.type) === type && blocks.some((b) => b.key === r._id)).map((r) => r._id);

      // One-off classes as calendar events; their dates are what one-off tasks can be dated from.
      const resolved = new Map<string, string>();
      const events: PlanEvent[] = rows(v.oneOffs).flatMap((r) => {
        const date = rowDate(r, v, resolved);
        if (!date) return [];
        resolved.set(r._id, date);
        return [{ title: `${short} ${str(r.title) || str(r.type)}`, date, start: str(r.start) || null, end: str(r.end) || null, location: str(r.location) || null }];
      });

      // The rhythm: going to each kind of regular class, then each routine task.
      const attend: PlanStream[] = [...new Set(rows(v.classes).map((r) => str(r.type)))].filter((t) => blocksOf(t).length).map((t) => ({
        label: t, kind: 'attend', start, time: null, rule: { kind: 'relative', blockKeys: blocksOf(t), offsetDays: 0 },
        typeName: t === 'Lecture' ? 'Lecture' : null, toNotebook: true, worth: null,
      }));
      const routine: PlanStream[] = rows(v.routines).flatMap((r): PlanStream[] => {
        const label = str(r.what);
        if (!label) return [];
        const common = { label, kind: (r.kind === 'submit' ? 'submit' : 'doBy') as StreamKind, start, typeName: str(r.type) || null, toNotebook: true, worth: num(r.worth) };
        if (isRepeat(r)) return typeof r.day === 'number' && r.day >= 0 ? [{ ...common, time: str(r.time) || null, rule: { kind: 'repeat', repeat: weekly([r.day], r.freq === 'fortnightly' ? 2 : 1) } }] : [];
        const keys = blocksOf(str(r.cls));
        if (!keys.length) return [];
        const n = num(r.offset) ?? 0;
        return [{ ...common, time: null, rule: { kind: 'relative', blockKeys: keys, offsetDays: r.freq === 'before' ? -n : n } }];
      });
      const streams = [...attend, ...routine];

      const target = num(v.target) && num(v.target)! > 0 ? num(v.target) : null;
      return {
        ...EMPTY_PLAN,
        endeavour: { name: title, kind: 'project', deadline: str(v.end) || null },
        notebook: { name: title },
        timetable: blocks.length ? { name: `${short} classes`, startDate: str(v.start) || null, endDate: str(v.end) || null, blocks } : null,
        events,
        rhythm: streams.length ? { name: `${short} each week`, streams } : null,
        starterTypes: 'university',
        deadlines: rows(v.tasks).flatMap((r) => {
          const date = rowDate(r, v, resolved);
          return str(r.title) && date ? [{ title: str(r.title), date, typeName: str(r.type) || null, fields: num(r.worth) !== null ? { weight: num(r.worth) } : {} }] : [];
        }),
        goals: target ? [{ title: `At least ${target}% in ${short}`, by: str(v.end) || null, measure: { kind: 'manual' as const, unit: '%', target, direction: 'atLeast' as const } }] : [],
      };
    },
  },
  {
    id: 'training-plan', label: 'Training plan', icon: '🏃',
    description: 'A goal to train for, sessions on the days you choose as a rhythm, and a goal of keeping them up.',
    inputs: [
      { id: 'name', label: 'Name', kind: 'text', placeholder: 'Half marathon' },
      { id: 'goal', label: 'What you’re aiming for', kind: 'text', placeholder: '21 km under 2 hours' },
      { id: 'by', label: 'By', kind: 'date' },
      { id: 'days', label: 'Sessions on', kind: 'days', initial: [2, 4, 6] },
      { id: 'time', label: 'At', kind: 'time' },
    ],
    plan: (v) => {
      const name = str(v.name) || 'Training';
      const by = str(v.by) || null;
      const d = days(v.days);
      return {
        ...EMPTY_PLAN,
        endeavour: { name, kind: by ? 'project' : 'list', deadline: by },
        rhythm: d.length ? { name: `${name} sessions`, streams: [{ label: 'Session', kind: 'doBy', start: todayIso(), time: str(v.time) || null, rule: { kind: 'repeat', repeat: weekly(d) }, typeName: null, toNotebook: false, worth: null }] } : null,
        goals: [
          ...(str(v.goal) ? [{ title: str(v.goal), by, measure: { kind: 'manual' as const, unit: null, target: null, direction: 'atLeast' as const } }] : []),
          ...(d.length ? [{ title: 'Keep up the sessions', by: null, measure: { kind: 'consistency' as const, streamLabel: 'Session', count: 3, outOf: 4 } }] : []),
        ],
      };
    },
  },
  {
    id: 'project', label: 'Project', icon: '📁',
    description: 'A project with a due date, a notebook, its milestones as tasks, and a goal of reaching them.',
    inputs: [
      { id: 'name', label: 'Name', kind: 'text', placeholder: 'Kitchen renovation' },
      { id: 'due', label: 'Due', kind: 'date' },
      { id: 'milestones', label: 'Milestones (one a line)', kind: 'lines', placeholder: 'Quotes in\nDesign agreed\nBuilt' },
    ],
    plan: (v) => {
      const name = str(v.name) || 'New project';
      const milestones = str(v.milestones).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return {
        ...EMPTY_PLAN,
        endeavour: { name, kind: 'project', deadline: str(v.due) || null },
        notebook: { name },
        tasks: milestones.map((title) => ({ title, kind: 'milestone' as const })),
        goals: [{ title: milestones.length ? 'Reach every milestone' : 'Get it done', by: str(v.due) || null, measure: { kind: 'completion', milestonesOnly: milestones.length > 0 } }],
      };
    },
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(ENDEAVOUR_TEMPLATES.map((t) => [t.id, t])) as Record<string, EndeavourTemplate>;

export function initialValues(t: EndeavourTemplate): TemplateValues {
  return Object.fromEntries(t.inputs.map((i) => [i.id, i.initial ?? (i.kind === 'checkbox' ? false : i.kind === 'number' ? null : i.kind === 'rows' ? [] : '')]));
}

// A new row for a "rows" input, with each column's starting value.
export function blankRow(input: TemplateInput): TemplateRow {
  return newRow(Object.fromEntries((input.columns ?? []).map((c) => [c.id, c.initial ?? (c.kind === 'number' ? null : '')])));
}
