import type { CollectionId, EndeavourPeriod, FieldSchema, GoalMeasure, PeriodBreak, PurposeId, RepeatConfig, TagId, TaskKind, DateUse } from '@/types';
import { blankDraft, firstWeekdayOn, type SubjectItemDraft, type SubjectItemKind } from '@/utils/subjectItems';
import type { StarterSet } from '@/config/typeStarters';
import { DEFAULT_TEMPLATE_BY_ID } from '@/config/defaultTemplates';
import { planFromTemplate } from '@/utils/templatePlan';
import { todayIso } from '@/utils/date';

// What making an Endeavour from a template makes (a TemplatePlan), made by
// services/endeavourTemplates.ts with one Undo. Templates themselves are data since 2026-11-05
// (types/templates.ts: the built-in ones in config/defaultTemplates.ts, the person's own in
// templateStore), turned into a plan by utils/templatePlan.ts. What's left here is the plan's shape
// and the agent's semester options (`planFromValues`).

export type TemplateValues = Record<string, unknown>;

export type PlanGoalMeasure =
  | Exclude<GoalMeasure, { kind: 'consistency' } | { kind: 'tracker' } | { kind: 'keepUp' }>
  | { kind: 'keepUp'; title: string; count: number; outOf: number };   // the repeating item of that title

export interface TemplatePlan {
  // `typeKey`: a default Type (config/builtInTypes.ts) it's given, with these values.
  // `templateId`: the template it's made from (none for a blank one). The basics a person gives in
  // the form (description, colour, Purposes, what it's related to) ride along here.
  endeavour:    {
    name: string; kind: 'project' | 'list'; deadline: string | null; templateId?: string; period?: EndeavourPeriod; typeKey?: string; values?: Record<string, unknown>;
    description?: string | null; color?: string | null; purposeIds?: PurposeId[]; related?: CollectionId[];
    fields?: FieldSchema[];   // details of its own, besides its Type's (values in `values`)
    tagIds?: TagId[];         // its tags (the form's, made already)
    dateUse?: DateUse;        // which of its named periods it runs and pauses during
    tagNames?: string[];      // tags by name (a template's), made on Create where there's none of that name
    icon?: string | null;
  };
  // Its notebooks. The first is its main one: a part's notebooks go inside it. `inside`: the notebook
  // it goes in (null: the top level); absent: the one of the nearest Endeavour above that has one.
  notebooks:    { name: string; inside?: string | null }[];
  // Its classes (calendar events) and Deadlines, made through services/subjectItems.ts.
  items:        SubjectItemDraft[];
  starterTypes: StarterSet | null;
  lists:        { name: string; items?: string[] }[];
  tasks:        { title: string; kind: TaskKind; deadline?: string | null; repeat?: RepeatConfig | null }[];
  goals:        { title: string; by: string | null; measure: PlanGoalMeasure }[];
  parts:        TemplatePlan[];     // Endeavours made part of it, each from its own plan (a semester's subjects)
  partsFrom?:   string;             // the template a part added on its home starts from (a semester's: a subject)
}

export const weekly = (d: number[], interval = 1): RepeatConfig => ({ freq: 'weekly', interval, endKind: 'forever', count: null, until: null, daysOfWeek: d });

export const EMPTY_PLAN = { notebooks: [], items: [], starterTypes: null, lists: [], tasks: [], goals: [], parts: [] };

// Something on a weekday (or several) every week, from its first such day on or after `from`.
export function weeklyItem(kind: SubjectItemKind, title: string, onDays: number[], time: string | null = null, from = todayIso()): SubjectItemDraft {
  const date = onDays.map((d) => firstWeekdayOn(from, d)).sort()[0] ?? from;
  return { ...blankDraft(kind, date), title, start: time, repeat: weekly([...onDays].sort((a, b) => a - b)) };
}

// A task on a weekday every week (completing it makes the next), from its first such day.
export function weeklyTask(title: string, onDay: number, from = todayIso()): TemplatePlan['tasks'][number] {
  return { title, kind: 'action', deadline: firstWeekdayOn(from, onDay), repeat: weekly([onDay]) };
}

// A plan with nothing in it yet: a blank Endeavour.
export function blankPlan(name = ''): TemplatePlan {
  return { ...EMPTY_PLAN, endeavour: { name, kind: 'project', deadline: null } };
}

// What a semester has asked for (the agent's create_semester; on a home they are suggestions).
export function semesterExtras(name: string, by: string | null, opts: { admin: boolean; planDay: number | null; average: number | null }): Pick<TemplatePlan, 'lists' | 'tasks' | 'goals'> {
  return {
    lists: opts.admin ? [{ name: `${name} admin` }] : [],
    tasks: opts.planDay !== null && opts.planDay >= 0 ? [weeklyTask('Plan the week', opts.planDay)] : [],
    goals: opts.average ? [{ title: `Average ${opts.average}% this semester`, by, measure: { kind: 'manual' as const, unit: '%', target: opts.average, direction: 'atLeast' as const } }] : [],
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// The agent's way in (agent/commands/subjects.ts): a built-in template with the values it was
// given. A semester: its dates, time off and exam period, its subjects (one a line) and what it
// asked for; a subject: its code, name and a mark to aim for (a goal only when given).
export function planFromValues(templateId: string, v: TemplateValues): TemplatePlan {
  const def = DEFAULT_TEMPLATE_BY_ID[templateId];
  if (templateId === 'semester') {
    const name = str(v.name) || 'New semester';
    const end = str(v.end) || null;
    const examsFrom = str(v.examsFrom), examsTo = str(v.examsTo) || examsFrom;
    const rows = Array.isArray(v.breaks) ? (v.breaks as Record<string, unknown>[]) : [];
    const breaks: PeriodBreak[] = rows.filter((r) => str(r.from)).map((r, i) => ({ id: str(r._id) || `b${i}`, label: str(r.label), from: str(r.from), to: str(r.to) >= str(r.from) ? str(r.to) : str(r.from) }));
    const period: EndeavourPeriod = { start: str(v.start) || null, end, breaks, exams: examsFrom ? { from: examsFrom, to: examsTo } : null };
    const plan = planFromTemplate(def, { name, period });
    const subjects = str(v.subjects).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return {
      ...plan,
      endeavour: { ...plan.endeavour, deadline: examsTo || end },
      ...semesterExtras(name, examsTo || end, { admin: !!v.admin, planDay: typeof v.planDay === 'number' ? v.planDay : null, average: num(v.average) }),
      parts: subjects.map((line) => planFromTemplate(DEFAULT_TEMPLATE_BY_ID.subject, { name: line })),
    };
  }
  if (templateId === 'subject') {
    const full = [str(v.code), str(v.name)].filter(Boolean).join(' ') || 'New subject';
    const plan = planFromTemplate(def, { name: full });
    const target = num(v.target);
    const short = str(v.code) || full;
    return target ? { ...plan, goals: [{ title: `At least ${target}% in ${short}`, by: null, measure: { kind: 'manual', unit: '%', target, direction: 'atLeast' } }] } : plan;
  }
  return planFromTemplate(def, { name: str(v.name) || def?.name || 'New' });
}
