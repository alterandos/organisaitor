import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Capacitor } from '@capacitor/core';
import type { ClockFormat } from '@/utils/date';
import { persistStorage } from '@/utils/persistStorage';
import type { NoteBackdrop } from '@/config/noteBackdrops';

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
export type CalendarLayerKey = 'events' | 'reminders' | 'deadlines' | 'taskScheduled' | 'taskDeadlines' | 'tentative';
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
  // Tasks waiting on another task (utils/taskLinks.ts isBlocked): false = greyed out in place,
  // true = moved out of the list into a collapsed "Waiting on other tasks" group.
  hideBlockedTasks:        boolean;
  toggleHideBlockedTasks:  () => void;
  toggleColor:             () => void;
  togglePriorityColor:     () => void;
  toggleAlwaysShowDueDate: () => void;

  // ── Notifications (docs/android/05-notifications.md N9) ─────────────────────────
  // Read by the Android scheduler (services/notifications/androidScheduler.ts); the snooze times
  // also by its "Tomorrow" button. Per device, like every other setting.
  notifyReminders:      boolean;   // Reminders, Deadlines and task deadlines
  notifyEvents:         boolean;   // Events and committed Schedule blocks
  snoozeMorningTime:    string;    // HH:MM — "Tomorrow" snooze
  snoozeEveningTime:    string;    // HH:MM — "This evening" snooze
  quietHours:           { enabled: boolean; start: string; end: string }; // HH:MM; important items still come through
  setNotifyReminders:   (v: boolean) => void;
  setNotifyEvents:      (v: boolean) => void;
  setSnoozeMorningTime: (t: string) => void;
  setSnoozeEveningTime: (t: string) => void;
  setQuietHours:        (patch: Partial<{ enabled: boolean; start: string; end: string }>) => void;

  // ── Notes ────────────────────────────────────────────────────────────────────
  noteHeadingStyle:    'academic' | 'highlight';
  // What fills the room below the end of a note (NoteEditor's NoteBackdrop): null = the plain grey,
  // a preset from config/noteBackdrops.ts, or the user's own picture (a compressed data URL).
  noteBackdrop:        NoteBackdrop;
  setNoteBackdrop:     (b: NoteBackdrop) => void;
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

  // ── Automatic local backup (services/autoBackup.ts) ──────────────────────────
  // Change-volume triggered only (no time-based trigger — confirmed with the user 2026-09-25:
  // a snapshot fires once enough has changed, never just because a clock interval elapsed).
  autoBackupEnabled:         boolean;
  autoBackupChangeThreshold: number;    // weighted change-score that triggers a snapshot
  autoBackupMaxCount:        number;    // how many snapshots the grandfather-thinning keeps
  autoBackupTargetAgesDays:  number[];  // target ages (days) the thinning tries to keep one snapshot near
  setAutoBackupEnabled:         (v: boolean) => void;
  setAutoBackupChangeThreshold: (n: number) => void;
  setAutoBackupMaxCount:        (n: number) => void;
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
      noteBackdrop:        null,
      setNoteBackdrop:     (b) => set({ noteBackdrop: b }),
      setNoteHeadingStyle: (s) => set({ noteHeadingStyle: s }),

      noteEditorZoom:      1.0,
      nudgeNoteEditorZoom: (delta) => set((s) => ({
        noteEditorZoom: Math.round(Math.min(2.0, Math.max(0.7, s.noteEditorZoom + delta)) * 10) / 10,
      })),

      chronicleTreeWidth:    220,
      chronicleListWidth:    220,
      setChronicleTreeWidth: (w) => set({ chronicleTreeWidth: Math.round(Math.max(160, Math.min(480, w))) }),
      setChronicleListWidth: (w) => set({ chronicleListWidth: Math.round(Math.max(160, Math.min(480, w))) }),

      notifyReminders:      true,
      notifyEvents:         true,
      snoozeMorningTime:    '09:00',
      snoozeEveningTime:    '18:00',
      quietHours:           { enabled: false, start: '22:00', end: '07:00' },
      setNotifyReminders:   (v) => set({ notifyReminders: v }),
      setNotifyEvents:      (v) => set({ notifyEvents: v }),
      setSnoozeMorningTime: (t) => set({ snoozeMorningTime: t }),
      setSnoozeEveningTime: (t) => set({ snoozeEveningTime: t }),
      setQuietHours:        (patch) => set((s) => ({ quietHours: { ...s.quietHours, ...patch } })),

      colorEnabled:            true,
      priorityColorEnabled:    true,
      alwaysShowDueDate:       false,
      hideBlockedTasks:        false,
      toggleHideBlockedTasks:  () => set((s) => ({ hideBlockedTasks: !s.hideBlockedTasks })),
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

      calendarLayerVisibility: { events: true, reminders: true, deadlines: true, taskScheduled: true, taskDeadlines: true, tentative: true },
      toggleCalendarLayer: (layer) => set((s) => ({
        calendarLayerVisibility: { ...s.calendarLayerVisibility, [layer]: !s.calendarLayerVisibility[layer] },
      })),

      quickAccessRecentCount:    8,
      setQuickAccessRecentCount: (n) => set({ quickAccessRecentCount: Math.round(Math.max(3, Math.min(20, n))) }),

      autoBackupEnabled:         true,
      autoBackupChangeThreshold: 40,
      autoBackupMaxCount:        4,
      autoBackupTargetAgesDays:  [1, 7, 14, 30],
      setAutoBackupEnabled:         (v) => set({ autoBackupEnabled: v }),
      setAutoBackupChangeThreshold: (n) => set({ autoBackupChangeThreshold: Math.round(Math.max(5, Math.min(500, n))) }),
      setAutoBackupMaxCount:        (n) => set({ autoBackupMaxCount: Math.round(Math.max(1, Math.min(10, n))) }),
    }),
    {
      name: 'todo-settings',
      storage: persistStorage(),
      version: 7,
      // v0 → v1: defensive backfill only — existing (web/desktop) users already have a
      // persisted theme (which always wins over the initial-state default on rehydration
      // regardless of this migration), this just guards against a missing/corrupted value
      // ending up on the new Android-conditional default instead of 'system'.
      // v1 → v2: backfill calendarLayerVisibility.tentative — zustand's persist merge is
      // shallow, so an existing user's already-persisted calendarLayerVisibility object
      // (missing this new key) would otherwise wholesale-replace the in-code default object
      // that has it, leaving `.tentative` undefined (falsy) and hiding tentative events by
      // default for anyone who already had the store persisted before this key existed.
      // v2 → v3: backfill the new autoBackup* fields — all brand-new top-level keys, so
      // technically zustand's shallow persist merge already falls back to the in-code default
      // for any of them absent from an old persisted blob; this step exists anyway, per the
      // standing "always bump + migrate" rule, and as a defensive backstop.
      migrate: (persisted, version) => {
        const state = persisted as SettingsState;
        if (version < 1 && !state.theme) state.theme = 'system';
        if (version < 2 && state.calendarLayerVisibility && state.calendarLayerVisibility.tentative === undefined) {
          state.calendarLayerVisibility = { ...state.calendarLayerVisibility, tentative: true };
        }
        if (version < 3) {
          if (state.autoBackupEnabled === undefined) state.autoBackupEnabled = true;
          if (state.autoBackupChangeThreshold === undefined) state.autoBackupChangeThreshold = 40;
          if (state.autoBackupMaxCount === undefined) state.autoBackupMaxCount = 4;
          if (state.autoBackupTargetAgesDays === undefined) state.autoBackupTargetAgesDays = [1, 7, 14, 30];
        }
        // v3 → v4: same shallow-merge gap v1→v2 fixed for `.tentative` — an existing
        // calendarLayerVisibility object predating the new Deadline kind (2026-09-27) would
        // otherwise leave `.deadlines` undefined (falsy), hiding deadlines by default.
        if (version < 4 && state.calendarLayerVisibility && state.calendarLayerVisibility.deadlines === undefined) {
          state.calendarLayerVisibility = { ...state.calendarLayerVisibility, deadlines: true };
        }
        // v4 → v5: hideBlockedTasks (task links, 2026-10-01) — default greyed in place.
        if (version < 5 && state.hideBlockedTasks === undefined) state.hideBlockedTasks = false;
        // v5 → v6: notification settings (Android notifications, 2026-10-06).
        if (version < 6) {
          if (state.notifyReminders === undefined) state.notifyReminders = true;
          if (state.notifyEvents === undefined) state.notifyEvents = true;
          if (state.snoozeMorningTime === undefined) state.snoozeMorningTime = '09:00';
          if (state.snoozeEveningTime === undefined) state.snoozeEveningTime = '18:00';
          if (state.quietHours === undefined) state.quietHours = { enabled: false, start: '22:00', end: '07:00' };
        }
        // v6 → v7: noteBackdrop (the picture below the end of a note, 2026-10-08).
        if (version < 7 && state.noteBackdrop === undefined) state.noteBackdrop = null;
        return state;
      },
    }
  )
);
