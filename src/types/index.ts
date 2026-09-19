// ── Branded ID types ───────────────────────────────────────────────────────────
export type TaskId             = string & { readonly _brand: 'TaskId'             };
export type TagId              = string & { readonly _brand: 'TagId'              };
export type CollectionId       = string & { readonly _brand: 'CollectionId'       };
export type PurposeId          = string & { readonly _brand: 'PurposeId'          };
export type CalendarEventId    = string & { readonly _brand: 'CalendarEventId'    };
export type CalendarReminderId = string & { readonly _brand: 'CalendarReminderId' };
export type TrackerEntryId     = string & { readonly _brand: 'TrackerEntryId'     };
export type ScheduleId         = string & { readonly _brand: 'ScheduleId'         };

// ── Enum-like string unions ─────────────────────────────────────────────────────
export type Priority       = 'none' | 'low' | 'medium' | 'high';
export type CollectionKind = 'project' | 'list' | 'tracker' | 'routine';  // extensible
export type TaskKind       = 'action'  | 'waiting' | 'milestone'; // extensible — add more as needed
export type NotifyUnit     = 'minutes' | 'hours'   | 'days';

// ── Cross-app links ──────────────────────────────────────────────────────────────
// Generic backlink shape shared by every entity that can be created FROM a Notes
// selection (Task today; event/listItem/trackerEntry are the planned next targets —
// see CLAUDE.md "Cross-app linking"). `type` doubles as the render/navigate discriminator
// (which icon, which section to switch to) — no denormalized title/label is stored here,
// display data is always looked up live from the referenced entity's own store so it can
// never go stale. The *forward* half of the link (Note → Task) lives embedded in the
// note's own rich-text content as an ArtifactLinkMark, not here — this field only carries
// the reverse direction, so a Task/Event/etc. can show what note(s) it was linked from.
export type CrossAppRefType = 'note' | 'task' | 'event' | 'reminder' | 'listItem' | 'trackerEntry';
export interface CrossAppRef {
  type: CrossAppRefType;
  id:   string;
}
export type TimeIntensity  = 'low' | 'medium' | 'high'; // extensible — add more as needed

// ── Routine types ───────────────────────────────────────────────────────────────
export interface RoutineTask {
  id:    string;
  title: string;
  order: number;
}

// UI-only — never persisted to Supabase. Keyed by `${routineId}_${date}`.
export interface RoutineInstance {
  routineId: CollectionId;
  date:      string;               // YYYY-MM-DD
  checked:   string[];             // RoutineTask IDs that have been ticked
  completed: boolean;
  entryId:   TrackerEntryId | null;
}

// ── Tracker types ───────────────────────────────────────────────────────────────
export type TrackerTemplate = 'habit' | 'books' | 'movies' | 'custom';
export type TrackerViewMode = 'list' | 'heatmap';
export type FieldType =
  | 'text' | 'number' | 'date' | 'rating'
  | 'select' | 'boolean' | 'url' | 'duration';

export interface FieldSchema {
  id:       string;
  name:     string;
  type:     FieldType;
  required?: boolean;
  options?:  string[];  // for select
  unit?:     string;    // for number
  max?:      number;    // for rating (default 5)
}

export interface TrackerEntry {
  id:        TrackerEntryId;
  trackerId: CollectionId;
  date:      string;                     // YYYY-MM-DD
  data:      Record<string, unknown>;    // keyed by FieldSchema.id
  notes:     string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTrackerEntryInput {
  trackerId: CollectionId;
  date:      string;
  data?:     Record<string, unknown>;
  notes?:    string | null;
}

// ── Tags ───────────────────────────────────────────────────────────────────────
export interface Tag {
  id:    TagId;
  name:  string;
  color: string | null;
  notes: string | null;
}

// ── Purposes ───────────────────────────────────────────────────────────────────
// High-level life areas ("Career", "Health"). Labels only — not hierarchy nodes.
export interface Purpose {
  id:          PurposeId;
  name:        string;
  description: string | null;
  color:       string | null;
  archivedAt:  string | null;  // sunset, not deleted — hidden from pickers/filters, restorable
  createdAt:   string;
  updatedAt:   string;
}

// ── Collection ─────────────────────────────────────────────────────────────────
// Abstract container for tasks. Currently displayed as "Endeavour" in the UI
// (see src/config/labels.ts). kind='project' = specific/completable;
// kind='list' = ongoing/never-complete; kind='tracker' = records tracker.
export interface Collection {
  id:          CollectionId;
  kind:        CollectionKind;
  name:        string;
  description: string | null;
  color:       string | null;
  purposeIds:  PurposeId[];
  tagIds:      TagId[];
  deadline:    string | null;  // meaningful for kind='project'
  completed:   boolean;        // meaningful for kind='project'
  completedAt: string | null;
  fieldSchema:  FieldSchema[];  // meaningful for kind='tracker'
  routineTasks: RoutineTask[];  // meaningful for kind='routine'
  repeatConfig: RepeatConfig | null;  // meaningful for kind='routine'
  collectionId: CollectionId | null;  // Endeavour this belongs to — meaningful for kind='tracker'|'routine' (trackers/routines can be filed under a project/list Endeavour, same as Task.collectionId)
  archivedAt:   string | null;  // sunset, not deleted — hidden from pickers/filters, restorable
  createdAt:    string;
  updatedAt:    string;
}

// ── Milestone ──────────────────────────────────────────────────────────────────
// Computed (never persisted) — derived from tasks belonging to a collection.
// source is a string union kept open for future milestone origins (manual, etc.)
export type MilestoneSource = 'task';

export interface Milestone {
  id:     string;              // deterministic: `milestone-task-${taskId}`
  source: MilestoneSource;
  taskId: TaskId | null;       // populated when source = 'task'
  date:   string;              // ISO date 'YYYY-MM-DD'
  title:  string;              // e.g. 'Complete "Fix login bug"'
}

// ── Task ───────────────────────────────────────────────────────────────────────
export interface Task {
  id:           TaskId;
  createdAt:    string;
  updatedAt:    string;
  title:        string;
  notes:        string | null;
  links:        string[];
  completed:    boolean;
  completedAt:  string | null;
  collectionId: CollectionId | null;  // which Collection this task belongs to
  tagIds:       TagId[];
  purposeIds:   PurposeId[];
  priority:     Priority;
  deadline:      string | null;        // ISO date 'YYYY-MM-DD'
  deadlineTime:  string | null;        // 'HH:MM' (24-hour), null if no time set
  scheduledAt:   string | null;        // ISO date 'YYYY-MM-DD' — day user plans to do the task
  scheduledTime: string | null;        // 'HH:MM' (24-hour), optional companion to scheduledAt
  calendarEventId: CalendarEventId | null; // auto-created event when scheduledAt is set
  calendarReminderId: CalendarReminderId | null; // auto-created reminder when deadline is set
  remindAt:      string | null;
  archived:     boolean;
  archivedAt:    string | null;        // when it was archived; null while active
  archiveReason: string | null;        // optional "why" captured at archive time — kept separate from notes
  kind:          TaskKind;             // 'action' | 'waiting' | 'milestone' (default: 'action')
  timeIntensity: TimeIntensity | null; // effort estimate — null means unset
  parentId:      TaskId | null;        // set → this task is a sub-task
  subtaskIds:    TaskId[];
  sortOrder:     number;
  crossAppRefs:  CrossAppRef[];        // reverse cross-app links (e.g. the note(s) this task was created from)
}

// ── Persisted application data ─────────────────────────────────────────────────
export interface AppData {
  version:     number;
  tasks:       Record<TaskId,       Task>;
  tags:        Record<TagId,        Tag>;
  collections: Record<CollectionId, Collection>;
  purposes:    Record<PurposeId,    Purpose>;
}

// ── Input types ────────────────────────────────────────────────────────────────
export interface CreateTaskInput {
  title:           string;
  notes?:          string | null;
  links?:          string[];
  deadline?:        string | null;
  deadlineTime?:    string | null;
  scheduledAt?:     string | null;
  scheduledTime?:   string | null;
  calendarEventId?: CalendarEventId | null;
  calendarReminderId?: CalendarReminderId | null;
  collectionId?:   CollectionId | null;
  tagIds?:         TagId[];
  purposeIds?:     PurposeId[];
  priority?:        Priority;
  kind?:            TaskKind;
  timeIntensity?:   TimeIntensity | null;
  parentId?:        TaskId | null;
  crossAppRefs?:    CrossAppRef[];
}

export interface CreateCollectionInput {
  kind:         CollectionKind;
  name:         string;
  description?: string | null;
  color?:       string | null;
  purposeIds?:  PurposeId[];
  tagIds?:      TagId[];
  deadline?:    string | null;
  fieldSchema?:  FieldSchema[];
  template?:     TrackerTemplate;
  routineTasks?: RoutineTask[];
  repeatConfig?: RepeatConfig | null;
  collectionId?: CollectionId | null;
}

export interface CreatePurposeInput {
  name:         string;
  description?: string | null;
  color?:       string | null;
}

// ── Calendar ───────────────────────────────────────────────────────────────────
// CalendarItemKind is kept as a string union for easy label overrides in labels.ts.
export type CalendarItemKind  = 'event' | 'reminder';
export type CalendarEventType = 'default' | 'birthday' | 'task';
// A self-created event's confirmation state — 'tentative' is a placeholder the user put on
// the calendar to be aware something might happen, not yet committed to (see CLAUDE.md
// "Tentative events"). Named after (and worth keeping compatible with) the iCalendar spec's
// STATUS property (TENTATIVE/CONFIRMED/CANCELLED) — CANCELLED isn't modeled here since
// deleting the event already covers that. Kept as its own type alias (not inlined) so
// renaming/extending the concept later — the user's own stated wish going into this — only
// touches this one line, not every call site.
export type EventStatus = 'confirmed' | 'tentative';
// 'task' = auto-created shadow event for a scheduled task (Task.scheduledAt/calendarEventId) —
// drives the calendar layer toggle's "Task scheduled" layer, alongside the 🕐-icon overlay
// (taskLinkedEventIds in CalendarView.tsx) that already marks these visually.
export type CalendarReminderType = 'default' | 'task';
// 'task' = auto-created shadow reminder for a task deadline (Task.deadline/calendarReminderId)
// — drives the calendar layer toggle's "Task deadlines" layer. Always excluded from the
// reminders-derived kind:'reminder' render pass in CalendarView.tsx (the deadline still renders
// as its own kind:'task' pill, synthesized directly from the Task, unchanged) — this row exists
// for sync/layer-filtering/notification purposes, not to be shown a second time.
export type RepeatFreq        = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RepeatConfig {
  freq:        RepeatFreq;
  interval:    number;                          // every N freq-units
  endKind:     'forever' | 'count' | 'until';
  count:       number | null;                   // number of total occurrences
  until:       string | null;                   // YYYY-MM-DD
  daysOfWeek?: number[];                        // 0=Sun … 6=Sat; used by routines
  // Individual occurrence dates (YYYY-MM-DD) removed from a repeating calendar event/reminder —
  // "delete just this one". Lives inside RepeatConfig (already a jsonb column) so it needs no
  // schema change. See src/utils/recurrence.ts.
  exceptions?: string[];
}

// A time-bounded appointment (e.g. "Doctor at 2pm–3pm").
export interface CalendarEvent {
  id:                 CalendarEventId;
  title:              string;
  date:               string;               // YYYY-MM-DD
  endDate:            string | null;        // YYYY-MM-DD — last day of a multi-day event
  startTime:          string | null;        // HH:MM (24-hour)
  endTime:            string | null;        // HH:MM (24-hour)
  notes:              string | null;
  location:           string | null;
  eventType:          CalendarEventType;
  collectionId:       CollectionId | null;
  createdAt:          string;
  updatedAt:          string;
  notifyBeforeValue:  number | null;    // null = no "notify before" notification (opt-in, like repeat)
  notifyBeforeUnit:   NotifyUnit;
  remindAt:           string | null;
  notifyAtTime:       string | null;
  repeat:             RepeatConfig | null;
  status:             EventStatus;      // 'confirmed' (default) | 'tentative' — see EventStatus
  important:          boolean;          // flagged important — red outline + ❗ on the calendar
  crossAppRefs:       CrossAppRef[];    // reverse cross-app links (e.g. the note(s) this event was created from)
  archivedAt:         string | null;    // sunset, not deleted — hidden from the calendar, restorable (same as Task)
  archiveReason:      string | null;    // optional "why", captured when archiving
  // External calendar sync provenance (see CLAUDE.md "External calendar sync — built (Google,
  // Phase 1)"). All null for a native, in-app-created event. Once synced in, this app is the
  // source of truth — these fields are provenance/dedup only, never used to re-sync or
  // overwrite the event again.
  source:             string | null;              // 'google' (future: 'microsoft'); null = native
  sourceConnectionId: string | null;              // which connected ACCOUNT (CalendarConnection.id) — supports multiple accounts of the same provider
  sourceCalendarId:   string | null;              // which calendar within that account (a Google account can have several)
  sourceEventId:      string | null;              // the provider's own event id — (sourceConnectionId, sourceCalendarId, sourceEventId) together are the dedup key
  sourceRaw:          Record<string, unknown> | null; // full provider payload, so surfacing more fields later isn't a re-sync
}

// A point-in-time reminder (not duration-based). Also the type used to
// represent task deadlines and milestones on the calendar surface.
export interface CalendarReminder {
  id:           CalendarReminderId;
  title:        string;
  date:         string;               // YYYY-MM-DD
  time:         string | null;        // HH:MM (24-hour)
  notes:        string | null;
  collectionId: CollectionId | null;
  reminderType: CalendarReminderType; // 'default' | 'task' — see CalendarReminderType
  createdAt:    string;
  updatedAt:    string;
  remindAt:     string | null;
  repeat:       RepeatConfig | null;
  important:    boolean;              // flagged important — red outline + ❗ on the calendar
  crossAppRefs: CrossAppRef[];        // reverse cross-app links (e.g. the note(s) this reminder was created from)
  archivedAt:    string | null;       // sunset, not deleted — hidden from the calendar, restorable (same as Task)
  archiveReason: string | null;       // optional "why", captured when archiving
  // When to notify for a reminder with no time (a whole-day one): N days before `date` (0 = on the
  // day), at this HH:MM. Ignored when `time` is set — that notifies at the time itself.
  notifyDaysBefore: number;
  notifyAtTime:     string;
}

export interface CreateCalendarEventInput {
  title:              string;
  date:               string;
  endDate?:           string | null;
  startTime?:         string | null;
  endTime?:           string | null;
  notes?:             string | null;
  location?:          string | null;
  eventType?:         CalendarEventType;
  collectionId?:      CollectionId | null;
  notifyBeforeValue?: number | null;
  notifyBeforeUnit?:  NotifyUnit;
  notifyAtTime?:      string | null;
  repeat?:            RepeatConfig | null;
  status?:            EventStatus;
  important?:         boolean;
  crossAppRefs?:      CrossAppRef[];
  source?:             string | null;
  sourceConnectionId?: string | null;
  sourceCalendarId?:   string | null;
  sourceEventId?:      string | null;
  sourceRaw?:          Record<string, unknown> | null;
}

// One connected external calendar account (see CLAUDE.md "External calendar sync").
// Client-side representation only — never carries tokens (those stay server-side; see
// api/google-calendar-status.ts). Multiple connections of the same provider are supported
// (e.g. two Google accounts), each with its own id.
export interface CalendarConnectionCalendar {
  id:      string;   // the provider's own calendar id (e.g. "primary", or an email-shaped id)
  name:    string;
  color:   string | null;
  enabled: boolean;  // whether this calendar's events are pulled in
}

export interface CalendarConnection {
  id:           string;
  provider:     string;   // 'google' (future: 'microsoft')
  accountEmail: string;
  calendars:    CalendarConnectionCalendar[];
  createdAt:    string;
}

export interface CreateCalendarReminderInput {
  title:        string;
  date:         string;
  time?:        string | null;
  notes?:       string | null;
  collectionId?: CollectionId | null;
  reminderType?: CalendarReminderType;
  repeat?:       RepeatConfig | null;
  important?:    boolean;
  crossAppRefs?: CrossAppRef[];
  notifyDaysBefore?: number;
  notifyAtTime?:     string;
}

// ── Schedule (recurring weekly timetable, e.g. a university/gym schedule) ───────
// A named, colour-coded, independently toggle-able LAYER of recurring weekly blocks —
// modelled on Google Calendar's "multiple calendars" concept, not on this app's existing
// Collection kind='routine' (a daily habit checklist — a completely different thing despite
// the similar-sounding name). See CLAUDE.md's "Schedule" section for the full design writeup.
export interface ScheduleBlock {
  id:             string;        // nanoid(8)
  title:          string;
  daysOfWeek:     number[];      // 0=Sun … 6=Sat; multiple days share one block (e.g. Mon/Wed/Fri)
  startTime:      string;        // HH:MM
  endTime:        string;        // HH:MM
  location:       string | null;
  interval:       number;        // weeks between occurrences; 1 = every week, 2 = every second week
  intervalAnchor: string;        // YYYY-MM-DD — the week containing this date is "week 0" for interval > 1
  exceptions:     string[];      // YYYY-MM-DD dates to skip — a single cancelled occurrence
  notes:          string | null;
  // Commitment mode (e.g. a gym class schedule you can't always attend, vs a university
  // timetable you always attend by default): when true, an occurrence renders muted/
  // uncommitted unless its date is in committedDates — the opposite default from the
  // classic "attend unless skipped" behaviour, which stays unchanged when this is false.
  // See CLAUDE.md "Schedule commitment mode".
  requiresCommitment: boolean;
  committedDates:     string[];  // YYYY-MM-DD — occurrences explicitly committed to (meaningful only when requiresCommitment is true)
}

export interface ScheduleTemplate {
  id:           ScheduleId;
  name:         string;
  color:        string | null;
  startDate:    string | null;   // null = no lower bound
  endDate:      string | null;   // null = no upper bound
  active:       boolean;         // shown on the real calendar, or hidden (kept, not deleted)
  collectionId: CollectionId | null;
  blocks:       ScheduleBlock[];
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateScheduleInput {
  name:          string;
  color?:        string | null;
  startDate?:    string | null;
  endDate?:      string | null;
  collectionId?: CollectionId | null;
}

export interface CreateScheduleBlockInput {
  title:          string;
  daysOfWeek:     number[];
  startTime:      string;
  endTime:        string;
  location?:      string | null;
  interval?:      number;
  intervalAnchor?: string;
  notes?:         string | null;
  requiresCommitment?: boolean;
}

// ── UI-only types (never persisted) ───────────────────────────────────────────
export type TaskViewMode  = 'focused' | 'overview';
export type FilterStatus  = 'all' | 'active' | 'completed';
export type SortField     = 'createdAt' | 'deadline' | 'priority' | 'sortOrder';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
  status:       FilterStatus;
  tagIds:       TagId[];
  collectionId: CollectionId | null;
  purposeId:    PurposeId | null;
  sortField:    SortField;
  sortDir:      SortDirection;
  query:        string;
}

// ── Note types (from notes.ts) ──────────────────────────────────────────────────
export type { NoteId, NoteTagId, Note, NoteTab, NoteTag, CreateNoteInput, CreateNoteTagInput, NoteTagFieldDef, NoteTagFieldType, StructuredTagEntryId, StructuredTagEntry } from './notes';

// ── List types (from lists.ts) ───────────────────────────────────────────────
export type {
  ListId, ListItemId, ListTypeId,
  ListItemStatus, ListFieldType, ListFieldSchema,
  ListType, List, ListItem,
  CreateListInput, CreateListItemInput,
} from './lists';
export { LIST_ITEM_STATUS_META } from './lists';
