import type {
  Task, Collection, Tag, Purpose,
  CalendarEvent, CalendarReminder, TrackerEntry,
} from '@/types';

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
    deadline:       t.deadline       ?? null,
    deadline_time:  t.deadlineTime   ?? null,
    remind_at:      t.remindAt       ?? null,
    archived:       t.archived       ?? false,
    kind:           t.kind           ?? 'action',
    time_intensity: t.timeIntensity  ?? null,
    parent_id:      t.parentId       ?? null,
    subtask_ids:    t.subtaskIds     ?? [],
    sort_order:     t.sortOrder      ?? 0,
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
    deadline:      r.deadline      ?? null,
    deadlineTime:  r.deadline_time ?? null,
    remindAt:      r.remind_at     ?? null,
    archived:      r.archived      ?? false,
    kind:          r.kind          ?? 'action',
    timeIntensity: r.time_intensity ?? null,
    parentId:      r.parent_id     ?? null,
    subtaskIds:    r.subtask_ids   ?? [],
    sortOrder:     r.sort_order    ?? 0,
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
    remindAt:     r.remind_at     ?? null,
    repeat:       r.repeat        ?? null,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  };
}
