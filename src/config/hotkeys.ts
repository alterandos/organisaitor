// Single source of truth for keyboard shortcut display data.
// When adding or changing a hotkey:
//   1. Add/edit the entry here.
//   2. Add/edit the handler in src/App.tsx.
// SettingsPane reads this file automatically — no third edit needed.

export interface HotkeyDef {
  primary:    string;
  secondary?: string;
  action:     string;
  group:      string;
}

export const HOTKEYS: HotkeyDef[] = [
  // Navigation — order matches top-to-bottom sidebar position
  { group: 'Navigation', primary: '1',     secondary: 'Ctrl+1', action: 'Tasks section'     },
  { group: 'Navigation', primary: '2',     secondary: 'Ctrl+2', action: 'Calendar section'  },
  { group: 'Navigation', primary: '3',     secondary: 'Ctrl+3', action: 'Records section'   },
  { group: 'Navigation', primary: '4',     secondary: 'Ctrl+4', action: 'Lists section'     },
  { group: 'Navigation', primary: '5',     secondary: 'Ctrl+5', action: 'Notes section'     },
  { group: 'Navigation', primary: '6',     secondary: 'Ctrl+6', action: 'Portfolio section' },
  { group: 'Navigation', primary: '7',     secondary: 'Ctrl+7', action: 'Fitness section'   },

  // Actions
  { group: 'Actions', primary: 'N',     secondary: 'Space',  action: 'New item (task / event / entry) — Ctrl+N also works' },
  { group: 'Actions', primary: 'S',                          action: 'Toggle settings'                  },
  { group: 'Actions', primary: 'Esc',                        action: 'Close panel / modal'              },
  { group: 'Actions', primary: 'E',     secondary: 'Ctrl+E', action: 'Expand Endeavour filter'          },
  { group: 'Actions', primary: '0-9',                        action: 'Select Endeavour by number (while filter is expanded; 0 = All)' },
  { group: 'Actions', primary: 'P',     secondary: 'Ctrl+P', action: 'Expand Purpose filter (Tasks section)' },
  { group: 'Actions', primary: 'M',     secondary: 'Ctrl+M', action: 'Open Manage view (Endeavours / Purposes / Tags)' },

  // Calendar
  { group: 'Calendar', primary: '←/→',        secondary: 'PgUp/PgDn', action: 'Previous/next period (month, week, or day — matches current view)' },
  { group: 'Calendar', primary: 'Tab',        action: 'Cycle Month → Week → Day view' },

  // Notes
  { group: 'Notes', primary: '→',             action: 'Expand selected notebook'          },
  { group: 'Notes', primary: '←',             action: 'Collapse selected notebook'         },
  { group: 'Notes', primary: 'PgUp/PgDn',     action: 'Navigate tree/list column (same as ↑/↓)' },
  { group: 'Notes', primary: 'Ctrl+PgUp/PgDn', action: 'Cycle between this note\'s tabs (editor focused)' },
  { group: 'Notes', primary: 'Ctrl+Tab',      action: 'Move focus between navigation columns and editor' },
  { group: 'Notes', primary: 'Ctrl+L',        action: 'Turn selection into a link, or open "New link" pane if nothing selected' },
  { group: 'Notes', primary: 'Ctrl+click',    action: 'Select a link\'s text instead of opening it (editor focused)' },
  { group: 'Notes', primary: 'Ctrl+−',        action: 'Decrease editor font size'          },
  { group: 'Notes', primary: 'Ctrl+=',        action: 'Increase editor font size'          },
  { group: 'Notes', primary: 'Ctrl+scroll',   action: 'Zoom editor font size'              },
  { group: 'Notes', primary: 'Ctrl+Shift+-',  action: 'Toggle subscript (editor focused)'  },
  { group: 'Notes', primary: 'Ctrl+Shift+=',  action: 'Toggle superscript (editor focused)'},

  // Lists
  { group: 'Lists', primary: 'Ctrl+PgUp/PgDn', action: 'Cycle between the current list\'s tabs' },

  // Portfolio
  { group: 'Portfolio', primary: 'Ctrl+−', action: 'Decrease ticker row size (chart view)' },
  { group: 'Portfolio', primary: 'Ctrl++', action: 'Increase ticker row size (chart view)' },
];

// Ordered list of groups for rendering in the correct sequence.
export const HOTKEY_GROUPS = ['Navigation', 'Actions', 'Calendar', 'Notes', 'Lists', 'Portfolio'] as const;
