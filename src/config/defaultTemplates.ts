import type { EndeavourTemplateDef, EndeavourTemplateId } from '@/types/templates';

// The built-in Endeavour templates, as data (2026-11-05: all four, the user's choice). Read-only
// originals: editing one gives the person their own copy (`builtIn` names it), and Restore default
// brings this back (the Types model). Their ids are the old template ids, so Endeavours made before
// (`Collection.templateId`) still find theirs. A new built-in is one entry here.

const T0 = '2026-11-05T00:00:00.000Z';
const base = { createdAt: T0, updatedAt: T0, deadlines: [], classes: [], tasks: [], lists: [], goals: [], notebooks: [], details: [], partsFrom: null };
const id = (s: string) => s as EndeavourTemplateId;

export const DEFAULT_TEMPLATES: EndeavourTemplateDef[] = [
  {
    ...base, id: id('semester'), name: 'Semester', icon: '🗓', kind: 'project',
    description: 'Teaching dates, time off and exam period, which every subject in it takes. A notebook, with each subject’s inside it.',
    dates: { show: true, exams: true, timeOff: [] },
    notebooks: [{ id: 'nb', name: '{name}' }],
    lists: [{ id: 'admin', name: '{name} admin', items: [], suggest: true }],
    tasks: [{ id: 'plan', title: 'Plan the week', kind: 'action', weekly: 0, suggest: true }],
    partsFrom: 'subject', partsLabel: 'Subjects',
  },
  {
    ...base, id: id('subject'), name: 'Subject', icon: '🎓', kind: 'project',
    description: 'Its code, and a notebook. Its classes and assessments are added on its home, by hand or read from the course outline.',
    dates: { show: false, exams: false, timeOff: [] },
    details: [{ id: 'code', name: 'Code', type: 'text' }],
    codeFromName: true, readsOutline: true,
    notebooks: [{ id: 'nb', name: '{name}' }],
  },
  {
    ...base, id: id('training-plan'), name: 'Training plan', icon: '🏃', kind: 'project',
    description: 'Sessions on the days you train (repeating, marked attended), and a goal of keeping them up.',
    dates: { show: false, exams: false, timeOff: [] },
    classes: [{ id: 'session', title: 'Session', weekdays: [2, 4, 6], start: null, end: null, place: null, taskRules: [] }],
    goals: [{ id: 'keep', title: 'Keep up the sessions', measure: { kind: 'keepUp', classTitle: 'Session', count: 3, outOf: 4 } }],
  },
  {
    ...base, id: id('project'), name: 'Project', icon: '📁', kind: 'project',
    description: 'A notebook, and a goal of getting its tasks done.',
    dates: { show: false, exams: false, timeOff: [] },
    notebooks: [{ id: 'nb', name: '{name}' }],
    goals: [{ id: 'done', title: 'Get it done', measure: { kind: 'completion' } }],
  },
];

export const DEFAULT_TEMPLATE_BY_ID: Record<string, EndeavourTemplateDef> = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.id, t]));
