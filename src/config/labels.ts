// All user-facing terminology lives here.
// Renaming any concept requires changing only this file — no logic changes.

export const LABELS = {
  collection:       'Endeavour',
  collectionPlural: 'Endeavours',
  collectionKind: {
    project: 'Project',
    list:    'List',
    tracker: 'Tracker',
    routine: 'Routine',
  },
  taskKind: {
    action:    'Action',
    waiting:   'Waiting',
    milestone: 'Milestone',
  },
  milestoneDate: 'Milestone date',
  scheduledFor:  'Scheduled',

  // Shared by every item pane that can be archived/deleted (Task, Calendar event, Calendar
  // reminder — and future apps): see src/components/ItemActions/.
  itemActions: {
    archive:           'Archive',
    restore:           'Restore',
    archivedGroup:     'Archived',
    reasonLabel:       'Why are you archiving it? (optional)',
    reasonPlaceholder: 'e.g. No longer relevant, replaced by something else, decided not to do it…',
    reasonHeading:     'Reason',
    archiveTitle:      (noun: string) => `Archive this ${noun}?`,
    archiveHint:       (hiddenFrom: string) => `It leaves ${hiddenFrom} but is kept, and you can restore it any time.`,
    deleteTitle:       (noun: string) => `Delete this ${noun} permanently?`,
    deleteWarning:     'This cannot be undone.',
    deleteSafeHint:    'Not sure? Archiving keeps it out of the way without losing it.',
    deleteConfirm:     'Delete permanently',
    archiveInstead:    'Archive instead',
  },

  // Calendar
  calendarItemKind: {
    event:    'Event',
    reminder: 'Reminder',
  },

  // Records / Trackers
  records: 'Records',
  tracker: 'Tracker',
  trackerPlural: 'Trackers',
  trackerEntry: 'Entry',
  trackerEntryPlural: 'Entries',

  // Routines
  routine: 'Routine',
  routinePlural: 'Routines',

  // Lists
  list:          'List',
  listPlural:    'Lists',
  listItem:      'Item',
  listItemPlural:'Items',
  listType:      'List Type',

  views: {
    tasks:     'Tasks',
    calendar:  'Calendar',
    records:   'Records',
    lists:     'Lists',
    portfolio: 'Portfolio',
    notes:     'Notes',
    fitness:   'Fitness',
  },

  // Portfolio
  portfolio:           'Portfolio',
  watchlist:           'Watchlist',
  watchlistItem:       'Ticker',
  watchlistItemPlural: 'Tickers',
  portfolioTag:        'Tag',
  investmentPurpose:   'Investment Purpose',

  // Fitness
  fitness:         'Fitness',
  activity:        'Activity',
  activityPlural:  'Activities',
} as const;
