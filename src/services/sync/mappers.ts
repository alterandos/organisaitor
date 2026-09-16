import type {
  Task, Collection, Tag, Purpose,
  CalendarEvent, CalendarReminder, TrackerEntry,
  ScheduleTemplate,
} from '@/types';
import type { List, ListItem, ListType } from '@/types/lists';

// ── Task ────────────────────────────────────────────────────────

export function taskToRow(t: Task, userId: string) {
  return {
    id:             t.id,
    user_id:        userId,
    title:          t.title,
    notes:          t.notes          ?? null,
    links:          t.links          ?? [],
    completed:      t.completed      ?? false,
    completed_at:   t.completedAt    ?? null,
    collection_id:  t.collectionId   ?? null,
    tag_ids:        t.tagIds         ?? [],
    purpose_ids:    t.purposeIds     ?? [],
    priority:       t.priority       ?? 'none',
    deadline:          t.deadline          ?? null,
    deadline_time:     t.deadlineTime      ?? null,
    scheduled_at:      t.scheduledAt       ?? null,
    scheduled_time:    t.scheduledTime     ?? null,
    calendar_event_id: t.calendarEventId   ?? null,
    calendar_reminder_id: t.calendarReminderId ?? null,
    remind_at:         t.remindAt          ?? null,
    archived:       t.archived       ?? false,
    kind:           t.kind           ?? 'action',
    time_intensity: t.timeIntensity  ?? null,
    parent_id:      t.parentId       ?? null,
    subtask_ids:    t.subtaskIds     ?? [],
    sort_order:     t.sortOrder      ?? 0,
    cross_app_refs: t.crossAppRefs   ?? [],
    created_at:     t.createdAt,
    updated_at:     t.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToTask(r: Record<string, any>): Task {
  return {
    id:            r.id,
    title:         r.title,
    notes:         r.notes         ?? null,
    links:         r.links         ?? [],
    completed:     r.completed     ?? false,
    completedAt:   r.completed_at  ?? null,
    collectionId:  r.collection_id ?? null,
    tagIds:        r.tag_ids       ?? [],
    purposeIds:    r.purpose_ids   ?? [],
    priority:      r.priority      ?? 'none',
    deadline:        r.deadline           ?? null,
    deadlineTime:    r.deadline_time      ?? null,
    scheduledAt:     r.scheduled_at       ?? null,
    scheduledTime:   r.scheduled_time     ?? null,
    calendarEventId: r.calendar_event_id  ?? null,
    calendarReminderId: r.calendar_reminder_id ?? null,
    remindAt:        r.remind_at          ?? null,
    archived:      r.archived      ?? false,
    kind:          r.kind          ?? 'action',
    timeIntensity: r.time_intensity ?? null,
    parentId:      r.parent_id     ?? null,
    subtaskIds:    r.subtask_ids   ?? [],
    sortOrder:     r.sort_order    ?? 0,
    crossAppRefs:  r.cross_app_refs ?? [],
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  };
}

// ── Collection ──────────────────────────────────────────────────

export function collectionToRow(c: Collection, userId: string) {
  return {
    id:            c.id,
    user_id:       userId,
    kind:          c.kind          ?? 'project',
    name:          c.name,
    description:   c.description   ?? null,
    color:         c.color         ?? null,
    purpose_ids:   c.purposeIds    ?? [],
    tag_ids:       c.tagIds        ?? [],
    deadline:      c.deadline      ?? null,
    completed:     c.completed     ?? false,
    completed_at:  c.completedAt   ?? null,
    field_schema:  c.fieldSchema   ?? [],
    routine_tasks: c.routineTasks  ?? [],
    repeat_config: c.repeatConfig  ?? null,
    collection_id: c.collectionId  ?? null,
    archived_at:   c.archivedAt    ?? null,
    created_at:    c.createdAt,
    updated_at:    c.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToCollection(r: Record<string, any>): Collection {
  return {
    id:           r.id,
    kind:         r.kind          ?? 'project',
    name:         r.name,
    description:  r.description   ?? null,
    color:        r.color         ?? null,
    purposeIds:   r.purpose_ids   ?? [],
    tagIds:       r.tag_ids       ?? [],
    deadline:     r.deadline      ?? null,
    completed:    r.completed     ?? false,
    completedAt:  r.completed_at  ?? null,
    fieldSchema:  r.field_schema  ?? [],
    routineTasks: r.routine_tasks ?? [],
    repeatConfig: r.repeat_config ?? null,
    collectionId: r.collection_id ?? null,
    archivedAt:   r.archived_at   ?? null,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  };
}

// ── TrackerEntry ────────────────────────────────────────────────

export function entryToRow(e: TrackerEntry, userId: string) {
  return {
    id:         e.id,
    user_id:    userId,
    tracker_id: e.trackerId,
    date:       e.date,
    data:       e.data      ?? {},
    notes:      e.notes     ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToEntry(r: Record<string, any>): TrackerEntry {
  return {
    id:        r.id,
    trackerId: r.tracker_id,
    date:      r.date,
    data:      r.data       ?? {},
    notes:     r.notes      ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Tag ─────────────────────────────────────────────────────────

export function tagToRow(t: Tag, userId: string) {
  return { id: t.id, user_id: userId, name: t.name, color: t.color, notes: t.notes ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToTag(r: Record<string, any>): Tag {
  return { id: r.id, name: r.name, color: r.color ?? null, notes: r.notes ?? null };
}

// ── Purpose ─────────────────────────────────────────────────────

export function purposeToRow(p: Purpose, userId: string) {
  return {
    id:          p.id,
    user_id:     userId,
    name:        p.name,
    description: p.description,
    color:       p.color,
    archived_at: p.archivedAt   ?? null,
    created_at:  p.createdAt,
    updated_at:  p.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToPurpose(r: Record<string, any>): Purpose {
  return {
    id:          r.id,
    name:        r.name,
    description: r.description ?? null,
    color:       r.color       ?? null,
    archivedAt:  r.archived_at ?? null,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

// ── CalendarEvent ───────────────────────────────────────────────

export function eventToRow(e: CalendarEvent, userId: string) {
  return {
    id:                  e.id,
    user_id:             userId,
    title:               e.title,
    date:                e.date,
    end_date:            e.endDate,
    start_time:          e.startTime,
    end_time:            e.endTime,
    notes:               e.notes,
    location:            e.location,
    event_type:          e.eventType,
    collection_id:       e.collectionId,
    notify_before_value: e.notifyBeforeValue,
    notify_before_unit:  e.notifyBeforeUnit,
    remind_at:           e.remindAt,
    notify_at_time:      e.notifyAtTime,
    repeat:              e.repeat,
    created_at:          e.createdAt,
    updated_at:          e.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToEvent(r: Record<string, any>): CalendarEvent {
  return {
    id:                 r.id,
    title:              r.title,
    date:               r.date,
    endDate:            r.end_date            ?? null,
    startTime:          r.start_time          ?? null,
    endTime:            r.end_time            ?? null,
    notes:              r.notes               ?? null,
    location:           r.location            ?? null,
    eventType:          r.event_type          ?? 'default',
    collectionId:       r.collection_id       ?? null,
    notifyBeforeValue:  r.notify_before_value ?? 1,
    notifyBeforeUnit:   r.notify_before_unit  ?? 'hours',
    remindAt:           r.remind_at           ?? null,
    notifyAtTime:       r.notify_at_time      ?? null,
    repeat:             r.repeat              ?? null,
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
  };
}

// ── CalendarReminder ────────────────────────────────────────────

export function reminderToRow(r: CalendarReminder, userId: string) {
  return {
    id:            r.id,
    user_id:       userId,
    title:         r.title,
    date:          r.date,
    time:          r.time,
    notes:         r.notes,
    collection_id: r.collectionId,
    reminder_type: r.reminderType ?? 'default',
    remind_at:     r.remindAt,
    repeat:        r.repeat,
    created_at:    r.createdAt,
    updated_at:    r.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToReminder(r: Record<string, any>): CalendarReminder {
  return {
    id:           r.id,
    title:        r.title,
    date:         r.date,
    time:         r.time          ?? null,
    notes:        r.notes         ?? null,
    collectionId: r.collection_id ?? null,
    reminderType: r.reminder_type ?? 'default',
    remindAt:     r.remind_at     ?? null,
    repeat:       r.repeat        ?? null,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  };
}

// ── Schedule ────────────────────────────────────────────────────

export function scheduleToRow(s: ScheduleTemplate, userId: string) {
  return {
    id:            s.id,
    user_id:       userId,
    name:          s.name,
    color:         s.color        ?? null,
    start_date:    s.startDate    ?? null,
    end_date:      s.endDate      ?? null,
    active:        s.active       ?? true,
    collection_id: s.collectionId ?? null,
    blocks:        s.blocks       ?? [],
    created_at:    s.createdAt,
    updated_at:    s.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToSchedule(r: Record<string, any>): ScheduleTemplate {
  return {
    id:           r.id,
    name:         r.name,
    color:        r.color         ?? null,
    startDate:    r.start_date    ?? null,
    endDate:      r.end_date      ?? null,
    active:       r.active        ?? true,
    collectionId: r.collection_id ?? null,
    blocks:       r.blocks        ?? [],
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  };
}

// ── List ────────────────────────────────────────────────────────

export function listToRow(l: List, userId: string) {
  return {
    id:           l.id,
    user_id:      userId,
    name:         l.name,
    description:  l.description ?? null,
    type_id:      l.typeId      ?? null,
    kind:         l.kind,
    color:        l.color       ?? null,
    icon:         l.icon        ?? null,
    field_schema: l.fieldSchema ?? [],
    tabs:         l.tabs        ?? [],
    created_at:   l.createdAt,
    updated_at:   l.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToList(r: Record<string, any>): List {
  return {
    id:          r.id,
    name:        r.name,
    description: r.description  ?? null,
    typeId:      r.type_id      ?? null,
    kind:        r.kind         ?? 'reference',
    color:       r.color        ?? null,
    icon:        r.icon         ?? null,
    fieldSchema: r.field_schema ?? [],
    tabs:        r.tabs         ?? [],
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

// ── ListItem ────────────────────────────────────────────────────

export function listItemToRow(i: ListItem, userId: string) {
  return {
    id:         i.id,
    user_id:    userId,
    list_id:    i.listId,
    title:      i.title,
    status:     i.status ?? 'want',
    tab_id:     i.tabId  ?? null,
    data:       i.data   ?? {},
    notes:      i.notes  ?? null,
    links:      i.links  ?? [],
    sort_order: i.order  ?? 0,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToListItem(r: Record<string, any>): ListItem {
  return {
    id:        r.id,
    listId:    r.list_id,
    title:     r.title,
    status:    r.status  ?? 'want',
    tabId:     r.tab_id  ?? null,
    data:      r.data    ?? {},
    notes:     r.notes   ?? null,
    links:     r.links   ?? [],
    order:     r.sort_order ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── ListType (custom only — built-ins never sync, see 014 migration) ──────────

export function listTypeToRow(t: ListType, userId: string) {
  return {
    id:             t.id,
    user_id:        userId,
    name:           t.name,
    icon:           t.icon,
    color:          t.color ?? null,
    kind:           t.kind,
    default_fields: t.defaultFields ?? [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToListType(r: Record<string, any>): ListType {
  return {
    id:            r.id,
    name:          r.name,
    icon:          r.icon,
    color:         r.color ?? null,
    kind:          r.kind,
    defaultFields: r.default_fields ?? [],
    isBuiltIn:     false,
  };
}
