import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  // ── Task view ────────────────────────────────────────────────────────────────
  colorEnabled:            boolean;
  priorityColorEnabled:    boolean;
  alwaysShowDueDate:       boolean;
  toggleColor:             () => void;
  togglePriorityColor:     () => void;
  toggleAlwaysShowDueDate: () => void;

  // ── Calendar view ─────────────────────────────────────────────────────────────
  shadePastDays:             boolean;
  shadeWeekends:             boolean;
  weekendShadeColor:         string;   // hex colour chosen by user
  strikethroughPastDays:     boolean;
  toggleShadePastDays:       () => void;
  toggleShadeWeekends:       () => void;
  setWeekendShadeColor:      (color: string) => void;
  toggleStrikethroughPastDays: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      colorEnabled:            true,
      priorityColorEnabled:    true,
      alwaysShowDueDate:       false,
      toggleColor:             () => set((s) => ({ colorEnabled:         !s.colorEnabled         })),
      togglePriorityColor:     () => set((s) => ({ priorityColorEnabled: !s.priorityColorEnabled })),
      toggleAlwaysShowDueDate: () => set((s) => ({ alwaysShowDueDate:    !s.alwaysShowDueDate    })),

      shadePastDays:             true,
      shadeWeekends:             false,
      weekendShadeColor:         '#e8e0f5',
      strikethroughPastDays:     false,
      toggleShadePastDays:       () => set((s) => ({ shadePastDays:          !s.shadePastDays          })),
      toggleShadeWeekends:       () => set((s) => ({ shadeWeekends:          !s.shadeWeekends          })),
      setWeekendShadeColor:      (color) => set({ weekendShadeColor: color }),
      toggleStrikethroughPastDays: () => set((s) => ({ strikethroughPastDays: !s.strikethroughPastDays })),
    }),
    { name: 'todo-settings' }
  )
);
