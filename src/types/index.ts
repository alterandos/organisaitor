// ── Branded ID types ───────────────────────────────────────────────────────────
export type TaskId             = string & { readonly _brand: 'TaskId'             };
export type TagId              = string & { readonly _brand: 'TagId'              };
export type CollectionId       = string & { readonly _brand: 'CollectionId'       };
export type PurposeId          = string & { readonly _brand: 'PurposeId'          };
export type CalendarEventId    = string & { readonly _brand: 'CalendarEventId'    };
export type CalendarReminderId = string & { readonly _brand: 'CalendarReminderId' };

// ── Enum-like string unions ─────────────────────────────────────────────────────
export type Priority       = 'none' | 'low' | 'medium' | 'high';
export type CollectionKind = 'project' | 'list';   // extensible — add more as needed
export type TaskKind       = 'action'  | 'waiting' | 'milestone'; // extensible — add more as needed
export type NotifyUnit     = 'minutes' | 'hours'   | 'days';
export type TimeIntensity  = 'low' | 'medium' | 'high'; // extensible — add more as needed

// ── Tags ───────────────────────────────────────────────────────────────────────
export interface Tag {
  id:    TagId;
  name:  string;
  color: string | null;
}

// ── Purposes ───────────────────────────────────────────────────────────────────
// High-level life areas ("Career", "Health"). Labels only — not hierarchy nodes.
export interface Purpose {
  id:          PurposeId;
  name:        string;
  description: string | null;
  color:       string | null;
  createdAt:   string;
  updatedAt:   string;
}

// ── Collection ─────────────────────────────────────────────────────────────────
// Abstract container for tasks. Currently displayed as "Endeavour" in the UI
// (see src/config/labels.ts). kind='project' = specific/completable;
// kind='list' = ongoing/never-complete.
export interface Collection {
  id:          CollectionId;
  kind:        CollectionKind;
  name:        string;
  description: string | null;
  color:       string | null;
  purposeIds:  PurposeId[];
  deadline:    string | null;  // meaningful for kind='project'
  completed:   boolean;        // meaningful for kind='project'
  completedAt: string | null;
  createdAt:   string;
  updatedAt:   string;
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
  deadline:     string | null;        // ISO date 'YYYY-MM-DD'
  deadlineTime: string | null;        // 'HH:MM' (24-hour), null if no time set
  remindAt:     string | null;
  archived:     boolean;
  kind:          TaskKind;             // 'action' | 'waiting' | 'milestone' (default: 'action')
  timeIntensity: TimeIntensity | null; // effort estimate — null means unset
  parentId:      TaskId | null;        // set → this task is a sub-task
  subtaskIds:    TaskId[];
  sortOrder:     number;
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
  title:        string;
  notes?:       string | null;
  links?:       string[];
  deadline?:     string | null;
  deadlineTime?: string | null;
  collectionId?: CollectionId | null;
  tagIds?:      TagId[];
  purposeIds?:  PurposeId[];
  priority?:      Priority;
  kind?:          TaskKind;
  timeIntensity?: TimeIntensity | null;
  parentId?:      TaskId | null;
}

export interface CreateCollectionInput {
  kind:         CollectionKind;
  name:         string;
  description?: string | null;
  color?:       string | null;
  purposeIds?:  PurposeId[];
  deadline?:    string | null;
}

export interface CreatePurposeInput {
  name:         string;
  description?: string | null;
  color?:       string | null;
}

// ── Calendar ───────────────────────────────────────────────────────────────────
// CalendarItemKind is kept as a string union for easy label overrides in labels.ts.
export type CalendarItemKind  = 'event' | 'reminder';
export type CalendarEventType = 'default' | 'birthday';
export type RepeatFreq        = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RepeatConfig {
  freq:     RepeatFreq;
  interval: number;                          // every N freq-units
  endKind:  'forever' | 'count' | 'until';
  count:    number | null;                   // number of total occurrences
  until:    string | null;                   // YYYY-MM-DD
}

// A time-bounded appointment (e.g. "Doctor at 2pm–3pm").
export interface CalendarEvent {
  id:                 CalendarEventId;
  title:              string;
  date:               string;               // YYYY-MM-DD
  startTime:          string | null;        // HH:MM (24-hour)
  endTime:            string | null;        // HH:MM (24-hour)
  notes:              string | null;
  location:           string | null;
  eventType:          CalendarEventType;
  collectionId:       CollectionId | null;
  createdAt:          string;
  updatedAt:          string;
  notifyBeforeValue:  number;
  notifyBeforeUnit:   NotifyUnit;
  remindAt:           string | null;
  notifyAtTime:       string | null;
  repeat:             RepeatConfig | null;
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
  createdAt:    string;
  updatedAt:    string;
  remindAt:     string | null;
  repeat:       RepeatConfig | null;
}

export interface CreateCalendarEventInput {
  title:              string;
  date:               string;
  startTime?:         string | null;
  endTime?:           string | null;
  notes?:             string | null;
  location?:          string | null;
  eventType?:         CalendarEventType;
  collectionId?:      CollectionId | null;
  notifyBeforeValue?: number;
  notifyBeforeUnit?:  NotifyUnit;
  notifyAtTime?:      string | null;
  repeat?:            RepeatConfig | null;
}

export interface CreateCalendarReminderInput {
  title:        string;
  date:         string;
  time?:        string | null;
  notes?:       string | null;
  collectionId?: CollectionId | null;
  repeat?:       RepeatConfig | null;
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
