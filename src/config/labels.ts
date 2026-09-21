// All user-facing terminology lives here.
// Renaming any concept requires changing only this file — no logic changes.

const COLLECTION = 'Endeavour';
const COLLECTION_PLURAL = 'Endeavours';

export const LABELS = {
  collection:       COLLECTION,
  collectionPlural: COLLECTION_PLURAL,
  noCollection:     `No ${COLLECTION}`,
  addToCollection:  `Add to ${COLLECTION}:`,
  noneInCollection: (things: string) => `No ${things} in this ${COLLECTION}`,
  quickAccessPlaceholder: `Jump to a note, task, list, tracker, routine, or ${COLLECTION}…`,
  collectionFilterHint:  `Expand ${COLLECTION} filter`,
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

  // Voice dictation (src/services/speech/, src/components/VoiceIndicator/). `errors` is keyed
  // by SpeechErrorCode.
  voice: {
    listening:    'Listening…',
    transcribing: 'Transcribing…',
    stopHint:     (hotkey: string) => `${hotkey} or Enter to finish · Esc to cancel`,
    noTarget:     'Click into a text field first, then start dictation.',
    done:         'Finish',
    cancel:       'Cancel',
    errors: {
      'signed-out':      'Sign in to use voice dictation.',
      'limit-reached':   'Monthly dictation limit reached.',
      'not-configured':  'Voice dictation isn\'t set up on the server yet.',
      unavailable:       'Couldn\'t reach the speech service.',
      'mic-denied':      'Microphone access was blocked.',
      'mic-unavailable': 'No microphone was found.',
      failed:            'Couldn\'t transcribe that.',
    } as Record<string, string>,
  },

  // Local storage limits — see utils/persistStorage.ts and Settings → Storage.
  storage: {
    keyNames: {
      'todo-app-storage':      'Tasks',
      'todo-calendar':         'Calendar',
      'todo-schedules':        'Schedules',
      'todo-tracker':          'Records',
      'todo-routines':         'Routines',
      'notes-storage':         'Notes',
      'lists-storage':         'Lists',
      'fitness-storage':       'Fitness',
      'todo-portfolio':        'Portfolio',
      'todo-settings':         'Settings',
      'todo-notifications':    'Notifications',
      'todo-recent-items':     'Quick Access history',
      'todo-hotkey-overrides': 'Keyboard shortcuts',
      'todo-ui-session':       'Session',
    } as Record<string, string>,
    fullTitle:   'Storage on this device is full',
    fullMessage: (biggest: string) => `Your latest changes can't be saved on this device any more, so they'll be lost if you close the app — nothing is lost while it stays open, and if you're signed in they still sync to your account. ${biggest} Open Settings → Storage to see what is using the space.`.replace('  ', ' '),
    saveFailedTitle:   "Changes couldn't be saved",
    saveFailedMessage: "Your latest changes couldn't be saved on this device, so they'll be lost if you close the app. If you're signed in they still sync to your account. Try exporting a backup (Account → Export).",
    section:     'Storage',
    usageName:   'Used on this device',
    usageDesc:   "Most data lives in the browser's local storage, which allows roughly 5 MB in total. Notes are kept in a separate database with far more room. Sizes are approximate.",
    inDatabase:  'database',
    shrinkName:  'Shrink images in notes',
    shrinkDesc:  'Recompresses large pasted images (to fit 1600 px) in every note and tab. Text is untouched; the image quality on screen stays good. The open note is closed first.',
    shrinkButton: 'Shrink images',
    shrinking:   'Shrinking…',
    shrinkNothing: 'No large images found.',
    shrinkDone:  (images: number, notes: number, saved: string) => `Shrank ${images} image${images === 1 ? '' : 's'} in ${notes} note${notes === 1 ? '' : 's'}, freeing about ${saved}.`,
  },

  // The "Linked from" bar in a note and its remove-link prompt: src/components/NoteEditor/NoteBacklinks.tsx.
  noteBacklinks: {
    linkedFrom:      'Linked from',
    open:            'Open',
    insert:          'Insert into the note at the cursor as a link',
    remove:          'Remove this link',
    otherTabs:       'On other tabs',
    goToTab:         (tab: string) => `Go to the "${tab}" tab`,
    chipTitleOtherTabs: (here: number, elsewhere: number) => `${here} on this tab, ${elsewhere} on other tabs`,
    removeTitle:     'Remove the link too?',
    removeMessage:   (noun: string) => `You removed the text that linked to this ${noun}. Remove the link entirely, or keep it in this note's "Linked from" list?`,
    removeConfirm:   'Remove link entirely',
    keepLink:        'Keep link',
  },

  // Shared by every item pane that can be archived/deleted (Task, Calendar event, Calendar
  // reminder — and future apps): see src/components/ItemActions/.
  itemActions: {
    archive:           'Archive',
    restore:           'Restore',
    complete:          'Complete',
    reopen:            'Mark incomplete',
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

  // In-app replacement for window.confirm()/alert() — see components/ConfirmDialog
  dialogs: {
    confirm:    'Confirm',
    cancel:     'Cancel',
    ok:         'OK',
    alertTitle: 'Something went wrong',
  },

  errorBoundary: {
    appTitle:       'Something went wrong',
    appMessage:     "The app hit an unexpected error and couldn't continue. Your data is still saved on this device. Reloading usually fixes it; if it keeps happening, export a backup first.",
    sectionTitle:   (section: string) => `${section} hit an error`,
    sectionMessage: "This section couldn't be shown. The rest of the app still works — switch to another section, or try again.",
    reload:         'Reload',
    reloadSection:  'Reload this section',
    exportBackup:   'Export backup',
    backupFailed:   "Couldn't export a backup.",
    details:        'Details',
  },

  signOut: {
    title:         'Sign out?',
    message:       "Your tasks, calendar, records, lists, notes and portfolio are removed from this device when you sign out. They stay in your account and come back when you sign in.",
    keptOnDevice:  "Kept on this device, because they aren't saved to your account yet: Fitness activities and activity types, routine check-off history, and your settings.",
    confirm:       'Sign out',
    unsavedTitle:  "Some changes couldn't be saved",
    unsavedMessage: (reason: string) => `Your latest changes couldn't be saved to your account (${reason}). Signing out now will discard anything that hasn't been saved.`,
    unsavedConfirm: 'Sign out and discard',
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
