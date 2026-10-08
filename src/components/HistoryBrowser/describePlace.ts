import { LABELS } from '@/config/labels';
import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import { useListStore } from '@/store/listStore';
import { useOverviewStore } from '@/store/overviewStore';
import { noteView, isNoteLocked } from '@/services/noteSecrets';
import { listView, itemView, isListLocked } from '@/services/listSecrets';
import { getNoteNotebookPath } from '@/utils/notes';
import { getNoteTabTexts } from '@/utils/noteSearchText';
import { MAIN_TAB_ID } from '@/utils/noteTabs';
import { formatDate } from '@/utils/date';
import type { NavPlace } from '@/store/navHistory';
import type { NoteId, TaskId, CollectionId, ListId } from '@/types';
import type { OverviewId } from '@/types/overview';

// What a history card shows for a place: read live from the stores when the browser opens, so
// a renamed note shows its new name. A place whose item has gone is still shown (going there
// lands in its section), marked removed.

export interface PlaceSummary {
  title:    string;
  path:     string[];        // where it sits: notebooks, an Endeavour, a list
  detail:   string | null;   // the tab, the view, a due date
  preview:  string | null;   // the first words of it
  removed:  boolean;
}

const PREVIEW_CHARS = 220;
const clip = (t: string | null | undefined) => {
  const s = (t ?? '').replace(/\s+/g, ' ').trim();
  return s ? (s.length > PREVIEW_CHARS ? `${s.slice(0, PREVIEW_CHARS)}…` : s) : null;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function calendarPeriod(c: NonNullable<NavPlace['calendar']>): string {
  if (c.mode === 'month') return `${MONTHS[c.month]} ${c.year}`;
  const d = new Date(`${c.date}T00:00:00`);
  if (c.mode === 'day') return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = start.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${left} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function describePlace(p: NavPlace): PlaceSummary {
  const L = LABELS.history;
  const section = LABELS.views[p.view];
  const plain = (title: string, detail: string | null = null): PlaceSummary => ({ title, path: [], detail, preview: null, removed: false });

  switch (p.view) {
    case 'notes': {
      const { notes, noteTags } = useNoteStore.getState();
      if (!p.noteId) {
        const nb = p.notebookId ? noteTags[p.notebookId as never] : null;
        return plain(nb?.name ?? section, nb ? L.notebook : null);
      }
      const raw = notes[p.noteId as NoteId];
      if (!raw) return { ...plain(L.removed), removed: true };
      const note = noteView(raw);
      const locked = isNoteLocked(raw);
      const tabs = locked ? [] : getNoteTabTexts(note);
      const tab = tabs.find((t) => t.id === (p.tabId ?? MAIN_TAB_ID)) ?? tabs[0];
      return {
        title: locked ? L.lockedNote : note.title || L.untitled,
        path: getNoteNotebookPath(note, noteTags),
        detail: note.tabs.length > 0 && tab ? L.tab(tab.name) : null,
        preview: locked ? null : clip(tab?.text),
        removed: false,
      };
    }
    case 'tasks': {
      if (!p.taskId) return plain(section, L.taskList);
      const { tasks, collections } = useTaskStore.getState();
      const task = tasks[p.taskId as TaskId];
      if (!task) return { ...plain(L.removed), removed: true };
      const endeavour = task.collectionId ? collections[task.collectionId as CollectionId]?.name : null;
      const parent = task.parentId ? tasks[task.parentId]?.title : null;
      return {
        title: task.title,
        path: [endeavour, parent].filter((x): x is string => !!x),
        detail: task.completed ? L.done : task.deadline ? L.due(formatDate(task.deadline)) : null,
        preview: clip(task.notes),
        removed: false,
      };
    }
    case 'lists': {
      if (!p.listId) return plain(section);
      const { lists, listItems } = useListStore.getState();
      const raw = lists[p.listId as ListId];
      if (!raw) return { ...plain(L.removed), removed: true };
      const list = listView(raw);
      const locked = isListLocked(raw);
      const items = Object.values(listItems).filter((i) => i.listId === raw.id);
      const titles = locked ? [] : items.slice(0, 6).map((i) => itemView(i).title).filter(Boolean);
      return {
        title: locked ? L.lockedList : `${list.icon ? `${list.icon} ` : ''}${list.name}`,
        path: [],
        detail: L.items(items.length),
        preview: titles.length ? titles.join(' · ') : null,
        removed: false,
      };
    }
    case 'calendar':
      return plain(p.calendar ? calendarPeriod(p.calendar) : section, p.calendar ? L.calendarView[p.calendar.mode] : null);
    case 'records': {
      const id = p.trackerId ?? p.routineId;
      const c = id ? useTaskStore.getState().collections[id as CollectionId] : null;
      return plain(c?.name ?? section, c ? (p.trackerId ? LABELS.tracker : LABELS.routine) : null);
    }
    case 'overview': {
      const sel = p.overview;
      if (!sel) return plain(section);
      const name = sel.kind === 'saved'
        ? useOverviewStore.getState().overviews[sel.id as OverviewId]?.name
        : useTaskStore.getState().collections[sel.id as CollectionId]?.name;
      return plain(name ?? section, sel.kind === 'saved' ? L.savedOverview : LABELS.collection);
    }
    default:
      return plain(section);
  }
}
