import type { FieldSchema } from '@/types';

// Endeavour templates as data (docs/features/endeavours.md "Saved templates", agreed with the user
// 2026-11-04/05): the four built in (config/defaultTemplates.ts) and the person's own, made from
// scratch or by "Save as template" from an Endeavour, edited in components/TemplateEditor and
// managed in Manage → Templates.
//
// A template only fills in the Endeavour form (the user, 2026-11-06: "nothing bulky made silently"):
// whether it ends, its dates and time off, its details, its tags, and whether "Make a notebook" is
// ticked. Everything else (tasks, calendar items, lists, goals) is added on the Endeavour's home,
// where the form leads. Structure, never content: labels not values, names of time off not dates.

export type EndeavourTemplateId = string & { readonly _brand: 'EndeavourTemplate' };

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
  tags:        string[];          // tag names, made on Create if there's none of that name
  notebook:    boolean;           // "Make a notebook" starts ticked
  partsFrom:   string | null;     // the template a part added on its home starts from (a semester's: a subject)
  partsLabel?: string | null;     // what those parts are called ("Subjects")
  createdAt:   string;
  updatedAt:   string;
}
