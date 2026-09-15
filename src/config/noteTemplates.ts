// Tiptap/ProseMirror doc-JSON builders — kept minimal, just what templates need.
function heading(level: number, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}
function paragraph(text?: string) {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}
function bulletList(items: string[] = ['']) {
  return {
    type: 'bulletList',
    content: items.map((text) => ({ type: 'listItem', content: [paragraph(text)] })),
  };
}
function doc(content: object[]) {
  return { type: 'doc', content };
}

export interface NoteTemplateDef {
  id:          string;
  name:        string;
  icon:        string;
  description: string;
  content:     object | null;   // null = blank note (Note.content stays '')
}

export const NOTE_TEMPLATES: NoteTemplateDef[] = [
  {
    id: 'blank',
    name: 'Blank',
    icon: '📄',
    description: 'Start with an empty note',
    content: null,
  },
  {
    id: 'meeting-minutes',
    name: 'Meeting Minutes',
    icon: '🗒️',
    description: 'Attendees, agenda, discussion, action items',
    content: doc([
      heading(1, 'Attendees'),
      paragraph(),
      heading(1, 'Agenda'),
      paragraph(),
      heading(1, 'Discussion'),
      paragraph(),
      heading(1, 'Action Items'),
      bulletList(),
    ]),
  },
  {
    id: 'daily-journal',
    name: 'Daily Journal',
    icon: '📔',
    description: 'Reflect on today and plan for tomorrow',
    content: doc([
      heading(1, 'Today I…'),
      paragraph(),
      heading(1, 'Grateful For'),
      bulletList(),
      heading(1, 'Tomorrow'),
      paragraph(),
    ]),
  },
  {
    id: 'book-notes',
    name: 'Book / Article Notes',
    icon: '📚',
    description: 'Author, key takeaways, quotes',
    content: doc([
      heading(1, 'Author'),
      paragraph(),
      heading(1, 'Key Takeaways'),
      bulletList(),
      heading(1, 'Quotes'),
      paragraph(),
    ]),
  },
  {
    id: 'project-brief',
    name: 'Project Brief',
    icon: '📋',
    description: 'Goal, scope, stakeholders, milestones',
    content: doc([
      heading(1, 'Goal'),
      paragraph(),
      heading(1, 'Scope'),
      paragraph(),
      heading(1, 'Stakeholders'),
      bulletList(),
      heading(1, 'Milestones'),
      bulletList(),
    ]),
  },
  {
    id: 'cornell-notes',
    name: 'Cornell Notes',
    icon: '🗂️',
    description: 'Cues / notes table with a summary section',
    content: doc([
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [paragraph('Cues')] },
              { type: 'tableHeader', content: [paragraph('Notes')] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [paragraph()] },
              { type: 'tableCell', content: [paragraph()] },
            ],
          },
        ],
      },
      heading(1, 'Summary'),
      paragraph(),
    ]),
  },
];
