import type { EndeavourPeriod, RepeatConfig } from '@/types';
import type { EndeavourTemplateDef, TemplateClass, TemplateGoalMeasure, TemplateWhen } from '@/types/templates';
import type { PlanGoalMeasure, TemplatePlan } from '@/config/endeavourTemplates';
import { blankDraft, firstWeekdayOn, type SubjectItemDraft } from '@/utils/subjectItems';
import { addDaysToIso, todayIso } from '@/utils/date';

// A template (types/templates.ts) made into what's made from it (a TemplatePlan): pure, so the
// creator, the agent and tests share it. Names fill in `{name}` and `{short}`; classes repeat
// weekly from the Endeavour's start (its Dates' start, else today); a one-off falls on a weekday of
// a week counted from that start; a list, task or goal marked `suggest` is left for its home
// (templateSuggestions).

const weekly = (days: number[]): RepeatConfig => ({ freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [...days].sort((a, b) => a - b) });

// A subject's code is the first word of its name when that has a digit ("GEOS215 Climate Systems").
export function codeFromName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /\d/.test(first) ? first : null;
}

export function fillName(text: string, name: string, short: string): string {
  return text.replace(/\{name\}/g, name).replace(/\{short\}/g, short).trim();
}

// The Monday of the week `iso` is in (weeks run Monday to Sunday).
const mondayOf = (iso: string) => addDaysToIso(iso, -((new Date(`${iso}T00:00:00`).getDay() + 6) % 7));
export function dateOfWhen(w: TemplateWhen, start: string): string {
  return addDaysToIso(mondayOf(start), (Math.max(1, w.week) - 1) * 7 + ((w.weekday + 6) % 7));
}

export function classDraft(c: TemplateClass, title: string, start: string): SubjectItemDraft {
  const date = c.weekdays.map((d) => firstWeekdayOn(start, d)).sort()[0] ?? start;
  return {
    ...blankDraft('schedule', date), title, start: c.start, end: c.end, place: c.place,
    repeat: c.weekdays.length ? weekly(c.weekdays) : null,
    ...(c.taskRules.length ? { taskRules: c.taskRules.map((r) => ({ ...r, made: [] })) } : {}),
  };
}

export function goalMeasure(m: TemplateGoalMeasure): PlanGoalMeasure {
  if (m.kind === 'manual') return { kind: 'manual', unit: m.unit, target: m.target, direction: 'atLeast' };
  if (m.kind === 'completion') return { kind: 'completion', milestonesOnly: false };
  return { kind: 'keepUp', title: m.classTitle, count: m.count, outOf: m.outOf };
}

interface Options {
  name:    string;
  period?: EndeavourPeriod | null;
  values?: Record<string, unknown>;   // its details' values, by field id
}

export function planFromTemplate(def: EndeavourTemplateDef, o: Options): TemplatePlan {
  const name = o.name.trim();
  const code = def.codeFromName ? codeFromName(name) : null;
  const short = code ?? name;
  const fill = (t: string) => fillName(t, name, short);
  const start = o.period?.start ?? todayIso();
  const values = { ...(code && def.details.some((f) => f.id === 'code') ? { code } : {}), ...(o.values ?? {}) };
  const tasks = def.tasks.filter((t) => !t.suggest).map((t) => ({
    title: fill(t.title), kind: t.kind,
    deadline: t.weekly !== null ? firstWeekdayOn(start, t.weekly) : null, repeat: t.weekly !== null ? weekly([t.weekly]) : null,
  }));
  return {
    endeavour: {
      name, kind: def.kind, deadline: null, templateId: def.id,
      ...(o.period ? { period: o.period } : {}),
      fields: def.details.map((f) => ({ ...f })), values,
    },
    notebooks: def.notebooks.map((n) => ({ name: fill(n.name) })).filter((n) => n.name),
    lists: def.lists.filter((l) => !l.suggest).map((l) => ({ name: fill(l.name), items: l.items })),
    tasks,
    items: [
      ...def.classes.map((c) => classDraft(c, fill(c.title), start)),
      ...def.deadlines.map((d) => ({ ...blankDraft('work', dateOfWhen(d.when, start)), title: fill(d.title), start: d.time })),
    ],
    goals: def.goals.filter((g) => !g.suggest).map((g) => ({ title: fill(g.title), by: null, measure: goalMeasure(g.measure) })),
    starterTypes: null,
    parts: [],
    ...(def.partsFrom ? { partsFrom: def.partsFrom } : {}),
  };
}

// What a template only suggests, for its home: each with what it is and what's made if taken.
export interface PlanSuggestion { id: string; label: string; detail: string; title: string; plan: Partial<TemplatePlan> }

export function templateSuggestions(def: EndeavourTemplateDef, name: string, labels: { list: string; task: (weekly: number | null) => string; goal: string }): PlanSuggestion[] {
  const code = def.codeFromName ? codeFromName(name) : null;
  const fill = (t: string) => fillName(t, name, code ?? name);
  const start = todayIso();
  return [
    ...def.lists.filter((l) => l.suggest).map((l) => ({ id: `list:${l.id}`, label: fill(l.name), detail: l.items.length ? `${labels.list} · ${l.items.join(', ')}` : labels.list, title: fill(l.name), plan: { lists: [{ name: fill(l.name), items: l.items }] } })),
    ...def.tasks.filter((t) => t.suggest).map((t) => ({
      id: `task:${t.id}`, label: fill(t.title), detail: labels.task(t.weekly), title: fill(t.title),
      plan: { tasks: [{ title: fill(t.title), kind: t.kind, deadline: t.weekly !== null ? firstWeekdayOn(start, t.weekly) : null, repeat: t.weekly !== null ? weekly([t.weekly]) : null }] },
    })),
    ...def.goals.filter((g) => g.suggest).map((g) => ({ id: `goal:${g.id}`, label: fill(g.title), detail: labels.goal, title: fill(g.title), plan: { goals: [{ title: fill(g.title), by: null, measure: goalMeasure(g.measure) }] } })),
  ];
}
