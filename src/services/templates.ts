import { useMemo } from 'react';
import { nanoid } from 'nanoid';
import { useTemplateStore, type TemplateInput } from '@/store/templateStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useGoalStore } from '@/store/goalStore';
import { DEFAULT_TEMPLATES, DEFAULT_TEMPLATE_BY_ID } from '@/config/defaultTemplates';
import { codeFromName } from '@/utils/templatePlan';
import { childrenOf } from '@/utils/endeavourGraph';
import { scheduleListOf } from '@/utils/subjectItems';
import { listView } from '@/services/listSecrets';
import type { CollectionId, GoalMeasure } from '@/types';
import type { EndeavourTemplateDef, EndeavourTemplateId, TemplateGoalMeasure } from '@/types/templates';

// THE way to read and change Endeavour templates (types/templates.ts): the built-in ones
// (config/defaultTemplates.ts), each replaced by the person's copy once they've changed it, then
// their own. Editing a built-in one saves a copy (`builtIn`); Restore default deletes the copy.

function merged(own: Record<string, EndeavourTemplateDef>): EndeavourTemplateDef[] {
  const mine = Object.values(own);
  const copies = new Map(mine.filter((t) => t.builtIn).map((t) => [t.builtIn!, t]));
  return [
    ...DEFAULT_TEMPLATES.map((d) => copies.get(d.id) ?? d),
    ...mine.filter((t) => !t.builtIn || !DEFAULT_TEMPLATE_BY_ID[t.builtIn]).sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export const allTemplates = (): EndeavourTemplateDef[] => merged(useTemplateStore.getState().templates);

export function useTemplates(): EndeavourTemplateDef[] {
  const own = useTemplateStore((s) => s.templates);
  return useMemo(() => merged(own), [own]);
}

// The template an Endeavour was made from (`Collection.templateId`): the person's own, else their
// copy of a built-in one, else the built-in one itself.
export function templateFor(id: string | null | undefined): EndeavourTemplateDef | undefined {
  if (!id) return undefined;
  const own = useTemplateStore.getState().templates;
  return own[id as EndeavourTemplateId] ?? Object.values(own).find((t) => t.builtIn === id) ?? DEFAULT_TEMPLATE_BY_ID[id];
}

export const isBuiltIn = (t: EndeavourTemplateDef) => !!DEFAULT_TEMPLATE_BY_ID[t.id];
// Built in, and changed by the person (it's their copy).
export const isChangedBuiltIn = (t: EndeavourTemplateDef) => !!t.builtIn && !!DEFAULT_TEMPLATE_BY_ID[t.builtIn];

const inputOf = (t: EndeavourTemplateDef): TemplateInput => {
  const rest: Partial<EndeavourTemplateDef> = { ...t };
  delete rest.id; delete rest.createdAt; delete rest.updatedAt;
  return rest as TemplateInput;
};

// Saves a template from the editor: a built-in one becomes the person's copy; returns its id.
export function saveTemplate(t: EndeavourTemplateDef): EndeavourTemplateId {
  const store = useTemplateStore.getState();
  if (store.templates[t.id]) { store.updateTemplate(t.id, inputOf(t)); return t.id; }
  if (DEFAULT_TEMPLATE_BY_ID[t.id]) return store.addTemplate({ ...inputOf(t), builtIn: t.id });
  return store.addTemplate(inputOf(t));
}

// A copy under a new name, the person's own; returns it.
// "Save as new template" (the user, 2026-11-05: so there can be several, the one opened left as it
// was): the person's own, its name made unique ("… (copy)") if another template has it.
export function saveTemplateAsNew(t: EndeavourTemplateDef, copyOf: (name: string) => string): EndeavourTemplateDef {
  const taken = new Set(allTemplates().map((x) => x.name.trim().toLowerCase()));
  let name = t.name.trim();
  while (taken.has(name.toLowerCase())) name = copyOf(name);
  return duplicateTemplate(t, name);
}

export function duplicateTemplate(t: EndeavourTemplateDef, name: string): EndeavourTemplateDef {
  const input = inputOf(t);
  delete input.builtIn;
  const id = useTemplateStore.getState().addTemplate({ ...input, name });
  return useTemplateStore.getState().templates[id];
}

// One of the person's own templates goes (to the Recycling Bin); a built-in one can't.
export function deleteTemplate(t: EndeavourTemplateDef): void {
  if (useTemplateStore.getState().templates[t.id]) useTemplateStore.getState().deleteTemplate(t.id);
}

// Restore default: the person's copy goes (to the Recycling Bin), so the built-in one shows again.
export function restoreDefault(copy: EndeavourTemplateDef): void {
  if (useTemplateStore.getState().templates[copy.id]) useTemplateStore.getState().deleteTemplate(copy.id);
}

export function blankTemplate(name = ''): EndeavourTemplateDef {
  const ts = new Date().toISOString();
  return {
    id: '' as EndeavourTemplateId, name, icon: null, description: '', kind: 'project',
    dates: { show: false, exams: false, timeOff: [] }, details: [], notebooks: [], lists: [], tasks: [], classes: [],
    deadlines: [], goals: [], partsFrom: null, partsLabel: null, createdAt: ts, updatedAt: ts,
  };
}

// "Save as template" (an Endeavour's home): what it is and holds, as structure. Its name in the
// names of what's in it becomes {name} (its code {short}); dates become weekdays; values, notes,
// list items' content beyond their titles, and one-off dates are left out.
export function captureTemplate(endeavourId: CollectionId): EndeavourTemplateDef | null {
  const tasks = useTaskStore.getState();
  const c = tasks.collections[endeavourId];
  if (!c) return null;
  const code = codeFromName(c.name);
  const generic = (s: string) => {
    let out = s.split(c.name).join('{name}');
    if (code) out = out.split(code).join('{short}');
    return out;
  };
  const events = useCalendarStore.getState().events;
  const lists = Object.values(useListStore.getState().lists).filter((l) => l.collectionId === endeavourId && !l.encryptedPayload);
  const items = Object.values(useListStore.getState().listItems);
  const goals = Object.values(useGoalStore.getState().goals).filter((g) => g.target.type === 'endeavour' && g.target.id === endeavourId);
  const parts = childrenOf(endeavourId, tasks.collections).map((k) => tasks.collections[k]).filter((p) => p && (p.kind === 'project' || p.kind === 'list'));
  const t = blankTemplate(c.name);
  return {
    ...t,
    name: c.name, icon: null, description: c.description ?? '', kind: c.kind === 'list' ? 'list' : 'project',
    dates: { show: !!c.period, exams: !!c.period?.exams, timeOff: (c.period?.breaks ?? []).map((b) => b.label).filter(Boolean) },
    details: (c.attributes?.fields ?? []).filter((f) => f.type !== 'period').map((f) => ({ ...f })),
    codeFromName: !!code,
    notebooks: Object.values(useNoteStore.getState().noteTags).filter((n) => n.kind === 'area' && n.collectionId === endeavourId).map((n) => ({ id: nanoid(8), name: generic(n.name) })),
    lists: lists.map((l) => ({ id: nanoid(8), name: generic(listView(l).name), items: items.filter((i) => i.listId === l.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((i) => i.title) })),
    tasks: Object.values(tasks.tasks).filter((x) => x.collectionId === endeavourId && !x.parentId && !x.archived && !x.itemLinks?.some((l) => l.ruleId))
      .map((x) => ({ id: nanoid(8), title: generic(x.title), kind: x.kind, weekly: x.repeat?.freq === 'weekly' && x.repeat.daysOfWeek?.length === 1 ? x.repeat.daysOfWeek[0] : null })),
    classes: scheduleListOf(endeavourId, events).filter((e) => e.repeat?.freq === 'weekly').map((e) => ({
      id: nanoid(8), title: generic(e.title), weekdays: e.repeat?.daysOfWeek ?? [new Date(`${e.date}T00:00:00`).getDay()],
      start: e.startTime, end: e.endTime, place: e.location, taskRules: (e.taskRules ?? []).map((r) => ({ id: r.id, title: r.title, side: r.side, days: r.days })),
    })),
    goals: goals.map((g) => ({ id: nanoid(8), title: generic(g.title), measure: templateMeasure(g.measure) })).filter((g): g is { id: string; title: string; measure: TemplateGoalMeasure } => !!g.measure),
    partsFrom: parts.map((p) => p.templateId).find(Boolean) ?? null,
  };
}

function templateMeasure(m: GoalMeasure): TemplateGoalMeasure | null {
  if (m.kind === 'manual') return { kind: 'manual', unit: m.unit, target: m.target };
  if (m.kind === 'completion') return { kind: 'completion' };
  return null;
}
