// Mapper round-trip: rowToX(xToRow(entity, userId)) must equal entity exactly. This is the
// direct executable form of CLAUDE.md's rule "every new column on a persisted type needs a
// mapper update" — a field added to a domain type but forgotten in ONE of the two mapper
// functions shows up here immediately as a mismatch, instead of silently dropping data on
// the next sync round-trip.
import { describe, expect, it } from 'vitest';
import {
  taskToRow, rowToTask,
  collectionToRow, rowToCollection,
  tagToRow, rowToTag,
  purposeToRow, rowToPurpose,
  eventToRow, rowToEvent,
  reminderToRow, rowToReminder,
  entryToRow, rowToEntry,
  scheduleToRow, rowToSchedule,
  listToRow, rowToList,
  listItemToRow, rowToListItem,
  listTypeToRow, rowToListType,
  noteToRow, rowToNote,
  noteTagToRow, rowToNoteTag,
  structuredTagEntryToRow, rowToStructuredTagEntry,
  watchlistItemToRow, rowToWatchlistItem,
  portfolioTagToRow, rowToPortfolioTag,
  investmentPurposeToRow, rowToInvestmentPurpose,
  trashEntryToRow, rowToTrashEntry,
} from '@/services/sync/mappers';
import type {
  Task, Collection, Tag, Purpose, CalendarEvent, CalendarReminder, TrackerEntry, ScheduleTemplate,
  TaskId, CollectionId, TagId, PurposeId, CalendarEventId, CalendarReminderId, TrackerEntryId, ScheduleId,
} from '@/types';
import type { List, ListItem, ListType, ListId, ListItemId, ListTypeId } from '@/types/lists';
import type { Note, NoteTag, StructuredTagEntry, NoteId, NoteTagId, StructuredTagEntryId } from '@/types/notes';
import type { WatchlistItem, PortfolioTag, InvestmentPurpose, WatchlistItemId, PortfolioTagId, InvestmentPurposeId } from '@/types/portfolio';
import type { TrashEntry, TrashEntryId } from '@/types/trash';

const USER = 'user-1';

describe('mapper round-trip (rowToX(xToRow(x)) === x)', () => {
  it('Task', () => {
    const t: Task = {
      id: 't1' as TaskId, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
      title: 'Title', notes: 'notes', links: ['https://a.com'], completed: false, completedAt: null,
      collectionId: 'c1' as CollectionId, tagIds: ['tag1' as TagId], purposeIds: ['p1' as PurposeId],
      priority: 'high', deadline: '2030-02-01', deadlineTime: '09:00', scheduledAt: '2030-01-15', scheduledTime: '10:00',
      calendarEventId: 'e1' as CalendarEventId, calendarReminderId: 'r1' as CalendarReminderId, remindAt: null,
      archived: false, archivedAt: null, archiveReason: null, kind: 'action', timeIntensity: 'medium',
      parentId: null, subtaskIds: ['t2' as TaskId], sortOrder: 3, crossAppRefs: [{ type: 'note', id: 'n1' }],
    };
    expect(rowToTask(taskToRow(t, USER))).toEqual(t);
  });

  it('Collection', () => {
    const c: Collection = {
      id: 'c1' as CollectionId, kind: 'tracker', name: 'Tracker', description: 'desc', color: '#fff',
      purposeIds: ['p1' as PurposeId], tagIds: ['tag1' as TagId], deadline: null, completed: false, completedAt: null,
      fieldSchema: [{ id: 'f1', name: 'Weight', type: 'number' }], routineTasks: [], repeatConfig: null,
      collectionId: null, archivedAt: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(rowToCollection(collectionToRow(c, USER))).toEqual(c);
  });

  it('Tag', () => {
    const t: Tag = { id: 'tag1' as TagId, name: 'Urgent', color: '#f00', notes: 'why' };
    expect(rowToTag(tagToRow(t, USER))).toEqual(t);
  });

  it('Purpose', () => {
    const p: Purpose = {
      id: 'p1' as PurposeId, name: 'Career', description: 'desc', color: '#00f', archivedAt: null,
      createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(rowToPurpose(purposeToRow(p, USER))).toEqual(p);
  });

  it('CalendarEvent', () => {
    const e: CalendarEvent = {
      id: 'e1' as CalendarEventId, title: 'Meeting', date: '2030-01-01', endDate: null, startTime: '09:00', endTime: '10:00',
      notes: 'n', links: [], location: 'Room 1', eventType: 'default', collectionId: null,
      createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
      notifyBeforeValue: 30, notifyBeforeUnit: 'minutes', remindAt: null, notifyAtTime: null,
      repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null },
      status: 'confirmed', important: true, crossAppRefs: [{ type: 'note', id: 'n1' }],
      archivedAt: null, archiveReason: null,
      source: 'google', sourceConnectionId: 'conn1', sourceCalendarId: 'cal1', sourceEventId: 'evt1',
      sourceRaw: { raw: true },
    };
    expect(rowToEvent(eventToRow(e, USER))).toEqual(e);
  });

  it('CalendarReminder', () => {
    const r: CalendarReminder = {
      id: 'r1' as CalendarReminderId, title: 'Pay bill', date: '2030-01-01', time: null, notes: null, links: [],
      collectionId: null, reminderType: 'default', createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
      remindAt: null, repeat: null, important: false, status: 'confirmed', crossAppRefs: [], archivedAt: null, archiveReason: null,
      notifyDaysBefore: 1, notifyAtTime: '17:00',
    };
    expect(rowToReminder(reminderToRow(r, USER))).toEqual(r);
  });

  it('TrackerEntry', () => {
    const e: TrackerEntry = {
      id: 'te1' as TrackerEntryId, trackerId: 'c1' as CollectionId, date: '2030-01-01',
      data: { f1: 70 }, notes: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(rowToEntry(entryToRow(e, USER))).toEqual(e);
  });

  it('ScheduleTemplate', () => {
    const s: ScheduleTemplate = {
      id: 's1' as ScheduleId, name: 'Weekly', color: '#0f0', startDate: null, endDate: null, active: true,
      collectionId: null,
      blocks: [{
        id: 'b1', title: 'Gym', daysOfWeek: [1, 3], startTime: '07:00', endTime: '08:00', location: null,
        interval: 1, intervalAnchor: '2030-01-01', exceptions: [], notes: null, requiresCommitment: false, committedDates: [],
      }],
      createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(rowToSchedule(scheduleToRow(s, USER))).toEqual(s);
  });

  it('List', () => {
    const l: List = {
      id: 'l1' as ListId, name: 'Movies', description: null, typeId: 'lt-movies' as never, kind: 'watchlist',
      color: '#fff', icon: '🎬', fieldSchema: [{ id: 'f1', name: 'Director', type: 'text' }],
      tabs: [{ id: 'tab1', name: 'To watch', color: null, fieldSchema: [] }],
      isEncrypted: false, encryptedPayload: null,
      createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(rowToList(listToRow(l, USER))).toEqual(l);
  });

  it('ListItem', () => {
    const i: ListItem = {
      id: 'li1' as ListItemId, listId: 'l1' as ListId, title: 'Inception', status: 'want', tabId: 'tab1',
      data: { f1: 'Nolan' }, notes: null, links: [], order: 0, isEncrypted: false, encryptedPayload: null,
      createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(rowToListItem(listItemToRow(i, USER))).toEqual(i);
  });

  it('ListType (custom only — built-ins never sync)', () => {
    const t: ListType = {
      id: 'lt-custom1' as ListTypeId, name: 'Recipes', icon: '🍳', color: '#f80', kind: 'reference',
      defaultFields: [{ id: 'f1', name: 'Cuisine', type: 'text' }], isBuiltIn: false,
    };
    expect(rowToListType(listTypeToRow(t, USER))).toEqual(t);
  });

  it('Note', () => {
    const n: Note = {
      id: 'n1' as NoteId, title: 'Notes on X', content: '{"type":"doc"}', tagIds: ['nt1' as NoteTagId],
      tagData: { nt1: { field1: 'v' } }, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
      abstract: 'summary', lastViewedAt: '2030-01-02T00:00:00.000Z', archivedAt: null, color: '#f00', pinned: true,
      userId: USER, parentId: null, tabs: [{ id: 'tab1', name: 'Extra', content: '{}' }], mainTabName: 'Main',
      tabOrder: ['__main__', 'tab1'], templateId: null, collectionId: null, isEncrypted: false, encryptedPayload: null,
    };
    expect(rowToNote(noteToRow(n, USER))).toEqual(n);
  });

  it('NoteTag', () => {
    const t: NoteTag = {
      id: 'nt1' as NoteTagId, name: 'University', description: 'root notebook', kind: 'area', parentTagId: null,
      tagTypeId: null, color: '#00f', icon: '🎓', order: 0, fieldSchema: [], presetKey: undefined,
      collectionId: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', userId: USER,
    };
    expect(rowToNoteTag(noteTagToRow(t, USER))).toEqual(t);
  });

  it('StructuredTagEntry', () => {
    const e: StructuredTagEntry = {
      id: 'se1' as StructuredTagEntryId, typeKey: 'acronym', tagId: 'tag-1', term: 'ASX', fields: { expansion: 'Australian Securities Exchange' },
      noteId: 'n1' as NoteId, collectionId: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
      isEncrypted: false, encryptedPayload: null,
    };
    expect(rowToStructuredTagEntry(structuredTagEntryToRow(e, USER))).toEqual(e);
  });

  it('WatchlistItem', () => {
    const w: WatchlistItem = {
      id: 'w1' as WatchlistItemId, ticker: 'AAPL', name: 'Apple Inc', assetClass: 'equity', sector: 'Technology',
      exchange: 'NasdaqGS', marketCapValue: 3_000_000_000_000, status: 'holding', heldAt: 'Broker X',
      investmentPurposeIds: ['ip-growth' as InvestmentPurposeId], tagIds: ['pt1' as PortfolioTagId], links: ['https://apple.com'],
      notes: 'notes', dateAdded: '2030-01-01', createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(rowToWatchlistItem(watchlistItemToRow(w, USER))).toEqual(w);
  });

  it('PortfolioTag', () => {
    const t: PortfolioTag = { id: 'pt1' as PortfolioTagId, name: 'Long-term', color: '#0f0' };
    expect(rowToPortfolioTag(portfolioTagToRow(t, USER))).toEqual(t);
  });

  it('InvestmentPurpose', () => {
    const p: InvestmentPurpose = { id: 'ip1' as InvestmentPurposeId, name: 'Growth', color: '#f00' };
    expect(rowToInvestmentPurpose(investmentPurposeToRow(p, USER))).toEqual(p);
  });

  it('TrashEntry', () => {
    const t: TrashEntry = {
      id: 'tr1' as TrashEntryId, kind: 'task', sourceApp: 'organizer', sourceSection: 'Tasks',
      title: 'Buy groceries', contextLine: 'Due 2030-02-01', snapshot: { id: 't1', title: 'Buy groceries' },
      deletedAt: '2030-01-01T00:00:00.000Z', deletedBy: { type: 'user' },
    };
    expect(rowToTrashEntry(trashEntryToRow(t, USER))).toEqual(t);
  });
});
