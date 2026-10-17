// The app's one back/forward history (Alt+← / Alt+→, Backspace, the Android back button, and
// the Alt+N history browser). Each stop is a *place*: a section plus enough to put you back
// where you were in it. What counts as a stop, decided with the user 2026-10-07:
//   - Notes: every note (a stop per note visited, with its tab and notebook).
//   - Tasks, Lists: one stop per visit to the section, returning to the task / list you were on.
//   - Calendar: one stop per visit, returning to the period and view you were looking at.
//   - Everything else: one stop per visit (Records keeps its tracker or routine).
// Pure: the store (uiStore) captures and restores places; this module only shapes the stacks.

import type { AppView, CalendarViewMode, OverviewSelection } from './uiStore';
import type { NotesViewId } from '@/config/noteViews';

export interface NavPlace {
  view:        AppView;
  at:          string;                 // when it was left (ISO)
  noteId?:     string | null;          // notes: the open note (null: a notebook, no note)
  tabId?:      string | null;          // notes: its tab
  notebookId?: string | null;          // notes: the selected notebook
  notesView?:  NotesViewId;            // notes: the view (Tree, Mosaic…); absent on stops from before views
  focusGroupId?: string | null;        // notes: the group you were in, outside the notebook grouping
  taskId?:     string | null;          // tasks: the task open in the pane
  listId?:     string | null;          // lists
  listTabId?:  string | null;
  calendar?:   { mode: CalendarViewMode; year: number; month: number; date: string };
  trackerId?:  string | null;          // records
  routineId?:  string | null;
  overview?:   OverviewSelection;
}

// Deep enough to browse a working session; the oldest drop off.
export const MAX_NAV_HISTORY = 40;

// Two places are the same stop when they'd put you in the same spot.
export function placeKey(p: NavPlace): string {
  switch (p.view) {
    case 'notes': {
      // A view other than the Tree, or a group outside the notebook grouping, is its own stop
      // (the Mosaic's zoom levels); the Tree's keys are as they always were.
      const extra = `${p.notesView && p.notesView !== 'tree' ? `|v:${p.notesView}` : ''}${p.focusGroupId ? `|g:${p.focusGroupId}` : ''}`;
      return `notes:${p.noteId ?? `nb:${p.notebookId ?? ''}${extra}`}`;
    }
    default:      return p.view;
  }
}

// A normal navigation: where we're leaving goes on the back stack (not twice in a row), and the
// forward stack is cleared, as in a browser.
export function pushPlace(back: NavPlace[], leaving: NavPlace): NavPlace[] {
  if (back[0] && placeKey(back[0]) === placeKey(leaving)) return [leaving, ...back.slice(1)];
  return [leaving, ...back].slice(0, MAX_NAV_HISTORY);
}

// Moving `steps` stops through history at once (negative = back): the target, and both stacks
// afterwards, with where we are now kept in between. Null when there's no such stop.
export function travel(
  back: NavPlace[], forward: NavPlace[], current: NavPlace, steps: number,
): { target: NavPlace; back: NavPlace[]; forward: NavPlace[] } | null {
  if (steps < 0) {
    const k = -steps;
    if (k > back.length) return null;
    return {
      target: back[k - 1],
      back: back.slice(k),
      forward: [...back.slice(0, k - 1).reverse(), current, ...forward].slice(0, MAX_NAV_HISTORY),
    };
  }
  if (steps > 0) {
    if (steps > forward.length) return null;
    return {
      target: forward[steps - 1],
      forward: forward.slice(steps),
      back: [...forward.slice(0, steps - 1).reverse(), current, ...back].slice(0, MAX_NAV_HISTORY),
    };
  }
  return null;
}
