import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Capacitor } from '@capacitor/core';
import type { ClockFormat } from '@/utils/date';
import { persistStorage } from '@/utils/persistStorage';

// Every other platform defaults to 'system'; Android defaults to 'dark' (see
// docs/android/00-architecture.md §5c). Only affects a brand-new install with no
// prior localStorage — an existing user's persisted theme choice always wins on
// rehydration regardless of this default.
const DEFAULT_THEME: 'light' | 'dark' | 'system' =
  Capacitor.getPlatform() === 'android' ? 'dark' : 'system';

// 'events'/'reminders' = user-created CalendarEvent/CalendarReminder rows (eventType/
// reminderType 'default', and 'events' also covers 'birthday'); 'taskScheduled'/
// 'taskDeadlines' = the shadow rows auto-created from Task.scheduledAt/deadline
// (eventType/reminderType 'task'). Deliberately not the same thing as a Schedule
// template's own per-schedule `active` toggle (CalendarSidePane) — these four are the
// ones named in the request; Schedules keep their existing, separate toggle mechanism.
// 'tentative' is a cross-cutting filter on top of 'events' (a tentative event is still an
// 'events'-layer item — hiding 'events' hides it too; this toggle only lets tentative ones
// specifically be hidden while confirmed events keep showing). See CLAUDE.md "Tentative events".
export type CalendarLayerKey = 'events' | 'reminders' | 'taskScheduled' | 'taskDeadlines' | 'tentative';
export type CalendarLayerVisibility = Record<CalendarLayerKey, boolean>;

interface SettingsState {
  // ── Appearance ───────────────────────────────────────────────────────────────
  theme:    'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;

  clockFormat:    ClockFormat;   // '24h' | '12h' | 'system' (follows OS/browser locale)
  setClockFormat: (f: ClockFormat) => void;

  // Timezone: an IANA zone name, or 'system' (auto-detect from the host machine — the app's
  // original implicit behaviour). Plain setter only — see src/services/timezoneMigration.ts
  // for the re-stamping that must run BEFORE calling this when the effective zone changes.
  timezone:    string;
  setTimezone: (tz: string) => void;

  // Voice dictation language: a BCP-47 code, or 'system' (the browser's language).
  speechLanguage:    string;
  setSpeechLanguage: (lang: string) => void;

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

  // ── Notes ────────────────────────────────────────────────────────────────────
  noteHeadingStyle:    'academic' | 'highlight';
  setNoteHeadingStyle: (s: 'academic' | 'highlight') => void;

  noteEditorZoom:      number;   // multiplier on editor font size; 1.0 = default, range 0.7–2.0
  nudgeNoteEditorZoom: (delta: number) => void;

  chronicleTreeWidth:    number;   // Chronicle notebook-tree panel width in px; range 160–480
  chronicleListWidth:    number;   // Chronicle note-list panel width in px; range 160–480
  setChronicleTreeWidth: (w: number) => void;
  setChronicleListWidth: (w: number) => void;

  // ── Calendar view ─────────────────────────────────────────────────────────────
  shadePastDays:             boolean;
  shadeWeekends:             boolean;
  weekendShadeColor:         string;   // hex colour chosen by user
  strikethroughPastDays:     boolean;
  toggleShadePastDays:       () => void;
  toggleShadeWeekends:       () => void;
  setWeekendShadeColor:      (color: string) => void;
  toggleStrikethroughPastDays: () => void;

  // Calendar layer toggle — which categories of item render on the calendar. Edited via
  // CalendarSidePane's Layers section; this is just the underlying filter state, persisted
  // so a hidden layer stays hidden.
  calendarLayerVisibility: CalendarLayerVisibility;
  toggleCalendarLayer:     (layer: CalendarLayerKey) => void;

  // ── Quick Access pane (Ctrl+G) ────────────────────────────────────────────────
  quickAccessRecentCount:    number;   // how many recent/frequent items to list; range 3–20
  setQuickAccessRecentCount: (n: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme:    DEFAULT_THEME,
      setTheme: (t) => set({ theme: t }),

      clockFormat:    '24h',
      setClockFormat: (f) => set({ clockFormat: f }),

      timezone:    'system',
      setTimezone: (tz) => set({ timezone: tz }),

      speechLanguage:    'system',
      setSpeechLanguage: (lang) => set({ speechLanguage: lang }),

      chartTickerRowZoom:    1.0,
      setChartTickerRowZoom: (z) => set({ chartTickerRowZoom: Math.max(0.5, Math.min(3.0, Math.round(z * 10) / 10)) }),

      noteHeadingStyle:    'academic',
      setNoteHeadingStyle: (s) => set({ noteHeadingStyle: s }),

      noteEditorZoom:      1.0,
      nudgeNoteEditorZoom: (delta) => set((s) => ({
        noteEditorZoom: Math.round(Math.min(2.0, Math.max(0.7, s.noteEditorZoom + delta)) * 10) / 10,
      })),

      chronicleTreeWidth:    220,
      chronicleListWidth:    220,
      setChronicleTreeWidth: (w) => set({ chronicleTreeWidth: Math.round(Math.max(160, Math.min(480, w))) }),
      setChronicleListWidth: (w) => set({ chronicleListWidth: Math.round(Math.max(160, Math.min(480, w))) }),

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

      calendarLayerVisibility: { events: true, reminders: true, taskScheduled: true, taskDeadlines: true, tentative: true },
      toggleCalendarLayer: (layer) => set((s) => ({
        calendarLayerVisibility: { ...s.calendarLayerVisibility, [layer]: !s.calendarLayerVisibility[layer] },
      })),

      quickAccessRecentCount:    8,
      setQuickAccessRecentCount: (n) => set({ quickAccessRecentCount: Math.round(Math.max(3, Math.min(20, n))) }),
    }),
    {
      name: 'todo-settings',
      storage: persistStorage(),
      version: 2,
      // v0 → v1: defensive backfill only — existing (web/desktop) users already have a
      // persisted theme (which always wins over the initial-state default on rehydration
      // regardless of this migration), this just guards against a missing/corrupted value
      // ending up on the new Android-conditional default instead of 'system'.
      // v1 → v2: backfill calendarLayerVisibility.tentative — zustand's persist merge is
      // shallow, so an existing user's already-persisted calendarLayerVisibility object
      // (missing this new key) would otherwise wholesale-replace the in-code default object
      // that has it, leaving `.tentative` undefined (falsy) and hiding tentative events by
      // default for anyone who already had the store persisted before this key existed.
      migrate: (persisted, version) => {
        const state = persisted as SettingsState;
        if (version < 1 && !state.theme) state.theme = 'system';
        if (version < 2 && state.calendarLayerVisibility && state.calendarLayerVisibility.tentative === undefined) {
          state.calendarLayerVisibility = { ...state.calendarLayerVisibility, tentative: true };
        }
        return state;
      },
    }
  )
);
