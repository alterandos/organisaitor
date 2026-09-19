// Suite-wide Quick Access pane (Ctrl+G) — provider registry.
//
// Each entity type that can be a "destination" registers a QuickAccessProvider here: how to
// list/search its items, how to re-resolve a live item from a bare id (for rendering a
// recent/frequent entry, whose title may have changed or whose entity may have been deleted
// since it was visited), and how to navigate to it. This is the "small cross-app navigable
// target abstraction" flagged in BACKLOG.md's Quick Access entry — adding a new destination
// type (a Calendar event, a Portfolio ticker, a Fitness activity, …) later is one new
// provider + one new QuickAccessTargetType union member, not a change to QuickAccessPane
// itself.
//
// Providers read store state via getState() rather than hooks, since search/navigate are
// plain functions called from event handlers, not components.

import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useUIStore } from '@/store/uiStore';
import { useRecentItemsStore, type QuickAccessTargetType, type RecentItemEntry } from '@/store/recentItemsStore';
import { getNotebookIcon } from '@/utils/notes';
import { LABELS } from '@/config/labels';
import { noteView } from '@/services/noteSecrets';
import { listView } from '@/services/listSecrets';
import type { List } from '@/types/lists';
import type { Note, NoteId, NoteTagId } from '@/types/notes';
import type { ListId } from '@/types/lists';
import type { TaskId, CollectionId } from '@/types';

export interface QuickAccessItem {
  key:      string;   // `${type}:${entityId}` — stable across search and recent-history renders
  type:     QuickAccessTargetType;
  entityId: string;
  title:    string;
  subtitle: string;
  icon:     string;
}

interface QuickAccessProvider {
  type:      QuickAccessTargetType;
  typeLabel: string;
  list:      () => QuickAccessItem[];
  resolve:   (entityId: string) => QuickAccessItem | null;
  navigate:  (entityId: string) => void;
}

// Encrypted notes resolve through noteView() (their title is blank in the store) and get a 🔒
// in place of the usual 📝 so they're recognisable in results and recents.
const noteItem = (raw: Note): QuickAccessItem => {
  const n = noteView(raw);
  return {
    key: `note:${n.id}`, type: 'note', entityId: n.id,
    title: n.title || 'Untitled note',
    subtitle: n.isEncrypted ? 'Note · Encrypted' : 'Note',
    icon: n.isEncrypted ? '🔒' : '📝',
  };
};

const noteProvider: QuickAccessProvider = {
  type: 'note',
  typeLabel: 'Note',
  list: () => Object.values(useNoteStore.getState().notes)
    .filter((n) => !n.archivedAt)
    .map(noteItem),
  resolve: (id) => {
    const n = useNoteStore.getState().notes[id as NoteId];
    if (!n || n.archivedAt) return null;
    return noteItem(n);
  },
  navigate: (id) => {
    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().openNote(id);
  },
};

const notebookProvider: QuickAccessProvider = {
  type: 'notebook',
  typeLabel: 'Notebook',
  list: () => {
    const { noteTags, notes } = useNoteStore.getState();
    return Object.values(noteTags)
      .filter((t) => t.kind === 'area')
      .map((t) => ({
        key: `notebook:${t.id}`, type: 'notebook', entityId: t.id,
        title: t.name, subtitle: 'Notebook',
        icon: getNotebookIcon(t, noteTags, notes),
      }));
  },
  resolve: (id) => {
    const { noteTags, notes } = useNoteStore.getState();
    const t = noteTags[id as NoteTagId];
    if (!t || t.kind !== 'area') return null;
    return { key: `notebook:${t.id}`, type: 'notebook', entityId: t.id, title: t.name, subtitle: 'Notebook', icon: getNotebookIcon(t, noteTags, notes) };
  },
  navigate: (id) => {
    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().setSelectedNoteTag(id as NoteTagId);
  },
};

function taskSubtitle(collectionId: string | null): string {
  if (!collectionId) return 'Task';
  const c = useTaskStore.getState().collections[collectionId as CollectionId];
  return c ? `Task · ${c.name}` : 'Task';
}

const taskProvider: QuickAccessProvider = {
  type: 'task',
  typeLabel: 'Task',
  list: () => Object.values(useTaskStore.getState().tasks)
    .filter((t) => !t.archived)
    .map((t) => ({ key: `task:${t.id}`, type: 'task', entityId: t.id, title: t.title, subtitle: taskSubtitle(t.collectionId), icon: t.completed ? '☑' : '☐' })),
  resolve: (id) => {
    const t = useTaskStore.getState().tasks[id as TaskId];
    if (!t || t.archived) return null;
    return { key: `task:${t.id}`, type: 'task', entityId: t.id, title: t.title, subtitle: taskSubtitle(t.collectionId), icon: t.completed ? '☑' : '☐' };
  },
  navigate: (id) => {
    useUIStore.getState().setActiveView('tasks');
    useUIStore.getState().openTaskPane(id);
  },
};

// Read through listView(): an encrypted list's name is blank in the store. Like notes, an
// encrypted list gets a 🔒 icon and an "Encrypted" subtitle (its name reads "Encrypted list" while locked).
const listItem = (raw: List): QuickAccessItem => {
  const l = listView(raw);
  const kindLabel = l.kind === 'watchlist' ? 'Watchlist' : 'Reference list';
  return {
    key: `list:${l.id}`, type: 'list', entityId: l.id, title: l.name,
    subtitle: l.isEncrypted ? `${kindLabel} · Encrypted` : kindLabel,
    icon: l.isEncrypted ? '🔒' : (l.icon || '📋'),
  };
};

const listProvider: QuickAccessProvider = {
  type: 'list',
  typeLabel: LABELS.list,
  list: () => Object.values(useListStore.getState().lists).map(listItem),
  resolve: (id) => {
    const l = useListStore.getState().lists[id as ListId];
    return l ? listItem(l) : null;
  },
  navigate: (id) => {
    useUIStore.getState().setActiveView('lists');
    useUIStore.getState().requestListSelection(id);
  },
};

const endeavourProvider: QuickAccessProvider = {
  type: 'endeavour',
  typeLabel: LABELS.collection,
  list: () => Object.values(useTaskStore.getState().collections)
    .filter((c) => (c.kind === 'project' || c.kind === 'list') && !c.archivedAt)
    .map((c) => ({ key: `endeavour:${c.id}`, type: 'endeavour', entityId: c.id, title: c.name, subtitle: `${LABELS.collection} · ${LABELS.collectionKind[c.kind]}`, icon: '🎯' })),
  resolve: (id) => {
    const c = useTaskStore.getState().collections[id as CollectionId];
    if (!c || (c.kind !== 'project' && c.kind !== 'list') || c.archivedAt) return null;
    return { key: `endeavour:${c.id}`, type: 'endeavour', entityId: c.id, title: c.name, subtitle: `${LABELS.collection} · ${LABELS.collectionKind[c.kind]}`, icon: '🎯' };
  },
  navigate: (id) => {
    useUIStore.getState().setActiveView('tasks');
    useUIStore.getState().setActiveCollection(id);
  },
};

const trackerProvider: QuickAccessProvider = {
  type: 'tracker',
  typeLabel: LABELS.tracker,
  list: () => Object.values(useTaskStore.getState().collections)
    .filter((c) => c.kind === 'tracker' && !c.archivedAt)
    .map((c) => ({ key: `tracker:${c.id}`, type: 'tracker', entityId: c.id, title: c.name, subtitle: LABELS.tracker, icon: '📊' })),
  resolve: (id) => {
    const c = useTaskStore.getState().collections[id as CollectionId];
    if (!c || c.kind !== 'tracker' || c.archivedAt) return null;
    return { key: `tracker:${c.id}`, type: 'tracker', entityId: c.id, title: c.name, subtitle: LABELS.tracker, icon: '📊' };
  },
  navigate: (id) => {
    useUIStore.getState().setActiveView('records');
    useUIStore.getState().setActiveTracker(id);
  },
};

const routineProvider: QuickAccessProvider = {
  type: 'routine',
  typeLabel: LABELS.routine,
  list: () => Object.values(useTaskStore.getState().collections)
    .filter((c) => c.kind === 'routine' && !c.archivedAt)
    .map((c) => ({ key: `routine:${c.id}`, type: 'routine', entityId: c.id, title: c.name, subtitle: LABELS.routine, icon: '🔁' })),
  resolve: (id) => {
    const c = useTaskStore.getState().collections[id as CollectionId];
    if (!c || c.kind !== 'routine' || c.archivedAt) return null;
    return { key: `routine:${c.id}`, type: 'routine', entityId: c.id, title: c.name, subtitle: LABELS.routine, icon: '🔁' };
  },
  navigate: (id) => {
    useUIStore.getState().setActiveView('records');
    useUIStore.getState().setActiveRoutine(id);
  },
};

const PROVIDERS: QuickAccessProvider[] = [
  noteProvider, notebookProvider, taskProvider, listProvider, endeavourProvider, trackerProvider, routineProvider,
];

const providerByType: Record<QuickAccessTargetType, QuickAccessProvider> = Object.fromEntries(
  PROVIDERS.map((p) => [p.type, p])
) as Record<QuickAccessTargetType, QuickAccessProvider>;

export function searchQuickAccessItems(query: string, limitPerType = 6): QuickAccessItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: QuickAccessItem[] = [];
  for (const provider of PROVIDERS) {
    let found = 0;
    for (const item of provider.list()) {
      if (found >= limitPerType) break;
      if (item.title.toLowerCase().includes(q)) { results.push(item); found++; }
    }
  }
  return results;
}

// Resolves a list of recent-item entries (already sorted by the caller) into live
// QuickAccessItems, dropping any whose underlying entity no longer exists or is archived.
// Pure (no store writes) so it's safe to call during render — `stale` lists the entries that
// failed to resolve, for the caller to prune via pruneStaleRecentEntries in a useEffect.
export function resolveRecentItems(entries: RecentItemEntry[]): { items: QuickAccessItem[]; stale: RecentItemEntry[] } {
  const items: QuickAccessItem[] = [];
  const stale: RecentItemEntry[] = [];
  for (const entry of entries) {
    const item = providerByType[entry.type]?.resolve(entry.entityId);
    if (item) items.push(item);
    else stale.push(entry);
  }
  return { items, stale };
}

export function pruneStaleRecentEntries(stale: RecentItemEntry[]): void {
  for (const entry of stale) useRecentItemsStore.getState().removeEntity(entry.type, entry.entityId);
}

// Visit tracking itself lives at each destination's own natural "open" point (noteStore's
// touchNote, uiStore's openTaskPane/setSelectedNoteTag/setActiveTracker/setActiveRoutine/
// setActiveCollection, ListsSection's handleSelectList) rather than here — that way "recent"/
// "frequent" reflects everywhere those destinations get opened from (sidebar clicks,
// cross-app links, hotkeys), not just visits made through this pane.
export function navigateToQuickAccessItem(item: QuickAccessItem): void {
  providerByType[item.type]?.navigate(item.entityId);
}
