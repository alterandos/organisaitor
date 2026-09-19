// Single source of truth for "everything a full local backup/restore should cover" —
// every localStorage key any store persists to. Add a new key here whenever a new
// persisted store is added, so ExportCard/RestoreCard (IntegrationsPane) and
// AccountPane's Export/Restore backup stay complete without needing to remember two
// separate lists (they used to be separate, hand-maintained lists that had drifted —
// Notes/Lists/Fitness/Portfolio/Records/Routines were all missing from both).
export const PERSISTED_STORAGE_KEYS = [
  'todo-app-storage',   // taskStore: tasks, collections, tags, purposes
  'todo-calendar',      // calendarStore: events, reminders
  'todo-schedules',     // scheduleStore: Schedule templates (recurring weekly timetables)
  'todo-tracker',       // trackerStore: tracker entries (Records)
  'todo-routines',      // routineStore: routine instances (Records)
  'notes-storage',      // noteStore: notes, note tags
  'lists-storage',      // listStore: lists, list items, list types
  'fitness-storage',    // fitnessStore: activities, activity types
  'todo-portfolio',     // portfolioStore
  'todo-settings',      // settingsStore
  'todo-notifications', // notificationStore
  'todo-recent-items',  // recentItemsStore: Quick Access pane recent/frequent visit history
  'todo-hotkey-overrides', // hotkeyOverridesStore: user-rebound keyboard shortcuts
  'todo-ui-session',    // uiStore: navigation/session memory (active section, back/forward
                         // history, each section's last-open item + tab, filters) — modal/
                         // pane open-states are NOT included, see uiStore.ts's partialize
] as const;
