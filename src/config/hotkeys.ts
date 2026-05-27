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
  // Navigation
  { group: 'Navigation', primary: '1',     secondary: 'Ctrl+1', action: 'Tasks section'     },
  { group: 'Navigation', primary: '2',     secondary: 'Ctrl+2', action: 'Calendar section'  },
  { group: 'Navigation', primary: '3',     secondary: 'Ctrl+3', action: 'Records section'   },
  { group: 'Navigation', primary: '4',     secondary: 'Ctrl+4', action: 'Portfolio section' },

  // Actions
  { group: 'Actions', primary: 'Space', secondary: 'Ctrl+N', action: 'New item (task / event / entry)' },
  { group: 'Actions', primary: 'S',                          action: 'Toggle settings'                  },
  { group: 'Actions', primary: 'Esc',                        action: 'Close panel / modal'              },

  // Portfolio
  { group: 'Portfolio', primary: 'Ctrl+−', action: 'Decrease ticker row size (chart view)' },
  { group: 'Portfolio', primary: 'Ctrl++', action: 'Increase ticker row size (chart view)' },
];

// Ordered list of groups for rendering in the correct sequence.
export const HOTKEY_GROUPS = ['Navigation', 'Actions', 'Portfolio'] as const;
