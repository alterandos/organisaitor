import { nanoid } from 'nanoid';
import type { EndeavourPeriod, GoalMeasure, PeriodBreak, RepeatConfig, TaskKind } from '@/types';
import type { StarterSet } from '@/config/typeStarters';
import { todayIso } from '@/utils/date';

// Templates that set up a whole Endeavour (docs/features/endeavours.md phase 6, "Easy creation").
// A template is its form (inputs) and a pure `plan` from what's filled in to what will be made;
// services/endeavourTemplates.ts makes a plan (with one Undo). A new template is one entry here.
// The University set of Types comes with the Subject and Semester templates, never built in. The
// Endeavour remembers its template (`Collection.templateId`), so Edit opens that template's own
// editor where it has one (config/templateEditors.ts).
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

// Something repeating it holds (phase 7 (e): a calendar item, no longer a rhythm stream): a class
// (an event you go to) or Work (a Deadline you do), from `start` on its repeat.
export interface PlanRepeating { title: string; kind: 'class' | 'work'; repeat: RepeatConfig; start: string; time: string | null }
export type PlanGoalMeasure =
  | Exclude<GoalMeasure, { kind: 'consistency' } | { kind: 'tracker' } | { kind: 'keepUp' }>
  | { kind: 'keepUp'; title: string; count: number; outOf: number };   // the repeating item of that title

export interface TemplatePlan {
  // `typeKey`: a default Type (config/builtInTypes.ts) it's given, with these values.
  endeavour:    { name: string; kind: 'project' | 'list'; deadline: string | null; templateId: string; period?: EndeavourPeriod; typeKey?: string; values?: Record<string, unknown> };
  notebook:     { name: string } | null;
  repeating:    PlanRepeating[];
  starterTypes: StarterSet | null;
  lists:        { name: string }[];
  tasks:        { title: string; kind: TaskKind }[];
  goals:        { title: string; by: string | null; measure: PlanGoalMeasure }[];
  parts:        TemplatePlan[];     // Endeavours made part of it, each from its own plan (a semester's subjects)
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

const EMPTY_PLAN = { notebook: null, repeating: [], starterTypes: null, lists: [], tasks: [], goals: [], parts: [] };

// ── Subject and semester (phase 7 (d)) ──────────────────────────────────────
// A subject is made small: its notebook, the University Types and a goal; what it holds (its
// Schedule and Work) is added in its own editor (components/TemplateEditors/SubjectEditor), by
// hand or from the course outline. A semester holds the period, breaks and exam period its
// subjects take, live.

function subjectPlan(v: TemplateValues): TemplatePlan {
  const title = [str(v.code), str(v.name)].filter(Boolean).join(' ') || 'New subject';
  const short = str(v.code) || title;
  const target = num(v.target) && num(v.target)! > 0 ? num(v.target) : null;
  return {
    ...EMPTY_PLAN,
    endeavour: { name: title, kind: 'project', deadline: null, templateId: 'subject', typeKey: 'subject', values: { ...(str(v.code) ? { code: str(v.code) } : {}), ...(target ? { target } : {}) } },
    notebook: { name: title },
    starterTypes: 'university',
    goals: target ? [{ title: `At least ${target}% in ${short}`, by: null, measure: { kind: 'manual' as const, unit: '%', target, direction: 'atLeast' as const } }] : [],
  };
}

// What a semester suggests (each can be left out, or added later from its editor).
export function semesterSuggestions(name: string, by: string | null, opts: { admin: boolean; planDay: number | null; average: number | null }): Pick<TemplatePlan, 'lists' | 'repeating' | 'goals'> {
  return {
    lists: opts.admin ? [{ name: `${name} admin` }] : [],
    repeating: opts.planDay !== null && opts.planDay >= 0 ? [{ title: 'Plan the week', kind: 'work', repeat: weekly([opts.planDay]), start: todayIso(), time: null }] : [],
    goals: opts.average ? [{ title: `Average ${opts.average}% this semester`, by, measure: { kind: 'manual' as const, unit: '%', target: opts.average, direction: 'atLeast' as const } }] : [],
  };
}

export const ENDEAVOUR_TEMPLATES: EndeavourTemplate[] = [
  {
    id: 'semester', label: 'Semester', icon: '🗓',
    description: 'Its teaching period, breaks and exam period, taken by every subject in it. Its notebook (each subject’s inside it), its subjects, an admin list, planning the week (repeating work) and a goal for your average.',
    inputs: [
      { id: 'name', label: 'Name', kind: 'text', placeholder: 'Semester 2, 2026' },
      { id: 'start', label: 'Teaching starts', kind: 'date' },
      { id: 'end', label: 'Teaching ends', kind: 'date' },
      { id: 'examsFrom', label: 'Exams from', kind: 'date' },
      { id: 'examsTo', label: 'Exams until', kind: 'date' },
      {
        id: 'breaks', label: 'Breaks', kind: 'rows', addLabel: '+ Add a break', initial: [],
        columns: [
          { id: 'label', label: 'Break', kind: 'text', placeholder: 'Mid-semester break' },
          { id: 'from', label: 'From', kind: 'date' },
          { id: 'to', label: 'To', kind: 'date' },
        ],
      },
      { id: 'subjects', label: 'Subjects (one a line)', kind: 'lines', placeholder: 'GEOS215 Climate Systems\nHIST110 Modern Europe', hint: 'Each takes the semester’s dates and breaks; add its classes and work in its own editor.' },
      { id: 'admin', label: 'An admin list (enrolment, fees, forms)', kind: 'checkbox', initial: true },
      { id: 'planDay', label: 'Plan the week on', kind: 'weekday', initial: 0 },
      { id: 'average', label: 'Average you’re aiming for (%)', kind: 'number', initial: 75 },
    ],
    plan: (v) => {
      const name = str(v.name) || 'New semester';
      const end = str(v.end) || null;
      const examsFrom = str(v.examsFrom), examsTo = str(v.examsTo) || examsFrom;
      const breaks: PeriodBreak[] = rows(v.breaks)
        .filter((r) => str(r.from))
        .map((r) => ({ id: r._id, label: str(r.label), from: str(r.from), to: str(r.to) >= str(r.from) ? str(r.to) : str(r.from) }));
      const subjects = str(v.subjects).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return {
        ...EMPTY_PLAN,
        notebook: { name },   // its subjects' notebooks go inside it
        endeavour: {
          name, kind: 'project', deadline: examsTo || end, templateId: 'semester', typeKey: 'semester',
          period: { start: str(v.start) || null, end, breaks, exams: examsFrom ? { from: examsFrom, to: examsTo } : null },
        },
        ...semesterSuggestions(name, examsTo || end, { admin: !!v.admin, planDay: typeof v.planDay === 'number' ? v.planDay : null, average: num(v.average) }),
        starterTypes: subjects.length ? 'university' : null,
        parts: subjects.map((line) => {
          const [code, ...rest] = line.split(/\s+/);
          return /\d/.test(code) ? subjectPlan({ code, name: rest.join(' ') }) : subjectPlan({ name: line });
        }),
      };
    },
  },
  {
    id: 'subject', label: 'Subject', icon: '🎓',
    description: 'Its notebook, the University Types and a goal, then its own editor: its Schedule (what you go to) and Work (what you do or hand in), by hand or read from the course outline.',
    inputs: [
      { id: 'code', label: 'Code', kind: 'text', placeholder: 'GEOS215' },
      { id: 'name', label: 'Name', kind: 'text', placeholder: 'Climate Systems' },
      { id: 'target', label: 'Mark you’re aiming for (%)', kind: 'number', initial: 75 },
    ],
    plan: subjectPlan,
  },
  {
    id: 'training-plan', label: 'Training plan', icon: '🏃',
    description: 'A goal to train for, sessions on the days you choose (repeating, marked attended), and a goal of keeping them up.',
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
        endeavour: { name, kind: by ? 'project' : 'list', deadline: by, templateId: 'training-plan' },
        repeating: d.length ? [{ title: 'Session', kind: 'class', repeat: weekly(d), start: todayIso(), time: str(v.time) || null }] : [],
        goals: [
          ...(str(v.goal) ? [{ title: str(v.goal), by, measure: { kind: 'manual' as const, unit: null, target: null, direction: 'atLeast' as const } }] : []),
          ...(d.length ? [{ title: 'Keep up the sessions', by: null, measure: { kind: 'keepUp' as const, title: 'Session', count: 3, outOf: 4 } }] : []),
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
        endeavour: { name, kind: 'project', deadline: str(v.due) || null, templateId: 'project' },
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
