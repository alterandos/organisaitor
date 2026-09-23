import { nanoid } from 'nanoid';
import { now, formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import { useTrashStore } from '@/store/trashStore';
import type { TrashEntry, TrashEntryId, TrashableKind, DeletedBy } from '@/types/trash';
import type {
  Task, Collection, Tag, Purpose,
  CalendarEvent, CalendarReminder, ScheduleTemplate, TrackerEntry,
} from '@/types';
import type { List, ListItem, ListType } from '@/types/lists';
import type { Note, NoteTag, StructuredTagEntry } from '@/types/notes';
import type { WatchlistItem, PortfolioTag, InvestmentPurpose } from '@/types/portfolio';
import type { Activity, ActivityType } from '@/types/fitness';

// The write half of the suite-wide Recycling Bin — called from inside each store's own
// delete action (taskStore.deleteTask, noteStore.deleteNote, …), never from a component.
// Deliberately imports NO domain store: every one of those stores imports `moveToTrash`
// from here, so this module must not import back, or every domain store would end up in one
// import cycle through it. (The restore half, services/trash.ts, is the mirror image — it
// imports every domain store to write a snapshot back, and is itself only ever imported by
// RecyclingBinPane, never by a store.) See CLAUDE.md "Recycling Bin".

interface EntityMap {
  task: Task; collection: Collection; tag: Tag; purpose: Purpose;
  calendarEvent: CalendarEvent; calendarReminder: CalendarReminder; schedule: ScheduleTemplate; trackerEntry: TrackerEntry;
  list: List; listItem: ListItem; listType: ListType;
  note: Note; noteTag: NoteTag; structuredTagEntry: StructuredTagEntry;
  watchlistItem: WatchlistItem; portfolioTag: PortfolioTag; investmentPurpose: InvestmentPurpose;
  activity: Activity; activityType: ActivityType;
}

interface ResolvedContext {
  title:         string;
  contextLine:   string;
  sourceApp:     TrashEntry['sourceApp'];
  sourceSection: string;
}

// One resolver per kind. Reads ONLY fields intrinsic to the entity being deleted — never
// another store — so a trash row's context survives even if everything it once referenced
// (a parent Endeavour, a purpose, …) is itself later deleted. For an encrypted note/list/
// item/entry, the plaintext fields are already blanked in the stored record (see
// noteSecrets.ts/listSecrets.ts's blank*Secrets), so the fallback labels below are what a
// still-locked trash row shows until it's restored and the vault decrypts it.
const RESOLVERS: { [K in TrashableKind]: (e: EntityMap[K]) => ResolvedContext } = {
  task: (t) => ({
    title: t.title,
    contextLine: t.deadline ? `Due ${formatDate(t.deadline)}` : t.scheduledAt ? `Scheduled ${formatDate(t.scheduledAt)}` : LABELS.taskKind[t.kind],
    sourceApp: 'organizer', sourceSection: 'Tasks',
  }),
  collection: (c) => ({
    title: c.name,
    contextLine: LABELS.collectionKind[c.kind],
    sourceApp: 'organizer', sourceSection: 'Tasks',
  }),
  tag: (t) => ({ title: t.name, contextLine: 'Tag', sourceApp: 'organizer', sourceSection: 'Tasks' }),
  purpose: (p) => ({ title: p.name, contextLine: 'Purpose', sourceApp: 'organizer', sourceSection: 'Tasks' }),
  calendarEvent: (e) => ({
    title: e.title, contextLine: formatDate(e.date),
    sourceApp: 'organizer', sourceSection: 'Calendar',
  }),
  calendarReminder: (r) => ({
    title: r.title, contextLine: formatDate(r.date),
    sourceApp: 'organizer', sourceSection: 'Calendar',
  }),
  schedule: (s) => ({ title: s.name, contextLine: 'Schedule', sourceApp: 'organizer', sourceSection: 'Calendar' }),
  trackerEntry: (e) => ({ title: formatDate(e.date), contextLine: LABELS.trackerEntry, sourceApp: 'organizer', sourceSection: 'Records' }),
  list: (l) => ({
    title: l.isEncrypted ? '🔒 Encrypted list' : (l.name || 'Untitled'),
    contextLine: l.kind === 'watchlist' ? 'Watchlist' : LABELS.list,
    sourceApp: 'organizer', sourceSection: 'Lists',
  }),
  listItem: (i) => ({
    title: i.isEncrypted ? '🔒 Encrypted item' : (i.title || 'Untitled'),
    contextLine: LABELS.listItem, sourceApp: 'organizer', sourceSection: 'Lists',
  }),
  listType: (t) => ({ title: t.name, contextLine: LABELS.listType, sourceApp: 'organizer', sourceSection: 'Lists' }),
  note: (n) => ({
    title: n.isEncrypted ? '🔒 Encrypted note' : (n.title || 'Untitled'),
    contextLine: '', sourceApp: 'notes', sourceSection: 'Notes',
  }),
  noteTag: (t) => ({
    title: t.name, contextLine: t.kind === 'area' ? 'Notebook' : 'Annotation tag',
    sourceApp: 'notes', sourceSection: 'Notes',
  }),
  structuredTagEntry: (e) => ({
    title: e.isEncrypted ? '🔒 Encrypted entry' : (e.term || 'Untitled'),
    contextLine: e.typeKey, sourceApp: 'notes', sourceSection: 'Notes',
  }),
  watchlistItem: (i) => ({ title: i.name, contextLine: i.ticker ?? '', sourceApp: 'portfolio', sourceSection: 'Portfolio' }),
  portfolioTag: (t) => ({ title: t.name, contextLine: LABELS.portfolioTag, sourceApp: 'portfolio', sourceSection: 'Portfolio' }),
  investmentPurpose: (p) => ({ title: p.name, contextLine: LABELS.investmentPurpose, sourceApp: 'portfolio', sourceSection: 'Portfolio' }),
  activity: (a) => ({ title: a.title, contextLine: formatDate(a.startedAt), sourceApp: 'fitness', sourceSection: 'Fitness' }),
  activityType: (t) => ({ title: t.name, contextLine: 'Activity type', sourceApp: 'fitness', sourceSection: 'Fitness' }),
};

export function moveToTrash<K extends TrashableKind>(
  kind: K,
  entity: EntityMap[K],
  deletedBy: DeletedBy = { type: 'user' },
): void {
  const resolve = RESOLVERS[kind] as (e: EntityMap[K]) => ResolvedContext;
  const ctx = resolve(entity);
  const entry: TrashEntry = {
    id:            nanoid() as TrashEntryId,
    kind,
    sourceApp:     ctx.sourceApp,
    sourceSection: ctx.sourceSection,
    title:         ctx.title,
    contextLine:   ctx.contextLine,
    snapshot:      entity,
    deletedAt:     now(),
    deletedBy,
  };
  useTrashStore.getState().addEntry(entry);
}
