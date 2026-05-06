// All user-facing terminology lives here.
// Renaming any concept requires changing only this file — no logic changes.

export const LABELS = {
  collection:       'Endeavour',
  collectionPlural: 'Endeavours',
  collectionKind: {
    project: 'Project',
    list:    'List',
  },
  taskKind: {
    action:    'Action',
    waiting:   'Waiting',
    milestone: 'Milestone',
  },
  milestoneDate: 'Milestone date',

  // Calendar
  calendarItemKind: {
    event:    'Event',
    reminder: 'Reminder',
  },
  views: {
    tasks:    'Tasks',
    calendar: 'Calendar',
  },
} as const;
