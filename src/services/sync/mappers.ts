import type {
  Task, Collection, Tag, Purpose,
  CalendarEvent, CalendarReminder, CalendarDeadline, TrackerEntry,
  ScheduleTemplate, ItemType, TypedItem, Goal,
} from '@/types';
import type { List, ListItem, ListType } from '@/types/lists';
import type { Note, NoteTag, StructuredTagEntry } from '@/types/notes';
import type { WatchlistItem, PortfolioTag, InvestmentPurpose } from '@/types/portfolio';
import type { TrashEntry, TrashEntryId, TrashableKind, DeletedBy } from '@/types/trash';
import type { Overview } from '@/types/overview';
import type { CustomConverter } from '@/types/converters';
import type { Picture } from '@/types/pictures';
import type { PinnedItem } from '@/store/pinnedItemsStore';
import type { Activity, ActivityType } from '@/types/fitness';

// A typed item's Type and field values (migration 060), sent only once the item has had a Type,
// like encrypt_contents below, so untyped items sync before the migration has run.
const typeColumns = (i: TypedItem) => (i.typeId === undefined ? {} : { type_id: i.typeId, type_fields: i.typeFields ?? {} });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const typeFromRow = (r: Record<string, any>): TypedItem => (r.type_id == null ? {} : { typeId: r.type_id, typeFields: r.type_fields ?? {} });

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
    calendar_deadline_id: t.calendarDeadlineId ?? null,
    remind_at:         t.remindAt          ?? null,
    archived:       t.archived       ?? false,
    archived_at:    t.archivedAt     ?? null,
    archive_reason: t.archiveReason  ?? null,
    kind:           t.kind           ?? 'action',
    time_intensity: t.timeIntensity  ?? null,
    parent_id:      t.parentId       ?? null,
    subtask_ids:    t.subtaskIds     ?? [],
    sort_order:     t.sortOrder      ?? 0,
    cross_app_refs: t.crossAppRefs   ?? [],
    item_links:     t.itemLinks      ?? [],
    repeat:         t.repeat         ?? null,
    created_at:     t.createdAt,
    updated_at:     t.updatedAt,
    ...typeColumns(t),
    // Explicit null on every live upsert (not merely omitted) so a row previously
    // tombstoned by another device — e.g. restored from the Recycling Bin — has its
    // tombstone actually cleared. Supabase's upsert() only touches columns present in the
    // object, so leaving this out would let a stale deleted_at survive forever and get the
    // restored row deleted again on the next hydrateStores() (see mergeRecords()).
    deleted_at:     null,
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
    calendarDeadlineId: r.calendar_deadline_id ?? null,
    remindAt:        r.remind_at          ?? null,
    archived:      r.archived      ?? false,
    archivedAt:    r.archived_at   ?? null,
    archiveReason: r.archive_reason ?? null,
    kind:          r.kind          ?? 'action',
    timeIntensity: r.time_intensity ?? null,
    parentId:      r.parent_id     ?? null,
    subtaskIds:    r.subtask_ids   ?? [],
    sortOrder:     r.sort_order    ?? 0,
    crossAppRefs:  r.cross_app_refs ?? [],
    itemLinks:     r.item_links    ?? [],
    repeat:        r.repeat        ?? null,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
    ...typeFromRow(r),
  };
}

// ── Collection ──────────────────────────────────────────────────

// `encrypt_contents` (migration 058) is always sent, never set = false. It is `not null`, and a
// batch upsert fills a column that only some rows carry with null for the rest (found 2026-10-29:
// once one Endeavour had the setting, every batch of collections was refused). So only a nullable
// column may be sent "only once set", as the three below are: a null there reads as none.
const encryptContentsColumn = (v: boolean | undefined) => ({ encrypt_contents: v ?? false });
// Sent only once an Endeavour has had a link (migration 059): nullable, so a batch's null is "none".
const linksColumn = (v: Collection['links']) => (v === undefined ? {} : { links: v });
// A rhythm's streams (migration 061), likewise sent only once a routine has been given some.
const streamsColumn = (v: Collection['streams']) => (v === undefined ? {} : { streams: v });

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
    field_schema:  c.fieldSchema   ?? [],
    routine_tasks: c.routineTasks  ?? [],
    repeat_config: c.repeatConfig  ?? null,
    collection_id: c.collectionId  ?? null,
    archived_at:   c.archivedAt    ?? null,
    ...encryptContentsColumn(c.encryptContents),
    ...linksColumn(c.links),
    ...streamsColumn(c.streams),
    created_at:    c.createdAt,
    updated_at:    c.updatedAt,
    deleted_at:    null,
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
    fieldSchema:  r.field_schema  ?? [],
    routineTasks: r.routine_tasks ?? [],
    repeatConfig: r.repeat_config ?? null,
    collectionId: r.collection_id ?? null,
    archivedAt:   r.archived_at   ?? null,
    ...(r.encrypt_contents ? { encryptContents: true } : {}),
    ...(Array.isArray(r.links) && r.links.length ? { links: r.links } : {}),
    ...(Array.isArray(r.streams) && r.streams.length ? { streams: r.streams } : {}),
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
    deleted_at: null,
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
  return { id: t.id, user_id: userId, name: t.name, color: t.color, notes: t.notes ?? null, deleted_at: null };
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
    deleted_at:  null,
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
    links:               e.links ?? [],
    location:            e.location,
    event_type:          e.eventType,
    collection_id:       e.collectionId,
    notify_before_value: e.notifyBeforeValue,
    notify_before_unit:  e.notifyBeforeUnit,
    notify_mode:         e.notifyMode ?? 'before',
    remind_at:           e.remindAt,
    notify_at_time:      e.notifyAtTime,
    repeat:              e.repeat,
    status:              e.status,
    important:           e.important,
    background:          e.background ?? false,
    color:               e.color ?? null,
    cross_app_refs:      e.crossAppRefs ?? [],
    archived_at:         e.archivedAt ?? null,
    archive_reason:      e.archiveReason ?? null,
    series_id:           e.seriesId ?? null,
    series_date:         e.seriesDate ?? null,
    remind_occurrence:   e.remindOccurrence ?? null,
    seen_dates:          e.seenDates ?? [],
    travel_mode:         e.travelMode ?? null,
    source:              e.source,
    source_account:      e.sourceAccount ?? null,
    source_uid:          e.sourceUid ?? null,
    source_connection_id: e.sourceConnectionId,
    source_calendar_id:   e.sourceCalendarId,
    source_event_id:      e.sourceEventId,
    source_raw:           e.sourceRaw,
    created_at:          e.createdAt,
    updated_at:          e.updatedAt,
    ...typeColumns(e),
    deleted_at:          null,
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
    links:              r.links               ?? [],
    location:           r.location            ?? null,
    eventType:          r.event_type          ?? 'default',
    collectionId:       r.collection_id       ?? null,
    notifyBeforeValue:  r.notify_before_value ?? null,
    notifyBeforeUnit:   r.notify_before_unit  ?? 'hours',
    notifyMode:         r.notify_mode === 'daysAt' ? 'daysAt' : 'before',
    remindAt:           r.remind_at           ?? null,
    notifyAtTime:       r.notify_at_time      ?? null,
    repeat:             r.repeat              ?? null,
    status:             r.status              ?? 'confirmed',
    important:          r.important           ?? false,
    background:         r.background          ?? false,
    color:              r.color               ?? null,
    crossAppRefs:       r.cross_app_refs      ?? [],
    archivedAt:         r.archived_at         ?? null,
    archiveReason:      r.archive_reason      ?? null,
    seriesId:           r.series_id           ?? null,
    seriesDate:         r.series_date         ?? null,
    remindOccurrence:   r.remind_occurrence   ?? null,
    seenDates:          r.seen_dates          ?? [],
    travelMode:          r.travel_mode          ?? null,
    source:              r.source               ?? null,
    sourceAccount:       r.source_account       ?? null,
    sourceUid:           r.source_uid           ?? null,
    sourceConnectionId:  r.source_connection_id ?? null,
    sourceCalendarId:    r.source_calendar_id   ?? null,
    sourceEventId:       r.source_event_id      ?? null,
    sourceRaw:           r.source_raw           ?? null,
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
    ...typeFromRow(r),
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
    links:         r.links ?? [],
    collection_id: r.collectionId,
    reminder_type: r.reminderType ?? 'default',
    remind_at:     r.remindAt,
    repeat:        r.repeat,
    important:     r.important,
    status:        r.status ?? 'confirmed',
    notify_days_before: r.notifyDaysBefore ?? 1,
    notify_mode:         r.notifyMode ?? 'daysAt',
    notify_before_value: r.notifyBeforeValue ?? null,
    notify_before_unit:  r.notifyBeforeUnit ?? 'hours',
    notify_at_time:     r.notifyAtTime ?? '17:00',
    notify:             r.notify ?? true,
    done_dates:         r.doneDates ?? [],
    series_id:          r.seriesId ?? null,
    series_date:        r.seriesDate ?? null,
    remind_occurrence:  r.remindOccurrence ?? null,
    cross_app_refs: r.crossAppRefs ?? [],
    archived_at:    r.archivedAt ?? null,
    archive_reason: r.archiveReason ?? null,
    created_at:    r.createdAt,
    updated_at:    r.updatedAt,
    deleted_at:    null,
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
    links:        r.links         ?? [],
    collectionId: r.collection_id ?? null,
    reminderType: r.reminder_type ?? 'default',
    remindAt:     r.remind_at     ?? null,
    repeat:       r.repeat        ?? null,
    important:    r.important     ?? false,
    status:       r.status        ?? 'confirmed',
    notifyDaysBefore: r.notify_days_before ?? 1,
    // A row from before migration 056 has no mode: a timed reminder notified at its time.
    notifyMode:        r.notify_mode === 'before' || r.notify_mode === 'atTime' || r.notify_mode === 'daysAt' ? r.notify_mode : (r.time ? 'atTime' : 'daysAt'),
    notifyBeforeValue: r.notify_before_value ?? null,
    notifyBeforeUnit:  r.notify_before_unit ?? 'hours',
    notifyAtTime:     r.notify_at_time     ?? '17:00',
    notify:           r.notify             ?? true,
    doneDates:        r.done_dates         ?? [],
    seriesId:         r.series_id          ?? null,
    seriesDate:       r.series_date        ?? null,
    remindOccurrence: r.remind_occurrence  ?? null,
    crossAppRefs: r.cross_app_refs ?? [],
    archivedAt:    r.archived_at    ?? null,
    archiveReason: r.archive_reason ?? null,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  };
}

// ── CalendarDeadline ────────────────────────────────────────────

export function deadlineToRow(d: CalendarDeadline, userId: string) {
  return {
    id:            d.id,
    user_id:       userId,
    title:         d.title,
    date:          d.date,
    time:          d.time,
    notes:         d.notes,
    links:         d.links ?? [],
    collection_id: d.collectionId,
    deadline_type: d.deadlineType ?? 'default',
    remind_at:     d.remindAt,
    repeat:        d.repeat,
    important:     d.important,
    status:        d.status ?? 'confirmed',
    notify_days_before: d.notifyDaysBefore ?? 1,
    notify_mode:         d.notifyMode ?? 'daysAt',
    notify_before_value: d.notifyBeforeValue ?? null,
    notify_before_unit:  d.notifyBeforeUnit ?? 'hours',
    notify_at_time:     d.notifyAtTime ?? '17:00',
    notify:             d.notify ?? true,
    done_dates:         d.doneDates ?? [],
    series_id:          d.seriesId ?? null,
    series_date:        d.seriesDate ?? null,
    remind_occurrence:  d.remindOccurrence ?? null,
    seen_dates:         d.seenDates ?? [],
    cross_app_refs: d.crossAppRefs ?? [],
    archived_at:    d.archivedAt ?? null,
    archive_reason: d.archiveReason ?? null,
    created_at:    d.createdAt,
    updated_at:    d.updatedAt,
    ...typeColumns(d),
    deleted_at:    null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToDeadline(r: Record<string, any>): CalendarDeadline {
  return {
    id:           r.id,
    title:        r.title,
    date:         r.date,
    time:         r.time          ?? null,
    notes:        r.notes         ?? null,
    links:        r.links         ?? [],
    collectionId: r.collection_id ?? null,
    deadlineType: r.deadline_type ?? 'default',
    remindAt:     r.remind_at     ?? null,
    repeat:       r.repeat        ?? null,
    important:    r.important     ?? false,
    status:       r.status        ?? 'confirmed',
    notifyDaysBefore: r.notify_days_before ?? 1,
    // A row from before migration 056 has no mode: a timed reminder notified at its time.
    notifyMode:        r.notify_mode === 'before' || r.notify_mode === 'atTime' || r.notify_mode === 'daysAt' ? r.notify_mode : (r.time ? 'atTime' : 'daysAt'),
    notifyBeforeValue: r.notify_before_value ?? null,
    notifyBeforeUnit:  r.notify_before_unit ?? 'hours',
    notifyAtTime:     r.notify_at_time     ?? '17:00',
    notify:           r.notify             ?? true,
    doneDates:        r.done_dates         ?? [],
    seriesId:         r.series_id          ?? null,
    seriesDate:       r.series_date        ?? null,
    remindOccurrence: r.remind_occurrence  ?? null,
    seenDates:        r.seen_dates         ?? [],
    crossAppRefs: r.cross_app_refs ?? [],
    archivedAt:    r.archived_at    ?? null,
    archiveReason: r.archive_reason ?? null,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
    ...typeFromRow(r),
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
    deleted_at:    null,
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

export function overviewToRow(o: Overview, userId: string) {
  return {
    id:         o.id,
    user_id:    userId,
    name:       o.name,
    icon:       o.icon ?? null,
    // The query (sources, filters, sort, grouping) as one blob, so a new query option never needs
    // a migration.
    definition: {
      sources: o.sources, collectionId: o.collectionId, status: o.status, when: o.when,
      windowDays: o.windowDays, search: o.search, sort: o.sort, groupBy: o.groupBy,
    },
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    deleted_at: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToOverview(r: Record<string, any>): Overview {
  const d = r.definition ?? {};
  return {
    id:           r.id,
    name:         r.name,
    icon:         r.icon ?? null,
    sources:      d.sources ?? [],
    collectionId: d.collectionId ?? null,
    status:       d.status ?? 'open',
    when:         d.when ?? 'any',
    windowDays:   d.windowDays ?? null,
    search:       d.search ?? '',
    sort:         d.sort ?? 'when-asc',
    groupBy:      d.groupBy ?? 'none',
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  };
}

// ── Converter ───────────────────────────────────────────────────

export function converterToRow(c: CustomConverter, userId: string) {
  return {
    id:         c.id,
    user_id:    userId,
    name:       c.name,
    icon:       c.icon ?? null,
    // Inputs, output and formulas as one blob, so a new converter option never needs a migration.
    definition: { inputs: c.inputs, output: c.output, formula: c.formula, inverse: c.inverse },
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToConverter(r: Record<string, any>): CustomConverter {
  const d = r.definition ?? {};
  return {
    id:        r.id,
    name:      r.name,
    icon:      r.icon ?? null,
    inputs:    d.inputs ?? [],
    output:    d.output ?? { key: 'y', label: '', unit: '' },
    formula:   d.formula ?? '',
    inverse:   d.inverse ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

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
    is_encrypted:      l.isEncrypted      ?? false,
    encrypted_payload: l.encryptedPayload ?? null,
    cross_app_refs:    l.crossAppRefs     ?? [],
    reset_on_task_complete: l.resetOnTaskComplete ?? false,
    collection_id: l.collectionId ?? null,
    created_at:   l.createdAt,
    updated_at:   l.updatedAt,
    deleted_at:   null,
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
    isEncrypted:      r.is_encrypted      ?? false,
    encryptedPayload: r.encrypted_payload ?? null,
    crossAppRefs:     r.cross_app_refs    ?? [],
    resetOnTaskComplete: r.reset_on_task_complete ?? false,
    collectionId: r.collection_id ?? null,
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
    is_encrypted:      i.isEncrypted      ?? false,
    encrypted_payload: i.encryptedPayload ?? null,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    deleted_at: null,
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
    isEncrypted:      r.is_encrypted      ?? false,
    encryptedPayload: r.encrypted_payload ?? null,
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
    deleted_at:     null,
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

// ── Note ────────────────────────────────────────────────────────
// Encrypted notes/entries arrive here already in their stored form — sensitive fields
// blanked, everything in `encrypted_payload` — so the mappers move every column as an opaque
// value with no crypto awareness; see src/services/noteSecrets.ts and migration 024.

export function noteToRow(n: Note, userId: string) {
  return {
    id:              n.id,
    user_id:         userId,
    title:           n.title,
    content:         n.content,
    tag_ids:         n.tagIds ?? [],
    tag_data:        n.tagData ?? {},
    color:           n.color ?? null,
    abstract:        n.abstract ?? null,
    main_tab_updated_at: n.mainTabUpdatedAt ?? null,
    parent_id:       n.parentId ?? null,
    tabs:            n.tabs ?? [],
    main_tab_name:   n.mainTabName ?? 'Main',
    tab_order:       n.tabOrder ?? [],
    template_id:     n.templateId ?? null,
    collection_id:   n.collectionId ?? null,
    is_encrypted:    n.isEncrypted ?? false,
    encrypted_payload: n.encryptedPayload ?? null,
    backdrop:        n.backdrop ?? null,
    last_viewed_at:  n.lastViewedAt ?? null,
    archived_at:     n.archivedAt ?? null,
    created_at:      n.createdAt,
    updated_at:      n.updatedAt,
    deleted_at:      null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToNote(r: Record<string, any>): Note {
  return {
    id:           r.id,
    title:        r.title,
    content:      r.content,
    tagIds:       r.tag_ids  ?? [],
    tagData:      r.tag_data ?? {},
    color:        r.color    ?? null,
    abstract:     r.abstract ?? null,
    mainTabUpdatedAt: r.main_tab_updated_at ?? null,
    parentId:     r.parent_id ?? null,
    tabs:         r.tabs ?? [],
    mainTabName:  r.main_tab_name ?? 'Main',
    tabOrder:     r.tab_order ?? [],
    templateId:   r.template_id ?? null,
    collectionId: r.collection_id ?? null,
    isEncrypted:  r.is_encrypted ?? false,
    encryptedPayload: r.encrypted_payload ?? null,
    backdrop:     r.backdrop ?? null,
    lastViewedAt: r.last_viewed_at ?? null,
    archivedAt:   r.archived_at ?? null,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
    userId:       r.user_id,
  };
}

// ── NoteTag ─────────────────────────────────────────────────────

export function noteTagToRow(t: NoteTag, userId: string) {
  return {
    id:            t.id,
    user_id:       userId,
    name:          t.name,
    description:   t.description ?? null,
    kind:          t.kind,
    parent_tag_id: t.parentTagId ?? null,
    tag_type_id:   t.tagTypeId ?? null,
    color:         t.color ?? null,
    icon:          t.icon ?? null,
    order:         t.order,
    field_schema:  t.fieldSchema ?? [],
    preset_key:    t.presetKey ?? null,
    collection_id: t.collectionId ?? null,
    backdrop:      t.backdrop ?? null,
    ...encryptContentsColumn(t.encryptContents),
    created_at:    t.createdAt,
    updated_at:    t.updatedAt,
    deleted_at:    null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToNoteTag(r: Record<string, any>): NoteTag {
  return {
    id:           r.id,
    name:         r.name,
    description:  r.description ?? undefined,
    kind:         r.kind ?? 'area',
    parentTagId:  r.parent_tag_id ?? null,
    tagTypeId:    r.tag_type_id ?? null,
    color:        r.color ?? null,
    icon:         r.icon ?? null,
    order:        r.order ?? 0,
    fieldSchema:  r.field_schema ?? [],
    presetKey:    r.preset_key ?? undefined,
    collectionId: r.collection_id ?? null,
    backdrop:     r.backdrop ?? null,
    ...(r.encrypt_contents ? { encryptContents: true } : {}),
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
    userId:       r.user_id,
  };
}

// ── StructuredTagEntry ──────────────────────────────────────────

export function structuredTagEntryToRow(e: StructuredTagEntry, userId: string) {
  return {
    id:            e.id,
    user_id:       userId,
    type_key:      e.typeKey,
    tag_id:        e.tagId,
    term:          e.term,
    fields:        e.fields ?? {},
    note_id:       e.noteId,
    collection_id: e.collectionId ?? null,
    is_encrypted:  e.isEncrypted ?? false,
    encrypted_payload: e.encryptedPayload ?? null,
    created_at:    e.createdAt,
    updated_at:    e.updatedAt,
    deleted_at:    null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToStructuredTagEntry(r: Record<string, any>): StructuredTagEntry {
  return {
    id:           r.id,
    typeKey:      r.type_key,
    tagId:        r.tag_id,
    term:         r.term,
    fields:       r.fields ?? {},
    noteId:       r.note_id,
    collectionId: r.collection_id ?? null,
    isEncrypted:      r.is_encrypted ?? false,
    encryptedPayload: r.encrypted_payload ?? null,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  };
}

// ── WatchlistItem ───────────────────────────────────────────────

export function watchlistItemToRow(i: WatchlistItem, userId: string) {
  return {
    id:                     i.id,
    user_id:                userId,
    ticker:                 i.ticker ?? null,
    name:                   i.name,
    asset_class:            i.assetClass ?? null,
    sector:                 i.sector ?? null,
    exchange:               i.exchange ?? null,
    market_cap_value:       i.marketCapValue ?? null,
    status:                 i.status,
    held_at:                i.heldAt ?? null,
    investment_purpose_ids: i.investmentPurposeIds ?? [],
    tag_ids:                i.tagIds ?? [],
    links:                  i.links ?? [],
    notes:                  i.notes ?? null,
    date_added:             i.dateAdded,
    created_at:             i.createdAt,
    updated_at:             i.updatedAt,
    deleted_at:             null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToWatchlistItem(r: Record<string, any>): WatchlistItem {
  return {
    id:                   r.id,
    ticker:               r.ticker ?? null,
    name:                 r.name,
    assetClass:           r.asset_class ?? null,
    sector:               r.sector ?? null,
    exchange:             r.exchange ?? null,
    marketCapValue:       r.market_cap_value ?? null,
    status:               r.status ?? 'watching',
    heldAt:               r.held_at ?? null,
    investmentPurposeIds: r.investment_purpose_ids ?? [],
    tagIds:               r.tag_ids ?? [],
    links:                r.links ?? [],
    notes:                r.notes ?? null,
    dateAdded:            r.date_added,
    createdAt:            r.created_at,
    updatedAt:            r.updated_at,
  };
}

// ── PortfolioTag (no timestamps in the domain model — same as Tag) ────────────

export function portfolioTagToRow(t: PortfolioTag, userId: string) {
  return { id: t.id, user_id: userId, name: t.name, color: t.color ?? null, deleted_at: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToPortfolioTag(r: Record<string, any>): PortfolioTag {
  return { id: r.id, name: r.name, color: r.color ?? null };
}

// ── InvestmentPurpose (no timestamps in the domain model — same as Tag) ───────

export function investmentPurposeToRow(p: InvestmentPurpose, userId: string) {
  return { id: p.id, user_id: userId, name: p.name, color: p.color ?? null, deleted_at: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToInvestmentPurpose(r: Record<string, any>): InvestmentPurpose {
  return { id: r.id, name: r.name, color: r.color ?? null };
}

// ── TrashEntry (Recycling Bin) ─────────────────────────────────────────────────
// `deletedAt` (the domain fact — when the ORIGINAL ENTITY was deleted) maps to
// `original_deleted_at`, not `deleted_at` — the latter is this row's own sync tombstone,
// same convention as every other table, and must not be conflated with the former.

export function trashEntryToRow(t: TrashEntry, userId: string) {
  return {
    id:                  t.id,
    user_id:             userId,
    kind:                t.kind,
    source_app:          t.sourceApp,
    source_section:      t.sourceSection,
    title:               t.title,
    context_line:        t.contextLine,
    snapshot:            t.snapshot,
    original_deleted_at: t.deletedAt,
    deleted_by:          t.deletedBy,
    created_at:          t.deletedAt,
    updated_at:          t.deletedAt,
    deleted_at:          null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToTrashEntry(r: Record<string, any>): TrashEntry {
  return {
    id:            r.id as TrashEntryId,
    kind:          r.kind as TrashableKind,
    sourceApp:     r.source_app,
    sourceSection: r.source_section,
    title:         r.title,
    contextLine:   r.context_line ?? '',
    snapshot:      r.snapshot,
    deletedAt:     r.original_deleted_at,
    deletedBy:     (r.deleted_by ?? { type: 'user' }) as DeletedBy,
  };
}

// ── Picture (the picture library, services/pictures.ts) ─────────
// An encrypted picture arrives already in its stored form (src blank, the data URL in
// encrypted_payload), like an encrypted note.

export function pictureToRow(p: Picture, userId: string) {
  return {
    id:                p.id,
    user_id:           userId,
    src:               p.src,
    is_encrypted:      p.isEncrypted,
    encrypted_payload: p.encryptedPayload ?? null,
    copy_of:           p.copyOf ?? null,
    origin:            p.origin,
    created_at:        p.createdAt,
    updated_at:        p.updatedAt,
    deleted_at:        null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToPicture(r: Record<string, any>): Picture {
  return {
    id:               r.id,
    src:              r.src ?? '',
    isEncrypted:      r.is_encrypted ?? false,
    encryptedPayload: r.encrypted_payload ?? null,
    copyOf:           r.copy_of ?? null,
    origin:           r.origin ?? 'backdrop',
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  };
}

// ── Quick Access pins ───────────────────────────────────────────

export function pinToRow(p: PinnedItem, userId: string) {
  return {
    id:         p.id,
    user_id:    userId,
    type:       p.type,
    entity_id:  p.entityId,
    sort_order: p.order,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToPin(r: Record<string, any>): PinnedItem {
  return {
    id:        r.id,
    type:      r.type,
    entityId:  r.entity_id,
    order:     r.sort_order ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Fitness ─────────────────────────────────────────────────────
// Activities, and custom activity types only: built-in types have fixed ids and are seeded on
// every device (the rule list types follow), so they never sync. Plaintext (decided 2026-09-19).

export function activityToRow(a: Activity, userId: string) {
  return {
    id:                   a.id,
    user_id:              userId,
    type:                 a.type,
    title:                a.title,
    started_at:           a.startedAt,
    timezone:             a.timezone ?? null,
    distance_meters:      a.distanceMeters ?? null,
    moving_time_seconds:  a.movingTimeSeconds ?? null,
    elapsed_time_seconds: a.elapsedTimeSeconds ?? null,
    average_speed_mps:    a.averageSpeedMps ?? null,
    data:                 a.data ?? {},
    notes:                a.notes ?? null,
    purpose_ids:          a.purposeIds ?? [],
    source:               a.source,
    source_id:            a.sourceId ?? null,
    source_raw:           a.sourceRaw ?? null,
    archived_at:          a.archivedAt ?? null,
    created_at:           a.createdAt,
    updated_at:           a.updatedAt,
    deleted_at:           null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToActivity(r: Record<string, any>): Activity {
  return {
    id:                 r.id,
    type:               r.type,
    title:              r.title,
    startedAt:          r.started_at,
    timezone:           r.timezone ?? null,
    distanceMeters:     r.distance_meters ?? null,
    movingTimeSeconds:  r.moving_time_seconds ?? null,
    elapsedTimeSeconds: r.elapsed_time_seconds ?? null,
    averageSpeedMps:    r.average_speed_mps ?? null,
    data:               r.data ?? {},
    notes:              r.notes ?? null,
    purposeIds:         r.purpose_ids ?? [],
    source:             r.source ?? 'manual',
    sourceId:           r.source_id ?? null,
    sourceRaw:          r.source_raw ?? null,
    archivedAt:         r.archived_at ?? null,
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
  };
}

export function activityTypeToRow(t: ActivityType, userId: string) {
  return {
    id:              t.id,
    user_id:         userId,
    name:            t.name,
    icon:            t.icon,
    color:           t.color ?? null,
    tracks_distance: t.tracksDistance,
    field_schema:    t.fieldSchema ?? [],
    archived_at:     t.archivedAt ?? null,
    created_at:      t.createdAt,
    updated_at:      t.updatedAt,
    deleted_at:      null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToActivityType(r: Record<string, any>): ActivityType {
  return {
    id:             r.id,
    name:           r.name,
    icon:           r.icon,
    color:          r.color ?? null,
    tracksDistance: r.tracks_distance ?? true,
    fieldSchema:    r.field_schema ?? [],
    isBuiltIn:      false,
    archivedAt:     r.archived_at ?? null,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
  };
}

// ── Type (item_types, migration 060) ────────────────────────────

export function itemTypeToRow(t: ItemType, userId: string) {
  return {
    id:          t.id,
    user_id:     userId,
    name:        t.name,
    icon:        t.icon ?? null,
    extends_id:  t.extendsId ?? null,
    // Fields, defaults and parts as one blob, so a new kind of default or part never needs a migration.
    definition:  { fields: t.fields, defaults: t.defaults, parts: t.parts },
    archived_at: t.archivedAt ?? null,
    created_at:  t.createdAt,
    updated_at:  t.updatedAt,
    deleted_at:  null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToItemType(r: Record<string, any>): ItemType {
  const d = r.definition ?? {};
  return {
    id:         r.id,
    name:       r.name,
    icon:       r.icon ?? null,
    extendsId:  r.extends_id ?? null,
    fields:     d.fields ?? [],
    defaults:   d.defaults ?? {},
    parts:      d.parts ?? [],
    archivedAt: r.archived_at ?? null,
    createdAt:  r.created_at,
    updatedAt:  r.updated_at,
  };
}

// ── Goal (goals, migration 062) ─────────────────────────────────

export function goalToRow(g: Goal, userId: string) {
  return {
    id:         g.id,
    user_id:    userId,
    title:      g.title,
    target:     g.target,
    by_date:    g.by ?? null,
    measure:    g.measure,
    check_ins:  g.checkIns ?? [],
    status:     g.status,
    status_at:  g.statusAt ?? null,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
    deleted_at: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToGoal(r: Record<string, any>): Goal {
  return {
    id:        r.id,
    title:     r.title,
    target:    r.target,
    by:        r.by_date ?? null,
    measure:   r.measure,
    checkIns:  r.check_ins ?? [],
    status:    r.status ?? 'active',
    statusAt:  r.status_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
