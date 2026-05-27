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

  views: {
    tasks:     'Tasks',
    calendar:  'Calendar',
    records:   'Records',
    portfolio: 'Portfolio',
  },

  // Portfolio
  portfolio:           'Portfolio',
  watchlist:           'Watchlist',
  watchlistItem:       'Ticker',
  watchlistItemPlural: 'Tickers',
  portfolioTag:        'Tag',
  investmentPurpose:   'Investment Purpose',
} as const;
