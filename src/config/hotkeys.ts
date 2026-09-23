// Single source of truth for keyboard shortcut display data.
// When adding or changing a hotkey:
//   1. Add/edit the entry here.
//   2. Add/edit the handler in src/App.tsx.
// SettingsPane reads this file automatically — no third edit needed.
//
// `id` is required on every entry — it's the stable key hotkeyOverridesStore keys a user's
// rebind against, so it must never be renamed once shipped (renaming silently orphans any
// existing override). `customizable: true` marks the subset actually wired through
// src/utils/hotkeyBinding.ts's effective-binding lookup in App.tsx's central keydown
// handler — this is currently only the hotkeys App.tsx itself dispatches (Navigation +
// Actions). Component-local hotkeys (Calendar/Notes/Lists' own keydown listeners — see
// CLAUDE.md's "Hotkeys rule" for why they live there instead of App.tsx) are NOT yet wired
// to read overrides; rebinding one of those in Settings has no effect. Not an oversight —
// making every component-local listener override-aware would mean touching a keydown
// handler in nearly every interactive component in the app, a much bigger and riskier
// change than "add hotkey customization" scoped for; flagged as a known Phase 2 in
// CLAUDE.md rather than silently attempted here. `protected: true` (Escape only) means the
// rebind UI shows no capture affordance for it at all — it's used as a near-universal
// "close" convention throughout the app (see the Escape-key audit elsewhere in this file's
// sibling CLAUDE.md) and reassigning it would be surprising almost everywhere at once.

import { LABELS } from '@/config/labels';

export interface HotkeyDef {
  id:           string;
  primary:      string;
  secondary?:   string;
  action:       string;
  group:        string;
  customizable?: boolean;
  protected?:    boolean;
}

export const HOTKEYS: HotkeyDef[] = [
  // Navigation — order matches top-to-bottom sidebar position
  { id: 'nav-tasks',     group: 'Navigation', primary: '1', secondary: 'Ctrl+1', action: 'Tasks section',     customizable: true },
  { id: 'nav-calendar',  group: 'Navigation', primary: '2', secondary: 'Ctrl+2', action: 'Calendar section',  customizable: true },
  { id: 'nav-records',   group: 'Navigation', primary: '3', secondary: 'Ctrl+3', action: 'Records section',   customizable: true },
  { id: 'nav-lists',     group: 'Navigation', primary: '4', secondary: 'Ctrl+4', action: 'Lists section',     customizable: true },
  { id: 'nav-notes',     group: 'Navigation', primary: '5', secondary: 'Ctrl+5', action: 'Notes section',     customizable: true },
  { id: 'nav-portfolio', group: 'Navigation', primary: '6', secondary: 'Ctrl+6', action: 'Portfolio section', customizable: true },
  { id: 'nav-fitness',   group: 'Navigation', primary: '7', secondary: 'Ctrl+7', action: 'Fitness section',   customizable: true },

  // Actions
  { id: 'action-new-item',  group: 'Actions', primary: 'N', secondary: 'Space',  action: 'New item (task / event / entry) — Ctrl+N also works', customizable: true },
  { id: 'action-settings',  group: 'Actions', primary: 'S',                      action: 'Toggle settings',                  customizable: true },
  { id: 'action-account',   group: 'Actions', primary: 'A',                      action: 'Toggle account',                   customizable: true },
  { id: 'action-escape',    group: 'Actions', primary: 'Esc',                   action: 'Close panel / modal',              protected: true },
  { id: 'action-endeavour', group: 'Actions', primary: 'E', secondary: 'Ctrl+E', action: `Expand ${LABELS.collection} filter`,          customizable: true },
  { id: 'action-endeavour-select', group: 'Actions', primary: '0-9', action: `Select ${LABELS.collection} by number (while filter is expanded; 0 = All)` },
  { id: 'action-purpose',   group: 'Actions', primary: 'P', secondary: 'Ctrl+P', action: 'Expand Purpose filter (Tasks section)', customizable: true },
  { id: 'action-manage',    group: 'Actions', primary: 'M', secondary: 'Ctrl+M', action: `Open Manage view (${LABELS.collectionPlural} / Purposes / Tags)`, customizable: true },
  { id: 'action-back',      group: 'Actions', primary: 'Alt+Left',  secondary: 'Backspace', action: 'Go back to the previous app section (up to 6 deep)', customizable: true },
  { id: 'action-forward',   group: 'Actions', primary: 'Alt+Right', action: 'Go forward to the next app section (after going back)', customizable: true },
  { id: 'action-quick-access', group: 'Actions', primary: 'Ctrl+G', action: 'Open Quick Access — jump to a note, notebook, task, list, tracker, routine, or ' + LABELS.collection, customizable: true },

  { id: 'action-dictate', group: 'Actions', primary: 'Ctrl+D', action: 'Dictate into the focused text field — press again (or Enter) to finish, Esc cancels', customizable: true },
  { id: 'action-recycling-bin', group: 'Actions', primary: 'Ctrl+Shift+R', action: 'Open/close the Recycling Bin', customizable: true },

  // Item panes — handled locally by useItemActions (src/components/ItemActions/), only while a
  // task / calendar event / calendar reminder pane is open. Not customizable (component-local).
  { id: 'task-archive', group: 'Item panes', primary: 'Ctrl+Shift+A', action: 'Archive the open task / event / reminder (Restore, if it\'s already archived)' },
  { id: 'task-delete',  group: 'Item panes', primary: 'Delete', secondary: 'Ctrl+Shift+D', action: 'Delete the open task / event / reminder — always asks for confirmation (plain Delete is ignored while typing in a field)' },
  { id: 'task-save', group: 'Item panes', primary: 'Ctrl+Enter', action: 'Save and close the open task / event / reminder pane' },
  { id: 'task-archive-confirm', group: 'Item panes', primary: 'Ctrl+Enter', action: 'Confirm the archive dialog (Esc cancels)' },

  // Calendar
  { id: 'calendar-toggle-side-pane', group: 'Calendar', primary: 'O', action: 'Toggle the Calendar side pane (Go to date / Layers / Schedules / Imported calendars)' },
  { id: 'calendar-period',  group: 'Calendar', primary: '←/→', secondary: 'PgUp/PgDn', action: 'Previous/next period (month, week, or day — matches current view)' },
  { id: 'calendar-view',    group: 'Calendar', primary: 'Tab', secondary: 'Shift+Tab', action: 'Cycle Month → Week → Day view (Shift+Tab cycles in reverse)' },

  // Notes
  { id: 'notes-apply-tag',     group: 'Notes', primary: 'Ctrl+1 .. Ctrl+8', action: 'Apply/remove a built-in annotation tag on the selection (editor focused) — a structured type like Acronym opens a create popover instead' },
  { id: 'notes-expand',        group: 'Notes', primary: '→',             action: 'Expand selected notebook'          },
  { id: 'notes-collapse',      group: 'Notes', primary: '←',             action: 'Collapse selected notebook'         },
  { id: 'notes-nav',           group: 'Notes', primary: 'PgUp/PgDn',     action: 'Navigate tree/list column (same as ↑/↓)' },
  { id: 'notes-cycle-tabs',    group: 'Notes', primary: 'Ctrl+Tab / Ctrl+PgDn', secondary: 'Ctrl+Shift+Tab / Ctrl+PgUp', action: 'Cycle between this note\'s tabs, reverse with Shift (editor focused)' },
  { id: 'notes-new-tab',       group: 'Notes', primary: 'Ctrl+T',         action: 'New tab — prompts for a name (editor focused)' },
  { id: 'notes-focus-toggle',  group: 'Notes', primary: 'Ctrl+`',        action: 'Move focus between navigation columns and editor' },
  { id: 'notes-heading-level', group: 'Notes', primary: 'Ctrl+H', action: 'Then press 1–5 to make the paragraph that heading level, or 0 for plain text' },
  { id: 'notes-link',          group: 'Notes', primary: 'Ctrl+L',        action: 'Turn selection into a link, or open "New link" pane if nothing selected' },
  { id: 'notes-create-menu',   group: 'Notes', primary: 'Ctrl+Q',        action: 'Open "Create ▸" menu for the selection (Task/Calendar/List/Tracker) — 1-4 picks, Esc cancels' },
  { id: 'notes-link-select',   group: 'Notes', primary: 'Ctrl+click',    action: 'Select a link\'s text instead of opening it (editor focused)' },
  { id: 'notes-zoom-out',      group: 'Notes', primary: 'Ctrl+−',        action: 'Decrease editor font size'          },
  { id: 'notes-zoom-in',       group: 'Notes', primary: 'Ctrl+=',        action: 'Increase editor font size'          },
  { id: 'notes-zoom-scroll',   group: 'Notes', primary: 'Ctrl+scroll',   action: 'Zoom editor font size'              },
  { id: 'notes-subscript',     group: 'Notes', primary: 'Ctrl+Shift+-',  action: 'Toggle subscript (editor focused)'  },
  { id: 'notes-superscript',   group: 'Notes', primary: 'Ctrl+Shift+=',  action: 'Toggle superscript (editor focused)'},

  // Lists
  { id: 'lists-nav',          group: 'Lists', primary: '↑/↓',    action: 'Navigate between lists (sidebar focused)' },
  { id: 'lists-focus-toggle', group: 'Lists', primary: 'Ctrl+`', action: 'Move focus between the lists sidebar and the list\'s content area' },
  { id: 'lists-cycle-tabs',   group: 'Lists', primary: 'Ctrl+Tab / Ctrl+PgDn', secondary: 'Ctrl+Shift+Tab / Ctrl+PgUp', action: 'Cycle between the current list\'s tabs, reverse with Shift' },
  { id: 'lists-new-tab',      group: 'Lists', primary: 'Ctrl+T',         action: 'New tab — prompts for a name' },

  // Portfolio
  { id: 'portfolio-zoom-out', group: 'Portfolio', primary: 'Ctrl+−', action: 'Decrease ticker row size (chart view)' },
  { id: 'portfolio-zoom-in',  group: 'Portfolio', primary: 'Ctrl++', action: 'Increase ticker row size (chart view)' },
];

// Ordered list of groups for rendering in the correct sequence.
export const HOTKEY_GROUPS = ['Navigation', 'Actions', 'Item panes', 'Calendar', 'Notes', 'Lists', 'Portfolio'] as const;
