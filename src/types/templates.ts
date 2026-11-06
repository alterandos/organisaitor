import type { EventTaskRule, FieldSchema, TaskKind } from '@/types';

// Endeavour templates as data (docs/features/endeavours.md "Saved templates", agreed with the user
// 2026-11-04/05): the four built in (config/defaultTemplates.ts) and the person's own, made from
// scratch or by "Save as template" from an Endeavour, edited in components/TemplateEditor and
// managed in Manage → Templates. A template keeps structure, never content: labels not values,
// names of time off not dates, weekdays and weeks not dates. `{name}` in a name is the new
// Endeavour's name, `{short}` its code (or name). Made into a TemplatePlan by utils/templatePlan.ts.

export type EndeavourTemplateId = string & { readonly _brand: 'EndeavourTemplate' };

// When something falls: the weekday of a week counted from the new Endeavour's start (its Dates'
// start, else the day it's made), week 1 being the week it starts.
export interface TemplateWhen { week: number; weekday: number }

// A repeating class (a calendar event every week on these days), with its tasks for each date.
export interface TemplateClass {
  id:        string;
  title:     string;
  weekdays:  number[];          // 0 = Sunday
  start:     string | null;     // HH:MM
  end:       string | null;
  place:     string | null;
  taskRules: EventTaskRule[];
}

// A one-off Deadline (rare, the user: "unlikely, but possible").
export interface TemplateDeadline { id: string; title: string; when: TemplateWhen; time: string | null }

// Lists, tasks and goals can be made with it or only suggested on its home (`suggest`), each saying
// what it is (CLAUDE.md "A template suggests, never makes silently").
export interface TemplateList { id: string; name: string; items: string[]; suggest?: boolean }
export interface TemplateTask { id: string; title: string; kind: TaskKind; weekly: number | null; suggest?: boolean }   // weekly: the weekday it repeats on
export interface TemplateNotebook { id: string; name: string }

export type TemplateGoalMeasure =
  | { kind: 'manual'; unit: string | null; target: number | null }
  | { kind: 'completion' }
  | { kind: 'keepUp'; classTitle: string; count: number; outOf: number };
export interface TemplateGoal { id: string; title: string; measure: TemplateGoalMeasure; suggest?: boolean }

export interface EndeavourTemplateDef {
  id:          EndeavourTemplateId;
  name:        string;
  icon:        string | null;
  description: string;
  builtIn?:    string;            // the built-in one it's the person's copy of (Restore default)
  kind:        'project' | 'list';
  dates:       { show: boolean; exams: boolean; timeOff: string[] };
  details:     FieldSchema[];     // labels and kinds; values are given when it's made
  codeFromName?: boolean;         // a first word with a digit is its Code detail ("GEOS215 Climate Systems")
  readsOutline?: boolean;         // its home offers to read a course outline
  notebooks:   TemplateNotebook[];
  lists:       TemplateList[];
  tasks:       TemplateTask[];
  classes:     TemplateClass[];
  deadlines:   TemplateDeadline[];
  goals:       TemplateGoal[];
  partsFrom:   string | null;     // the template a part added on its home starts from (a semester's: a subject)
  partsLabel?: string | null;     // what those parts are called ("Subjects")
  createdAt:   string;
  updatedAt:   string;
}
