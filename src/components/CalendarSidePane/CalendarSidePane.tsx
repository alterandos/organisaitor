import { useState, useEffect, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { useCalendarStore } from '@/store/calendarStore';
import { ArchiveIcon } from '@/components/ItemActions/icons';
import { useUIStore, type CalendarViewMode } from '@/store/uiStore';
import { useSettingsStore, type CalendarLayerKey } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { usePlatform } from '@/hooks/usePlatform';
import { formatDate, todayIso } from '@/utils/date';
import { countTemplateConflicts } from '@/utils/scheduleOccurrences';
import { ScheduleWeekGridPreview, type PreviewEntry } from '@/components/ScheduleWeekGridPreview/ScheduleWeekGridPreview';
import {
  getGoogleCalendarConnectUrl, fetchGoogleCalendarConnections,
  setGoogleCalendarEnabled, disconnectGoogleCalendar, syncGoogleCalendars,
} from '@/services/googleCalendar';
import type { ScheduleId, ScheduleTemplate, CalendarConnection } from '@/types';
import styles from './CalendarSidePane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { alertDialog, confirmDialog, confirmDelete } from '@/components/ConfirmDialog/dialogs';

// Which calendar item categories render, filtered via CalendarEvent.eventType/status and
// CalendarReminder.reminderType. See settingsStore.calendarLayerVisibility for the actual
// filter state this reads/writes — this list is just today's presentation of it.
const LAYERS: { key: CalendarLayerKey; label: string }[] = [
  { key: 'events',        label: 'Events'           },
  { key: 'reminders',     label: 'Reminders'        },
  { key: 'taskScheduled', label: 'Task scheduled'   },
  { key: 'taskDeadlines', label: 'Task deadlines'   },
  { key: 'tentative',     label: 'Tentative events' },
];

function templatesToPreviewEntries(templates: ScheduleTemplate[]): PreviewEntry[] {
  return templates.flatMap((template) =>
    template.blocks.map((block) => ({
      key: `${template.id}:${block.id}`,
      title: block.title,
      daysOfWeek: block.daysOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      color: template.color,
      groupLabel: template.name,
    }))
  );
}

// ── MiniDatePicker — the "Go to date" widget ────────────────────────────────
// A small local helper, deliberately not imported from CalendarView.tsx (which has its own
// very similar buildCalendarDays/toDateStr) — this is genuinely one real algorithm, but
// small enough, and specific enough to this one visual widget, that duplicating it here
// beat a cross-file refactor for a feature update that wasn't asked to touch CalendarView's
// existing month-grid logic.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildMonthGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(last);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const days: { date: Date; inMonth: boolean }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push({ date: new Date(cur), inMonth: cur.getMonth() === month });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

interface MiniDatePickerProps {
  // Which year/month the picker starts browsing at — re-syncs whenever this changes while
  // the pane is open (see the effect below), so it always reflects wherever the main
  // calendar currently is when you open it, rather than always resetting to today.
  anchorDate: string;
  onSelect: (date: string) => void;
}

// A compact visual date picker built specifically to make large jumps easy — the year row's
// «/» step by 10, ‹/› by 1, and the year itself is a plain number input you can type directly
// into (e.g. to jump to 2040 in one edit) — rather than relying on a native <input type="date">,
// whose browser-native dropdown calendar has no fast way to move more than one month at a time.
function MiniDatePicker({ anchorDate, onSelect }: MiniDatePickerProps) {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  const [viewYear, setViewYear]   = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());
  // Re-syncs viewYear/viewMonth whenever anchorDate changes (e.g. the main calendar was
  // navigated via its own prev/next arrows while this pane stayed open) — adjusted during
  // render itself (React's documented pattern for "reset state when a prop changes")
  // rather than a useEffect, which would need an extra render pass to take effect and
  // would flag as an avoidable set-state-in-effect.
  const [lastAnchor, setLastAnchor] = useState(anchorDate);
  if (anchorDate !== lastAnchor) {
    setLastAnchor(anchorDate);
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
  }

  const days = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = todayIso();

  // Every navigation control here (year/month arrows, the month dropdown, a typed year on
  // Enter/blur) moves the calendar itself immediately, not just this widget's own view — the
  // day-of-month carried over is the calendar's current one, clamped to the new month's length
  // (month view always anchors on the 1st, so it is unaffected). Picking a day in the grid
  // still jumps to that exact date.
  const goTo = (year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
    const day = Math.min(anchor.getDate(), new Date(year, month + 1, 0).getDate());
    onSelect(`${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };
  const shiftYear = (delta: number) => goTo(viewYear + delta, viewMonth);
  // Stepping past December/January rolls the year over, so ‹/› can be held to scroll through time.
  const shiftMonth = (delta: number) => {
    const idx = viewYear * 12 + viewMonth + delta;
    goTo(Math.floor(idx / 12), ((idx % 12) + 12) % 12);
  };
  const commitTypedYear = () => {
    if (Number.isInteger(viewYear) && viewYear >= 1 && viewYear <= 9999 && viewYear !== anchor.getFullYear()) goTo(viewYear, viewMonth);
  };

  return (
    <div className={styles.picker}>
      <div className={styles.pickerYearRow}>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftYear(-10)} title="10 years back">«</button>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftYear(-1)} title="1 year back">‹</button>
        <input
          type="number"
          className={styles.pickerYearInput}
          value={viewYear}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) setViewYear(v);
          }}
          onBlur={commitTypedYear}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          aria-label="Year"
        />
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftYear(1)} title="1 year forward">›</button>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftYear(10)} title="10 years forward">»</button>
      </div>

      <div className={styles.pickerMonthRow}>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftMonth(-1)} title="Previous month" aria-label="Previous month">‹</button>
        <select
          className={styles.pickerMonthSelect}
          value={viewMonth}
          onChange={(e) => goTo(viewYear, Number(e.target.value))}
          aria-label="Month"
        >
          {MONTH_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}
        </select>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftMonth(1)} title="Next month" aria-label="Next month">›</button>
      </div>

      <div className={styles.pickerDayLabels}>
        {DAY_LETTERS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className={styles.pickerGrid}>
        {days.map(({ date, inMonth }, i) => {
          const ds = toDateStr(date);
          const isToday  = ds === today;
          const isAnchor = ds === anchorDate;
          return (
            <button
              key={i}
              type="button"
              className={[
                styles.pickerDay,
                !inMonth ? styles.pickerDayOther : '',
                isToday ? styles.pickerDayToday : '',
                isAnchor ? styles.pickerDaySelected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(ds)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  // All three only meaningful on desktop (the "Go to date" section) — Android's own header
  // still has its own date navigation, so this pane doesn't duplicate it there. See
  // jumpToDate in CalendarView.tsx: it sets both year/month AND selectedDate together
  // (the same pair every other navigation action there already keeps in sync), so this
  // one callback works correctly regardless of which of month/week/day is active.
  viewMode: CalendarViewMode;
  anchorDate: string;   // seeds/re-syncs MiniDatePicker's browsed year/month — see that component
  onJumpToDate: (date: string) => void;
}

// Calendar-section side pane — Go-to-date, Layers (which item categories render), Schedules
// (recurring weekly timetables you can switch on/off), and Imported calendars (Google sync)
// in one place. Two structurally different renderings depending on platform, not just a CSS
// media query:
//   - Desktop: an inline panel, a real flex child laid out to the LEFT of the calendar grid
//     within CalendarView's own .desktopView (see that component) — occupies genuine layout
//     space rather than overlaying anything, the same way Notes' ChronicleView tree/list
//     columns sit to the left of its editor. Deliberately does NOT cover the app's own
//     left-hand NavSidebar (the app switcher) — that's the whole point of moving it out of
//     the old App.tsx-level fixed-overlay rendering. Triggered by the app-wide header
//     hamburger (App.tsx), repurposed for Calendar specifically (see that file).
//   - Android: a full-screen sheet (position:fixed, matching every other pane in this app —
//     see the `:global(.platform-android) .pane` override in the CSS module), since an
//     inline ~300px-wide column has no room at phone width. Triggered by a small header
//     button local to CalendarView (the app-wide hamburger is hidden entirely on Android).
// Extension point: a future "imported calendars" layer (Microsoft — see BACKLOG.md
// "External calendar sync") is expected to join Google as a second entry within the
// existing "Imported calendars" section, not a new section of its own.
export function CalendarSidePane({ viewMode, anchorDate, onJumpToDate }: Props) {
  const { isAndroid } = usePlatform();
  const open  = useUIStore((s) => s.schedulesOpen);
  const close = useUIStore((s) => s.closeSchedules);
  const showAddSchedule = useUIStore((s) => s.showAddSchedule);
  const openEditSchedule = useUIStore((s) => s.openEditSchedule);
  const openEventPane    = useUIStore((s) => s.openCalendarEventPane);
  const openReminderPane = useUIStore((s) => s.openCalendarReminderPane);
  const eventsRecord     = useCalendarStore((s) => s.events);
  const remindersRecord  = useCalendarStore((s) => s.reminders);
  const [archivedOpen, setArchivedOpen] = useState(false);

  // A task's shadow event/reminder is archived with the task (and shown in the task list's own
  // Archived group), so only free-standing calendar items are listed here.
  const archivedItems = useMemo(() => {
    const events = Object.values(eventsRecord)
      .filter((e) => e.archivedAt && e.eventType !== 'task')
      .map((e) => ({ kind: 'event' as const, id: e.id as string, title: e.title, date: e.date }));
    const reminders = Object.values(remindersRecord)
      .filter((r) => r.archivedAt && r.reminderType !== 'task')
      .map((r) => ({ kind: 'reminder' as const, id: r.id as string, title: r.title, date: r.date }));
    return [...events, ...reminders].sort((a, b) => b.date.localeCompare(a.date));
  }, [eventsRecord, remindersRecord]);

  const schedulesRecord = useScheduleStore((s) => s.schedules);
  const toggleActive    = useScheduleStore((s) => s.toggleScheduleActive);
  const deleteSchedule  = useScheduleStore((s) => s.deleteSchedule);
  const clockFormat     = useSettingsStore((s) => s.clockFormat);
  const layerVisibility = useSettingsStore((s) => s.calendarLayerVisibility);
  const toggleLayer     = useSettingsStore((s) => s.toggleCalendarLayer);

  const [previewIds, setPreviewIds] = useState<Set<ScheduleId>>(new Set());
  const jumpLabel =
    viewMode === 'month' ? 'Go to month' :
    viewMode === 'week'  ? 'Go to week'  : 'Go to day';
  const jumpHint =
    viewMode === 'month' ? "Use the arrows to move the calendar, or click a date to jump to its month." :
    viewMode === 'week'  ? "Use the arrows to move the calendar, or click a date to jump to its week." :
                            'Use the arrows to move the calendar, or click a date to jump straight to it.';

  // ── Imported calendars (Google — see CLAUDE.md "External calendar sync") ──
  const authUser = useAuthStore((s) => s.user);
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const reloadConnections = () => {
    if (!authUser) { setConnections([]); return; }
    setConnectionsLoading(true);
    fetchGoogleCalendarConnections().then(setConnections).finally(() => setConnectionsLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)fetches the connections from the network whenever the pane opens or the account changes
    if (open) reloadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, authUser]);

  const handleConnect = async () => {
    try {
      const url = await getGoogleCalendarConnectUrl();
      if (url) window.location.href = url;
    } catch (e) {
      await alertDialog(e instanceof Error ? e.message : 'Could not start the Google Calendar connection.');
    }
  };

  const handleToggleCalendar = async (connectionId: string, calendarId: string, enabled: boolean) => {
    setConnections((prev) => prev.map((c) =>
      c.id === connectionId
        ? { ...c, calendars: c.calendars.map((cal) => (cal.id === calendarId ? { ...cal, enabled } : cal)) }
        : c
    ));
    try {
      await setGoogleCalendarEnabled(connectionId, calendarId, enabled);
    } catch {
      reloadConnections(); // revert the optimistic update on failure
    }
  };

  const handleDisconnect = async (connectionId: string, accountEmail: string) => {
    const ok = await confirmDialog({
      title: `Disconnect ${accountEmail}?`,
      message: 'Events already imported from it will stay.',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    await disconnectGoogleCalendar(connectionId);
    reloadConnections();
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const { created, failed } = await syncGoogleCalendars();
      setSyncStatus(
        failed > 0
          ? `${created} new event${created !== 1 ? 's' : ''} imported, ${failed} calendar${failed !== 1 ? 's' : ''} failed to sync`
          : `${created} new event${created !== 1 ? 's' : ''} imported`
      );
    } catch {
      setSyncStatus('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  useEscapeClose(close, open);

  const schedules = useMemo(
    () => Object.values(schedulesRecord).sort((a, b) => a.name.localeCompare(b.name)),
    [schedulesRecord]
  );

  const togglePreview = (id: ScheduleId) =>
    setPreviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const previewTemplates = schedules.filter((s) => previewIds.has(s.id));
  const previewEntries = useMemo(() => templatesToPreviewEntries(previewTemplates), [previewTemplates]);

  if (!open) return null;

  return (
    <>
      {/* Only Android's full-screen sheet needs a dimming backdrop — the desktop inline
          panel isn't covering anything, so there's nothing to dim. */}
      {isAndroid && <div className={styles.overlay} onClick={close} />}
      <aside className={styles.pane} role="complementary" aria-label="Calendar layers and schedules">
        <div className={styles.header}>
          <span className={styles.heading}>Calendar</span>
          <button className={styles.closeBtn} onClick={close} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          {/* ── Go to date ── */}
          <div className={styles.section}>
            <span className={styles.label}>{jumpLabel}</span>
            <MiniDatePicker anchorDate={anchorDate} onSelect={onJumpToDate} />
            <p className={styles.hint}>{jumpHint}</p>
          </div>

          {/* ── Layers ── */}
          <div className={styles.section}>
            <span className={styles.label}>Layers</span>
            <div className={styles.layerList}>
              {LAYERS.map(({ key, label }) => {
                const active = layerVisibility[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.layerItem} ${active ? styles.layerItemActive : ''}`}
                    onClick={() => toggleLayer(key)}
                    role="option"
                    aria-selected={active}
                  >
                    <span className={`${styles.checkbox} ${active ? styles.checkboxChecked : ''}`}>
                      {active && '✓'}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Schedules ── */}
          <div className={styles.section}>
            <span className={styles.label}>Schedules</span>
            <p className={styles.intro}>
              A recurring weekly timetable (a class schedule, a gym timetable) that can be switched on and off as a
              layer over your calendar. Check "Preview" on a few below to compare them before turning any on.
            </p>

            {schedules.length === 0 ? (
              <p className={styles.empty}>No schedules yet.</p>
            ) : (
              <div className={styles.list}>
                {schedules.map((schedule) => {
                  const conflicts = countTemplateConflicts(schedule, schedules.filter((s) => s.active));
                  return (
                    <div key={schedule.id} className={styles.row}>
                      <label className={styles.activeToggle} title="Show on the real calendar">
                        <input type="checkbox" checked={schedule.active} onChange={() => toggleActive(schedule.id)} />
                      </label>
                      <span className={styles.swatch} style={{ background: schedule.color ?? 'var(--color-border)' }} />
                      <div className={styles.rowMain}>
                        <span className={styles.rowName}>{schedule.name}</span>
                        <span className={styles.rowMeta}>
                          {schedule.blocks.length} block{schedule.blocks.length !== 1 ? 's' : ''}
                          {schedule.startDate && ` · from ${formatDate(schedule.startDate)}`}
                          {schedule.endDate && ` to ${formatDate(schedule.endDate)}`}
                          {schedule.active && conflicts > 0 && (
                            <span className={styles.conflictBadge}> · ⚠ {conflicts} potential conflict{conflicts !== 1 ? 's' : ''}</span>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`${styles.previewToggle} ${previewIds.has(schedule.id) ? styles.previewToggleActive : ''}`}
                        onClick={() => togglePreview(schedule.id)}
                        title="Preview this schedule below"
                      >
                        👁
                      </button>
                      <button type="button" className={styles.rowActionBtn} onClick={() => openEditSchedule(schedule)} title="Edit">✏️</button>
                      <button
                        type="button"
                        className={`${styles.rowActionBtn} ${styles.rowActionBtnDelete}`}
                        onClick={async () => { if (await confirmDelete('schedule', schedule.name)) deleteSchedule(schedule.id); }}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button className={styles.addBtn} onClick={showAddSchedule}>+ Add Schedule</button>

            {previewTemplates.length > 0 && (
              <div className={styles.previewSection}>
                <div className={styles.previewHeader}>
                  <span className={styles.label}>Preview</span>
                  <span className={styles.schemaMeta}>{previewTemplates.map((t) => t.name).join(' + ')}</span>
                </div>
                <ScheduleWeekGridPreview entries={previewEntries} />
                <p className={styles.hint}>
                  Side-by-side blocks mean overlapping times — the same visual you'll see on the real calendar once both are active.
                  Times shown as {clockFormat === '24h' ? '24-hour' : clockFormat === '12h' ? '12-hour' : 'system'} format.
                </p>
              </div>
            )}
          </div>

          {/* ── Imported calendars (Google) ── */}
          <div className={styles.section}>
            <span className={styles.label}>Imported calendars</span>

            {!authUser ? (
              <p className={styles.empty}>Sign in to connect a Google Calendar.</p>
            ) : (
              <>
                <p className={styles.intro}>
                  Events from a connected calendar sync in automatically (while the app is open) and become normal,
                  fully-editable events here — this app is the source of truth for them once imported, so editing or
                  deleting one locally is never overwritten by a later sync.
                </p>

                {connectionsLoading ? (
                  <p className={styles.empty}>Loading…</p>
                ) : connections.length === 0 ? (
                  <p className={styles.empty}>No calendars connected yet.</p>
                ) : (
                  <div className={styles.list}>
                    {connections.map((conn) => (
                      <div key={conn.id} className={styles.connectionBlock}>
                        <div className={styles.connectionHeader}>
                          <span className={styles.rowName}>{conn.accountEmail}</span>
                          <button
                            type="button"
                            className={`${styles.rowActionBtn} ${styles.rowActionBtnDelete}`}
                            onClick={() => handleDisconnect(conn.id, conn.accountEmail)}
                            title="Disconnect"
                          >
                            🗑
                          </button>
                        </div>
                        {conn.calendars.length === 0 ? (
                          <p className={styles.empty}>No calendars found on this account.</p>
                        ) : (
                          conn.calendars.map((cal) => (
                            <label key={cal.id} className={styles.calendarRow}>
                              <input
                                type="checkbox"
                                checked={cal.enabled}
                                onChange={(e) => handleToggleCalendar(conn.id, cal.id, e.target.checked)}
                              />
                              {cal.color && <span className={styles.swatch} style={{ background: cal.color }} />}
                              <span className={styles.calendarName}>{cal.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.connectRow}>
                  <button className={styles.addBtn} onClick={handleConnect}>+ Connect Google Calendar</button>
                  {connections.length > 0 && (
                    <button type="button" className={styles.syncNowBtn} onClick={handleSyncNow} disabled={syncing}>
                      {syncing ? 'Syncing…' : 'Sync now'}
                    </button>
                  )}
                </div>
                {syncStatus && <p className={styles.hint}>{syncStatus}</p>}
              </>
            )}
          </div>

          {/* ── Archived events & reminders ── */}
          {archivedItems.length > 0 && (
            <div className={styles.section}>
              <button type="button" className={styles.archivedToggle} onClick={() => setArchivedOpen((o) => !o)} aria-expanded={archivedOpen}>
                <span className={`${styles.chevron} ${archivedOpen ? styles.chevronOpen : ''}`}>▸</span>
                <ArchiveIcon width={14} height={14} /> Archived ({archivedItems.length})
              </button>
              {archivedOpen && (
                <div className={styles.archivedList}>
                  {archivedItems.map((item) => (
                    <button
                      key={`${item.kind}:${item.id}`}
                      type="button"
                      className={styles.archivedRow}
                      onClick={() => (item.kind === 'event' ? openEventPane(item.id) : openReminderPane(item.id))}
                    >
                      <span className={styles.archivedTitle}>{item.title}</span>
                      <span className={styles.archivedMeta}>{item.kind === 'event' ? 'Event' : 'Reminder'} · {formatDate(item.date)}</span>
                    </button>
                  ))}
                  <p className={styles.hint}>Open one to see why it was archived, or to restore it.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
