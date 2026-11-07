import type { EndeavourPeriod } from '@/types';
import type { EndeavourTemplateDef, EndeavourTemplateId } from '@/types/templates';
import type { TemplatePlan } from '@/config/endeavourTemplates';

// A template (types/templates.ts) made into what's made from it (a TemplatePlan): pure, so the
// creator, the agent and tests share it. Since 2026-11-06 a template makes only the Endeavour and,
// if asked, its notebook; `{name}` and `{short}` fill in names.

// A subject's code is the first word of its name when that has a digit ("GEOS215 Climate Systems").
export function codeFromName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /\d/.test(first) ? first : null;
}

export function fillName(text: string, name: string, short: string): string {
  return text.replace(/\{name\}/g, name).replace(/\{short\}/g, short).trim();
}

interface Options {
  name:      string;
  period?:   EndeavourPeriod | null;
  values?:   Record<string, unknown>;   // its details' values, by field id
  notebook?: boolean;                   // make its notebook (default: as the template says)
}

export function planFromTemplate(def: EndeavourTemplateDef, o: Options): TemplatePlan {
  const name = o.name.trim();
  const code = def.codeFromName ? codeFromName(name) : null;
  const values = { ...(code && def.details.some((f) => f.id === 'code') ? { code } : {}), ...(o.values ?? {}) };
  return {
    endeavour: {
      name, kind: def.kind, deadline: null, templateId: def.id,
      ...(o.period ? { period: o.period } : {}),
      fields: def.details.map((f) => ({ ...f })), values,
      tagNames: [...def.tags],
    },
    notebooks: (o.notebook ?? def.notebook) && name ? [{ name }] : [],
    lists: [], tasks: [], items: [], goals: [], starterTypes: null, parts: [],
    ...(def.partsFrom ? { partsFrom: def.partsFrom } : {}),
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const bool = (v: unknown) => v === true;

// A template as stored before 2026-11-06 (with notebooks, lists, tasks, classes, deadlines and goals),
// or from another device, read into today's shape: a notebook in it means "Make a notebook" ticked;
// the rest is left out (it's added on a home now). Used by the store's migrate and the sync mapper.
export function normaliseTemplate(raw: Record<string, unknown>): EndeavourTemplateDef {
  const dates = (raw.dates ?? {}) as Partial<EndeavourTemplateDef['dates']>;
  const notebooks = Array.isArray(raw.notebooks) ? raw.notebooks : null;
  return {
    id: str(raw.id) as EndeavourTemplateId,
    name: str(raw.name),
    icon: typeof raw.icon === 'string' ? raw.icon : null,
    description: str(raw.description),
    ...(typeof raw.builtIn === 'string' && raw.builtIn ? { builtIn: raw.builtIn } : {}),
    kind: raw.kind === 'list' ? 'list' : 'project',
    dates: { show: bool(dates.show), exams: bool(dates.exams), timeOff: Array.isArray(dates.timeOff) ? dates.timeOff.filter((x): x is string => typeof x === 'string') : [] },
    details: Array.isArray(raw.details) ? (raw.details as EndeavourTemplateDef['details']) : [],
    ...(bool(raw.codeFromName) ? { codeFromName: true } : {}),
    ...(bool(raw.readsOutline) ? { readsOutline: true } : {}),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((x): x is string => typeof x === 'string') : [],
    notebook: typeof raw.notebook === 'boolean' ? raw.notebook : !!notebooks?.length,
    partsFrom: typeof raw.partsFrom === 'string' ? raw.partsFrom : null,
    ...(typeof raw.partsLabel === 'string' ? { partsLabel: raw.partsLabel } : {}),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
  };
}
