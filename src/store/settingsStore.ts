import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  // ── Portfolio — chart view ────────────────────────────────────────────────────
  chartTickerRowZoom:    number;   // multiplier on the compact row size; 1.0 = default (40% smaller than original)
  setChartTickerRowZoom: (z: number) => void;

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
      chartTickerRowZoom:    1.0,
      setChartTickerRowZoom: (z) => set({ chartTickerRowZoom: Math.max(0.5, Math.min(3.0, Math.round(z * 10) / 10)) }),

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
