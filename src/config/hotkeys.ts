// Single source of truth for keyboard shortcut display data.
// When adding or changing a hotkey:
//   1. Add/edit the entry here.
//   2. Add/edit the handler in src/App.tsx.
// SettingsPane reads this file automatically — no third edit needed. Every entry names its
// touch path (`touch`) — see the field below.
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
  // How to do this on a phone (decision D13, docs/android/11 §6.2): the touch path, or
  // 'n/a: <why>'. Required, so a new hotkey can't leave Android without a way to do it.
  touch:        string;
}

export const HOTKEYS: HotkeyDef[] = [
  // Navigation — order matches top-to-bottom sidebar position
  { id: 'nav-overview',  group: 'Navigation', primary: '0',                      action: 'Overview section (Ctrl+0 is left to the browser’s zoom reset)', customizable: true, touch: 'More tab → Overview' },
  { id: 'nav-tasks',     group: 'Navigation', primary: '1', secondary: 'Ctrl+1', action: 'Tasks section',     customizable: true, touch: 'Tasks tab (bottom bar)' },
  { id: 'nav-calendar',  group: 'Navigation', primary: '2', secondary: 'Ctrl+2', action: 'Calendar section',  customizable: true, touch: 'Calendar tab (bottom bar)' },
  { id: 'nav-records',   group: 'Navigation', primary: '3', secondary: 'Ctrl+3', action: 'Records section',   customizable: true, touch: 'Records tab (bottom bar)' },
  { id: 'nav-lists',     group: 'Navigation', primary: '4', secondary: 'Ctrl+4', action: 'Lists section',     customizable: true, touch: 'Lists tab (bottom bar)' },
  { id: 'nav-notes',     group: 'Navigation', primary: '5', secondary: 'Ctrl+5', action: 'Notes section',     customizable: true, touch: 'More tab → Notes' },
  { id: 'nav-portfolio', group: 'Navigation', primary: '6', secondary: 'Ctrl+6', action: 'Portfolio section', customizable: true, touch: 'More tab → Portfolio' },
  { id: 'nav-fitness',   group: 'Navigation', primary: '7', secondary: 'Ctrl+7', action: 'Fitness section',   customizable: true, touch: 'More tab → Fitness' },
  // Actions
  { id: 'action-new-item',  group: 'Actions', primary: 'N', secondary: 'Space',  action: 'New item (task / event / entry) — Ctrl+N also works', customizable: true, touch: 'The + button, or the section’s quick-add bar' },
  { id: 'action-settings',  group: 'Actions', primary: 'S',                      action: 'Toggle settings',                  customizable: true, touch: 'More tab → Settings' },
  { id: 'action-account',   group: 'Actions', primary: 'A',                      action: 'Toggle account',                   customizable: true, touch: 'More tab → Account' },
  { id: 'action-escape',    group: 'Actions', primary: 'Esc',                   action: 'Close panel / modal',              protected: true, touch: 'Back button / gesture (closes the newest overlay first)' },
  { id: 'action-endeavour', group: 'Actions', primary: 'E', secondary: 'Ctrl+E', action: `Expand ${LABELS.collection} filter`,          customizable: true, touch: 'Header filter icon (▽), opens a sheet' },
  { id: 'action-endeavour-select', group: 'Actions', primary: '0-9', action: `Select ${LABELS.collection} by number (while filter is expanded; 0 = All)`, touch: 'Tap it in the filter sheet' },
  { id: 'action-purpose',   group: 'Actions', primary: 'P', secondary: 'Ctrl+P', action: 'Expand Purpose filter (Tasks section)', customizable: true, touch: 'Header Purpose icon (◎), opens a sheet' },
  { id: 'action-manage',    group: 'Actions', primary: 'M', secondary: 'Ctrl+M', action: `Open Manage view (${LABELS.collectionPlural} / Purposes / Tags)`, customizable: true, touch: 'More tab → Manage Library' },
  { id: 'action-back',      group: 'Actions', primary: 'Alt+Left',  secondary: 'Backspace', action: 'Go back to the previous app section (up to 6 deep)', customizable: true, touch: 'Back button / gesture' },
  { id: 'action-forward',   group: 'Actions', primary: 'Alt+Right', action: 'Go forward to the next app section (after going back)', customizable: true, touch: 'n/a: Android has no forward gesture; tap the tab or item again' },
  { id: 'action-quick-access', group: 'Actions', primary: 'Ctrl+G', action: 'Open Quick Access — jump to a note, notebook, task, list, tracker, routine, or ' + LABELS.collection, customizable: true, touch: 'Swipe down on the mobile header, or the header 🔍 icon (D6; built in W8)' },
  { id: 'action-dictate', group: 'Actions', primary: 'Ctrl+D', action: 'Dictate into the focused text field — press again (or Enter) to finish, Esc cancels', customizable: true, touch: 'n/a: the keyboard’s own microphone key (01-tasks-app.md §3.1)' },
  { id: 'action-recycling-bin', group: 'Actions', primary: 'Ctrl+Shift+R', action: 'Open/close the Recycling Bin', customizable: true, touch: 'More tab → Account → Recycling Bin' },
  // Item panes — handled locally by useItemActions (src/components/ItemActions/), only while a
  // task / calendar event / calendar reminder pane is open. Not customizable (component-local).
  { id: 'task-archive', group: 'Item panes', primary: 'Ctrl+Shift+A', action: 'Archive the open task / event / reminder (Restore, if it\'s already archived)', touch: 'Archive button in the pane footer; swipe left on a task row → Archive' },
  { id: 'task-delete',  group: 'Item panes', primary: 'Delete', secondary: 'Ctrl+Shift+D', action: 'Delete the open task / event / reminder — always asks for confirmation (plain Delete is ignored while typing in a field)', touch: 'Delete button in the pane footer (asks first); swipe left on a task row → Delete (Undo toast)' },
  { id: 'task-save', group: 'Item panes', primary: 'Ctrl+Enter', action: 'Save and close the open task / event / reminder pane', touch: 'Back closes the pane; fields save as you go' },
  { id: 'task-archive-confirm', group: 'Item panes', primary: 'Ctrl+Enter', action: 'Confirm the archive dialog (Esc cancels)', touch: 'The dialog’s Archive button' },
  // Calendar
  { id: 'calendar-toggle-side-pane', group: 'Calendar', primary: 'O', action: 'Toggle the Calendar side pane (Go to date / Layers / Schedules / Imported calendars)', touch: 'Calendar header ☰ button' },
  { id: 'calendar-today',   group: 'Calendar', primary: 'T', action: 'Go to today (in the current month, week or day view)', touch: 'Calendar header Today button' },
  { id: 'calendar-period',  group: 'Calendar', primary: '←/→', secondary: 'PgUp/PgDn', action: 'Previous/next period (month, week, or day — matches current view)', touch: 'Swipe left/right on the calendar, or the header ‹ › buttons' },
  { id: 'calendar-view',    group: 'Calendar', primary: 'Tab', secondary: 'Shift+Tab', action: 'Cycle Month → Week → Day view (Shift+Tab cycles in reverse)', touch: 'Calendar header Month / Week / Day buttons' },
  // Notes
  { id: 'notes-apply-tag',     group: 'Notes', primary: 'Ctrl+1 .. Ctrl+8', action: 'Apply/remove a built-in annotation tag on the selection (editor focused) — a structured type like Acronym opens a create popover instead', touch: 'n/a for now: Notes on a phone is read-first; editing tools come in W7’s collapsed toolbar (D11)' },
  { id: 'notes-expand',        group: 'Notes', primary: '→',             action: 'Expand selected notebook', touch: 'Tap the ▸ beside the notebook' },
  { id: 'notes-collapse',      group: 'Notes', primary: '←',             action: 'Collapse selected notebook', touch: 'Tap the ▾ beside the notebook' },
  { id: 'notes-nav',           group: 'Notes', primary: 'PgUp/PgDn',     action: 'Navigate tree/list column (same as ↑/↓)', touch: 'n/a: scroll and tap' },
  { id: 'notes-cycle-tabs',    group: 'Notes', primary: 'Ctrl+Tab / Ctrl+PgDn', secondary: 'Ctrl+Shift+Tab / Ctrl+PgUp', action: 'Cycle between this note\'s tabs, reverse with Shift (editor focused)', touch: 'Tap the tab' },
  { id: 'notes-new-tab',       group: 'Notes', primary: 'Ctrl+T',         action: 'New tab — prompts for a name (editor focused)', touch: 'The + at the end of the tab bar' },
  { id: 'notes-focus-toggle',  group: 'Notes', primary: 'Ctrl+`',        action: 'Move focus between navigation columns and editor', touch: 'n/a: no keyboard focus on touch; tap where you want to be' },
  { id: 'notes-heading-level', group: 'Notes', primary: 'Ctrl+H', action: 'Then press 1–5 to make the paragraph that heading level, 0 for plain text (clears all formatting), or H for the Title of the tab', touch: 'n/a for now: W7’s collapsed editing toolbar (D11)' },
  { id: 'notes-link',          group: 'Notes', primary: 'Ctrl+L',        action: 'Turn selection into a link, or open "New link" pane if nothing selected', touch: 'n/a for now: W7’s collapsed editing toolbar (D11)' },
  { id: 'notes-create-menu',   group: 'Notes', primary: 'Ctrl+Q',        action: 'Open "Create ▸" menu for the selection (Task/Calendar/List/Tracker) — 1-4 picks, Esc cancels', touch: 'n/a for now: W7’s collapsed editing toolbar (D11)' },
  { id: 'notes-link-select',   group: 'Notes', primary: 'Ctrl+click',    action: 'Select a link\'s text instead of opening it (editor focused)', touch: 'Long-press the link text (system text selection)' },
  { id: 'notes-zoom-out',      group: 'Notes', primary: 'Ctrl+−',        action: 'Decrease editor font size', touch: 'n/a: pinch-to-zoom or nothing, decided in the Notes spec (gap F7)' },
  { id: 'notes-zoom-in',       group: 'Notes', primary: 'Ctrl+=',        action: 'Increase editor font size', touch: 'n/a: pinch-to-zoom or nothing, decided in the Notes spec (gap F7)' },
  { id: 'notes-zoom-scroll',   group: 'Notes', primary: 'Ctrl+scroll',   action: 'Zoom editor font size', touch: 'n/a: no scroll wheel; see gap F7' },
  { id: 'notes-subscript',     group: 'Notes', primary: 'Ctrl+Shift+-',  action: 'Toggle subscript (editor focused)', touch: 'n/a for now: W7’s collapsed editing toolbar (D11)' },
  { id: 'notes-superscript',   group: 'Notes', primary: 'Ctrl+Shift+=',  action: 'Toggle superscript (editor focused)', touch: 'n/a for now: W7’s collapsed editing toolbar (D11)' },
  // Lists
  { id: 'lists-nav',          group: 'Lists', primary: '↑/↓',    action: 'Navigate between lists (sidebar focused)', touch: 'Tap a list in the sidebar' },
  { id: 'lists-focus-toggle', group: 'Lists', primary: 'Ctrl+`', action: 'Move focus between the lists sidebar and the list\'s content area', touch: 'n/a: no keyboard focus on touch; tap where you want to be' },
  { id: 'lists-cycle-tabs',   group: 'Lists', primary: 'Ctrl+Tab / Ctrl+PgDn', secondary: 'Ctrl+Shift+Tab / Ctrl+PgUp', action: 'Cycle between the current list\'s tabs, reverse with Shift', touch: 'Tap the tab' },
  { id: 'lists-new-tab',      group: 'Lists', primary: 'Ctrl+T',         action: 'New tab — prompts for a name', touch: 'The + at the end of the tab bar; a list’s first tab: long-press the list → Edit list → Tabs' },
  // Portfolio
  { id: 'portfolio-zoom-out', group: 'Portfolio', primary: 'Ctrl+−', action: 'Decrease ticker row size (chart view)', touch: 'n/a: Portfolio’s Android layout is deferred to the add-on phase (D12)' },
  { id: 'portfolio-zoom-in',  group: 'Portfolio', primary: 'Ctrl++', action: 'Increase ticker row size (chart view)', touch: 'n/a: Portfolio’s Android layout is deferred to the add-on phase (D12)' },
];

// Ordered list of groups for rendering in the correct sequence.
export const HOTKEY_GROUPS = ['Navigation', 'Actions', 'Item panes', 'Calendar', 'Notes', 'Lists', 'Portfolio'] as const;
