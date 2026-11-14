import type { AppView } from '@/store/uiStore';
import type { CalendarEventId, CalendarReminderId, CalendarDeadlineId, TaskId } from '@/types';
import type { NoteId } from '@/types/notes';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useTrackerStore } from '@/store/trackerStore';
import { signal } from '@/animations/signals';

// THE way to open a linked item (adopted 2026-11-10, docs/agent-tasks/08-linking-consolidation.md
// Task 4): a link in note text, a Linked items row, a "Linked from" pill, an Overview row, a
// notification. It lands on the item, visibly:
//   - a task opens its pane over the section you're in when you work with tasks there (Tasks,
//     Calendar, an Endeavour's home; agreed with the user 2026-11-10: a task opened from a calendar
//     item stays over the calendar); from anywhere else it goes to Tasks;
//   - a calendar item (event, Reminder, Deadline) goes to the calendar at its date, or the date
//     asked for (`occurrence`, one date of a series), and closes a task pane that would cover it
//     (found 2026-11-07: the task pane stayed on top and the click looked like it did nothing);
//   - a note (at a tab), a list, a list item or a tracker entry goes to its section;
//   - switching section closes every item pane, so none is left over the place it went to.
// Opening a pane in the section it belongs to from that section's own views (the calendar grid,
// the task list, an Endeavour home's cards: services/endeavourFiling.ts openFiled) may call the
// pane's open action directly. Returns false if the item no longer exists.
export interface OpenWhere { occurrence?: string; tabId?: string }

const TASK_PANE_HERE: AppView[] = ['tasks', 'calendar', 'endeavours'];

function closeItemPanes() {
  const ui = useUIStore.getState();
  ui.closeTaskPane();
  ui.closeCalendarEventPane();
  ui.closeCalendarReminderPane();
  ui.closeCalendarDeadlinePane();
}

function goTo(view: AppView) {
  const ui = useUIStore.getState();
  if (ui.activeView === view) return;
  closeItemPanes();
  ui.setActiveView(view);
}

export function openItem(type: string | null | undefined, id: string | null | undefined, where: OpenWhere = {}): boolean {
  if (!type || !id) return false;
  // Gone to: it glows where it is once it's drawn (animations/flash.ts, 2026-11-14).
  signal('arrive', id);
  const ui = useUIStore.getState();
  switch (type) {
    case 'task': {
      if (!useTaskStore.getState().tasks[id as TaskId]) return false;
      if (!TASK_PANE_HERE.includes(ui.activeView)) goTo('tasks');
      useUIStore.getState().openTaskPane(id);
      return true;
    }
    case 'event': case 'reminder': case 'deadline': {
      const cal = useCalendarStore.getState();
      const item = type === 'event' ? cal.events[id as CalendarEventId] : type === 'reminder' ? cal.reminders[id as CalendarReminderId] : cal.deadlines[id as CalendarDeadlineId];
      if (!item) return false;
      goTo('calendar');
      const now = useUIStore.getState();
      now.closeTaskPane();
      now.requestCalendarDate(where.occurrence ?? item.date);
      if (type === 'event') now.openCalendarEventPane(id, where.occurrence);
      else if (type === 'reminder') now.openCalendarReminderPane(id, where.occurrence);
      else now.openCalendarDeadlinePane(id, where.occurrence);
      return true;
    }
    case 'note': {
      if (!useNoteStore.getState().notes[id as NoteId]) return false;
      goTo('notes');
      useUIStore.getState().openNote(id, where.tabId);
      return true;
    }
    case 'list': {
      if (!useListStore.getState().lists[id as never]) return false;
      // Lists opens on its remembered list (read once when the section mounts), so point that at
      // this one before switching.
      ui.setListsLastActive(id, null);
      goTo('lists');
      return true;
    }
    case 'listItem': {
      const item = useListStore.getState().listItems[id as never];
      if (!item) return false;
      ui.setListsLastActive(item.listId, item.tabId);
      goTo('lists');
      useUIStore.getState().openEditListItem(id);
      return true;
    }
    case 'trackerEntry': {
      const entry = useTrackerStore.getState().entries[id as never];
      if (!entry) return false;
      goTo('records');
      const now = useUIStore.getState();
      now.setActiveTracker(entry.trackerId);
      now.openEditEntry(id);
      return true;
    }
  }
  return false;
}
