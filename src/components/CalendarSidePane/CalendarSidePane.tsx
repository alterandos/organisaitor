import { useState, useEffect, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { useCalendarStore } from '@/store/calendarStore';
import { ArchiveIcon, CloseIcon, DisclosureIcon } from '@/components/Icons';
import { useUIStore, type CalendarViewMode } from '@/store/uiStore';
import { useSettingsStore, type CalendarLayerKey } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { usePlatform } from '@/hooks/usePlatform';
import { formatDate } from '@/utils/date';
import { countTemplateConflicts } from '@/utils/scheduleOccurrences';
import { ScheduleWeekGridPreview, type PreviewEntry } from '@/components/ScheduleWeekGridPreview/ScheduleWeekGridPreview';
import {
  getGoogleCalendarConnectUrl,
} from '@/services/googleCalendar';
import { openOAuthFlow } from '@/services/oauthState';
import { getMicrosoftCalendarConnectUrl } from '@/services/microsoftCalendar';
import { fetchCalendarConnections, setCalendarEnabled, disconnectCalendar, syncAllCalendars } from '@/services/calendarConnections';
import type { ScheduleId, ScheduleTemplate, CalendarConnection } from '@/types';
import styles from './CalendarSidePane.module.css';
import { MiniDatePicker } from '@/components/MiniDatePicker/MiniDatePicker';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { alertDialog, choiceDialog, confirmDialog, confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { showToast } from '@/components/Toast/showToast';
import { removeImportedEvents } from '@/services/calendarImport/reconcile';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';

// Which calendar item categories render, filtered via CalendarEvent.eventType/status and
// CalendarReminder.reminderType. See settingsStore.calendarLayerVisibility for the actual
// filter state this reads/writes — this list is just today's presentation of it.
const LAYERS: { key: CalendarLayerKey; label: string }[] = [
  { key: 'events',        label: 'Events'           },
  { key: 'reminders',     label: 'Reminders'        },
  { key: 'deadlines',     label: 'Deadlines'        },
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
  const paneResize = usePaneWidth('calendar-side', { edge: 'right', min: 220, max: 560 });
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

  // ── Imported calendars (Google, Outlook — docs/features/external-calendar-sync.md) ──
  const authUser = useAuthStore((s) => s.user);
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const reloadConnections = () => {
    if (!authUser) { setConnections([]); return; }
    setConnectionsLoading(true);
    fetchCalendarConnections().then(setConnections).finally(() => setConnectionsLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)fetches the connections from the network whenever the pane opens or the account changes
    if (open) reloadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, authUser]);

  const handleConnect = async (provider: 'google' | 'microsoft') => {
    const L = LABELS.calendarImport;
    try {
      const url = provider === 'google' ? await getGoogleCalendarConnectUrl() : await getMicrosoftCalendarConnectUrl();
      if (!url) { await alertDialog(L.notConfigured(L.providerName[provider])); return; }
      if (await openOAuthFlow(provider === 'google' ? 'google-calendar' : 'microsoft-calendar', url)) reloadConnections();
    } catch (e) {
      await alertDialog(e instanceof Error ? e.message : L.connectFailed(L.providerName[provider]));
    }
  };

  const handleToggleCalendar = async (connectionId: string, calendarId: string, enabled: boolean) => {
    setConnections((prev) => prev.map((c) =>
      c.id === connectionId
        ? { ...c, calendars: c.calendars.map((cal) => (cal.id === calendarId ? { ...cal, enabled } : cal)) }
        : c
    ));
    try {
      await setCalendarEnabled(connectionId, calendarId, enabled);
    } catch {
      reloadConnections(); // revert the optimistic update on failure
    }
  };

  const handleDisconnect = async (connectionId: string, provider: string, accountEmail: string) => {
    const L = LABELS.calendarImport;
    const count = Object.values(useCalendarStore.getState().events).filter((e) => e.source === provider && e.sourceAccount === accountEmail).length;
    // Keeping them is the primary choice: it affects the least (CLAUDE.md "Confirmations and alerts").
    const choice = count === 0
      ? (await confirmDialog({ title: L.disconnectTitle(accountEmail), confirmLabel: 'Disconnect' }) ? 'confirm' : 'cancel')
      : await choiceDialog({
        title: L.disconnectTitle(accountEmail),
        message: L.disconnectBody(count),
        confirmLabel: L.disconnectKeep,
        alternateLabel: L.disconnectRemove,
      });
    if (choice === 'cancel') return;
    try {
      await disconnectCalendar(connectionId);
    } catch (e) {
      await alertDialog(e instanceof Error ? e.message : 'Could not disconnect the account.');
      return;
    }
    if (choice === 'alternate') showToast({ message: L.removedToast(removeImportedEvents(provider, accountEmail)) });
    reloadConnections();
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const { created, updated, removed, failed } = await syncAllCalendars();
      const parts = [
        `${created} new event${created !== 1 ? 's' : ''} imported`,
        ...(updated ? [`${updated} updated`] : []),
        ...(removed ? [`${removed} removed`] : []),
        ...(failed ? [`${failed} calendar${failed !== 1 ? 's' : ''} failed to sync`] : []),
      ];
      setSyncStatus(parts.join(', '));
    } catch {
      setSyncStatus('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Docked beside the calendar: the calendar's own keys (O, T, ←/→, Tab) keep working while it's open.
  useEscapeClose(close, open, { docked: true });

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
      <aside style={paneResize.style} className={styles.pane} role="complementary" aria-label="Calendar layers and schedules">
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <div className={styles.header}>
          <span className={styles.heading}>Calendar</span>
          <button className={styles.closeBtn} onClick={close} aria-label="Close"><CloseIcon /></button>
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

          {/* ── Imported calendars (Google, Outlook) ── */}
          <div className={styles.section}>
            <span className={styles.label}>Imported calendars</span>

            {!authUser ? (
              <p className={styles.empty}>{LABELS.calendarImport.signInToConnect}</p>
            ) : (
              <>
                <p className={styles.intro}>{LABELS.calendarImport.intro}</p>

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
                          <span className={styles.providerTag}>{LABELS.calendarImport.providerName[conn.provider as 'google' | 'microsoft'] ?? conn.provider}</span>
                          <button
                            type="button"
                            className={`${styles.rowActionBtn} ${styles.rowActionBtnDelete}`}
                            onClick={() => handleDisconnect(conn.id, conn.provider, conn.accountEmail)}
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
                  <button className={styles.addBtn} onClick={() => handleConnect('google')}>{LABELS.calendarImport.connect(LABELS.calendarImport.providerName.google)}</button>
                  <button className={styles.addBtn} onClick={() => handleConnect('microsoft')}>{LABELS.calendarImport.connect(LABELS.calendarImport.providerName.microsoft)}</button>
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
                <DisclosureIcon open={archivedOpen} />
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
