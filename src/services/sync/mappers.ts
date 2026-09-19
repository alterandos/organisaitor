import type {
  Task, Collection, Tag, Purpose,
  CalendarEvent, CalendarReminder, TrackerEntry,
  ScheduleTemplate,
} from '@/types';
import type { List, ListItem, ListType } from '@/types/lists';
import type { Note, NoteTag, StructuredTagEntry } from '@/types/notes';
import type { WatchlistItem, PortfolioTag, InvestmentPurpose } from '@/types/portfolio';

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
    status:              e.status,
    important:           e.important,
    cross_app_refs:      e.crossAppRefs ?? [],
    source:              e.source,
    source_connection_id: e.sourceConnectionId,
    source_calendar_id:   e.sourceCalendarId,
    source_event_id:      e.sourceEventId,
    source_raw:           e.sourceRaw,
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
    notifyBeforeValue:  r.notify_before_value ?? null,
    notifyBeforeUnit:   r.notify_before_unit  ?? 'hours',
    remindAt:           r.remind_at           ?? null,
    notifyAtTime:       r.notify_at_time      ?? null,
    repeat:             r.repeat              ?? null,
    status:             r.status              ?? 'confirmed',
    important:          r.important           ?? false,
    crossAppRefs:       r.cross_app_refs      ?? [],
    source:              r.source               ?? null,
    sourceConnectionId:  r.source_connection_id ?? null,
    sourceCalendarId:    r.source_calendar_id   ?? null,
    sourceEventId:       r.source_event_id      ?? null,
    sourceRaw:           r.source_raw           ?? null,
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
    important:     r.important,
    notify_days_before: r.notifyDaysBefore ?? 1,
    notify_at_time:     r.notifyAtTime ?? '17:00',
    cross_app_refs: r.crossAppRefs ?? [],
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
    important:    r.important     ?? false,
    notifyDaysBefore: r.notify_days_before ?? 1,
    notifyAtTime:     r.notify_at_time     ?? '17:00',
    crossAppRefs: r.cross_app_refs ?? [],
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
    is_encrypted:      l.isEncrypted      ?? false,
    encrypted_payload: l.encryptedPayload ?? null,
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
    isEncrypted:      r.is_encrypted      ?? false,
    encryptedPayload: r.encrypted_payload ?? null,
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
    pinned:          n.pinned,
    abstract:        n.abstract ?? null,
    parent_id:       n.parentId ?? null,
    tabs:            n.tabs ?? [],
    main_tab_name:   n.mainTabName ?? 'Main',
    tab_order:       n.tabOrder ?? [],
    template_id:     n.templateId ?? null,
    collection_id:   n.collectionId ?? null,
    is_encrypted:    n.isEncrypted ?? false,
    encrypted_payload: n.encryptedPayload ?? null,
    last_viewed_at:  n.lastViewedAt ?? null,
    archived_at:     n.archivedAt ?? null,
    created_at:      n.createdAt,
    updated_at:      n.updatedAt,
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
    pinned:       r.pinned   ?? false,
    abstract:     r.abstract ?? null,
    parentId:     r.parent_id ?? null,
    tabs:         r.tabs ?? [],
    mainTabName:  r.main_tab_name ?? 'Main',
    tabOrder:     r.tab_order ?? [],
    templateId:   r.template_id ?? null,
    collectionId: r.collection_id ?? null,
    isEncrypted:  r.is_encrypted ?? false,
    encryptedPayload: r.encrypted_payload ?? null,
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
    created_at:    t.createdAt,
    updated_at:    t.updatedAt,
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
  return { id: t.id, user_id: userId, name: t.name, color: t.color ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToPortfolioTag(r: Record<string, any>): PortfolioTag {
  return { id: r.id, name: r.name, color: r.color ?? null };
}

// ── InvestmentPurpose (no timestamps in the domain model — same as Tag) ───────

export function investmentPurposeToRow(p: InvestmentPurpose, userId: string) {
  return { id: p.id, user_id: userId, name: p.name, color: p.color ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToInvestmentPurpose(r: Record<string, any>): InvestmentPurpose {
  return { id: r.id, name: r.name, color: r.color ?? null };
}
