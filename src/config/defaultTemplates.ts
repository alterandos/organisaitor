import type { EndeavourTemplateDef, EndeavourTemplateId } from '@/types/templates';

// The built-in Endeavour templates, as data (2026-11-05: all four, the user's choice). Read-only
// originals: editing one gives the person their own copy (`builtIn` names it), and Restore default
// brings this back (the Types model). Their ids are the old template ids, so Endeavours made before
// (`Collection.templateId`) still find theirs. A new built-in is one entry here. Since 2026-11-06 a
// template only fills in the form (types/templates.ts): what's in an Endeavour is added on its home.

const T0 = '2026-11-05T00:00:00.000Z';
const base = { createdAt: T0, updatedAt: T0, details: [], tags: [], notebook: false, partsFrom: null };
const id = (s: string) => s as EndeavourTemplateId;
const noDates = { show: false, exams: false, timeOff: [] };

export const DEFAULT_TEMPLATES: EndeavourTemplateDef[] = [
  {
    ...base, id: id('semester'), name: 'Semester', icon: '🗓', kind: 'project',
    description: 'Teaching dates, time off and exam period, which every subject in it takes. Tagged University, with a notebook.',
    dates: { show: true, exams: true, timeOff: [] },
    tags: ['University'], notebook: true,
    partsFrom: 'subject', partsLabel: 'Subjects',
  },
  {
    ...base, id: id('subject'), name: 'Subject', icon: '🎓', kind: 'project',
    description: 'Its code, tagged Subject, with a notebook. Its classes and assessments are added on its home, by hand or read from the course outline.',
    dates: noDates,
    details: [{ id: 'code', name: 'Code', type: 'text' }],
    codeFromName: true, readsOutline: true,
    tags: ['Subject', 'University'], notebook: true,
  },
  {
    ...base, id: id('training-plan'), name: 'Training plan', icon: '🏃', kind: 'project',
    description: 'Tagged Training. Its sessions are added on its home.',
    dates: noDates,
    tags: ['Training'],
  },
  {
    ...base, id: id('project'), name: 'Project', icon: '📁', kind: 'project',
    description: 'Something to finish, with a notebook.',
    dates: noDates,
    notebook: true,
  },
];

export const DEFAULT_TEMPLATE_BY_ID: Record<string, EndeavourTemplateDef> = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.id, t]));
