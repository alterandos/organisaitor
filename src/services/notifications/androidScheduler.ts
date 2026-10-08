import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type ActionPerformed, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useSettingsStore } from '@/store/settingsStore';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';
import { resolveTimezone, utcToZonedTime, zonedTimeToUtc } from '@/utils/timezone';
import { addDaysToIso, type ClockFormat } from '@/utils/date';
import { planNotifications, type NotificationSnapshot, type PlannedNotification } from './plan';
import {
  acknowledgeOccurrence, clearNotificationCard, completeNotificationTask, openNotificationTarget,
  snoozeNotificationTarget, snoozeTime, type SnoozePreset,
} from './actions';
import type { NotificationKind } from '@/store/notificationStore';

import { log } from '@/utils/log';
// Android system notifications (docs/android/05-notifications.md N2–N6). The app is usually closed
// on a phone, so notifications are booked with the OS ahead of time: the next SCHEDULE_WINDOW_DAYS
// of planNotifications() (the rules shared with desktop), kept in step by reconcile — on launch, on
// resume, and shortly after any change to the stores it reads (including a sync pull).

export const SCHEDULE_WINDOW_DAYS = 14;
export const MAX_SCHEDULED = 200;          // Android allows 500 alarms per app
const RECONCILE_DEBOUNCE_MS = 1500;
const PERMISSION_ASKED_KEY = 'todo-notif-permission-asked'; // per device; asked once, never nags

type Channel = 'reminders' | 'events' | 'important';

export interface ScheduleSettings {
  notifyReminders:   boolean;
  notifyEvents:      boolean;
  quietHours:        { enabled: boolean; start: string; end: string };
}

// Stable positive 31-bit id per plan key, so reconcile is idempotent (BACKLOG §6c's djb2).
export function notificationId(key: string): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = (((hash << 5) + hash) ^ key.charCodeAt(i)) >>> 0;
  return (hash % 2_000_000_000) + 1;
}

const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// A moment inside quiet hours moves to when they end (same night or next morning). Windows can
// wrap midnight (22:00–07:00).
export function applyQuietHours(at: Date, zone: string, quiet: ScheduleSettings['quietHours']): Date {
  if (!quiet.enabled || quiet.start === quiet.end) return at;
  const local = utcToZonedTime(at, zone);
  const t = minutesOf(local.time), start = minutesOf(quiet.start), end = minutesOf(quiet.end);
  const wraps = start > end;
  const inside = wraps ? t >= start || t < end : t >= start && t < end;
  if (!inside) return at;
  const endDate = wraps && t >= start ? addDaysToIso(local.date, 1) : local.date;
  return zonedTimeToUtc(endDate, quiet.end, zone);
}

const channelOf = (p: PlannedNotification): Channel =>
  p.important ? 'important' : p.kind === 'event' || p.kind === 'schedule' ? 'events' : 'reminders';

// Which buttons a notification gets (max 3 on Android — see registerActionTypes below).
const actionTypeOf = (p: PlannedNotification): string | undefined =>
  p.taskId ? 'task' : p.kind === 'reminder' || p.kind === 'deadline' ? 'done' : p.kind === 'event' ? 'event' : undefined;

// What should be booked with the OS right now: pure, so it's tested without a device.
export function buildAndroidSchedule(snap: NotificationSnapshot, settings: ScheduleSettings, now: Date, zone: string, clockFormat: ClockFormat): LocalNotificationSchema[] {
  const to = new Date(now.getTime() + SCHEDULE_WINDOW_DAYS * 24 * 60 * 60_000);
  return planNotifications(snap, { from: now, to, zone, clockFormat })
    .filter((p) => (p.kind === 'event' || p.kind === 'schedule' ? settings.notifyEvents : settings.notifyReminders))
    .slice(0, MAX_SCHEDULED)
    .map((p) => {
      const at = p.important ? p.at : applyQuietHours(p.at, zone, settings.quietHours);
      return {
        id: notificationId(p.key),
        title: p.title,
        body: p.body,
        schedule: { at, allowWhileIdle: true },
        channelId: channelOf(p),
        actionTypeId: actionTypeOf(p),
        extra: { key: p.key, kind: p.kind, itemId: p.itemId, occurrence: p.occurrence, taskId: p.taskId, at: at.toISOString() },
      };
    });
}

function currentSnapshot(): NotificationSnapshot {
  const cal = useCalendarStore.getState();
  return {
    tasks: useTaskStore.getState().tasks,
    events: cal.events, reminders: cal.reminders, deadlines: cal.deadlines,
    schedules: useScheduleStore.getState().schedules,
  };
}

const native = () => Capacitor.getPlatform() === 'android';

// ── One-time setup: channels, buttons, and what a tap/button does ──

let initialised: Promise<void> | null = null;
export function initAndroidNotifications(): Promise<void> {
  if (!native()) return Promise.resolve();
  initialised ??= (async () => {
    const C = LABELS.notifications.channels;
    await LocalNotifications.createChannel({ id: 'reminders', name: C.reminders.name, description: C.reminders.description, importance: 4, vibration: true });
    await LocalNotifications.createChannel({ id: 'events', name: C.events.name, description: C.events.description, importance: 3 });
    await LocalNotifications.createChannel({ id: 'important', name: C.important.name, description: C.important.description, importance: 5, vibration: true });
    const A = LABELS.notifications.actions;
    // Android shows at most three buttons, so the four agreed snooze presets can't all fit: the
    // shade gets 1 hour + Tomorrow (morning); "This evening" and custom times are in the in-app bell.
    await LocalNotifications.registerActionTypes({ types: [
      { id: 'done',  actions: [{ id: 'done', title: A.done }, { id: 'snooze-1h', title: A.snooze1h }, { id: 'snooze-morning', title: A.snoozeMorning }] },
      { id: 'task',  actions: [{ id: 'complete', title: A.complete }, { id: 'snooze-1h', title: A.snooze1h }, { id: 'snooze-morning', title: A.snoozeMorning }] },
      { id: 'event', actions: [{ id: 'done', title: A.done }, { id: 'snooze-10m', title: A.snooze10m }, { id: 'snooze-1h', title: A.snooze1h }] },
    ] });
    await LocalNotifications.addListener('localNotificationActionPerformed', handleAction);
  })();
  return initialised;
}

const SNOOZE_ACTIONS: Record<string, SnoozePreset> = { 'snooze-10m': '10m', 'snooze-1h': '1h', 'snooze-morning': 'morning' };

export function handleAction({ actionId, notification }: ActionPerformed): void {
  const extra = notification.extra as { key?: string; kind?: NotificationKind; itemId?: string; occurrence?: string; taskId?: string | null } | undefined;
  if (!extra?.kind || !extra.itemId) return;
  const { key, kind, itemId, occurrence, taskId } = extra;
  if (actionId === 'tap') { openNotificationTarget(kind, itemId, occurrence); return; }
  // 'done' is the "Got it" button (its id is kept so notifications already booked still work):
  // a reminder is done, an event's or deadline's notification acknowledged — synced to every device.
  if (actionId === 'done') acknowledgeOccurrence(kind, itemId, occurrence);
  else if (actionId === 'complete' && taskId) completeNotificationTask(taskId);
  else if (actionId in SNOOZE_ACTIONS) {
    const s = useSettingsStore.getState();
    const until = snoozeTime(SNOOZE_ACTIONS[actionId], new Date(), resolveTimezone(s.timezone), s.snoozeMorningTime, s.snoozeEveningTime);
    snoozeNotificationTarget(kind, itemId, until.toISOString(), occurrence);
  } else return;
  clearNotificationCard(key);
}

// ── Permission (N5): asked in context, once ──

async function ensurePermission(hasSomethingToBook: boolean): Promise<boolean> {
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'granted') return true;
  if (perm.display === 'denied' || !hasSomethingToBook) return false;
  try { if (localStorage.getItem(PERMISSION_ASKED_KEY)) return false; localStorage.setItem(PERMISSION_ASKED_KEY, new Date().toISOString()); } catch { /* ask anyway */ }
  const P = LABELS.notifications.permission;
  if (!(await confirmDialog({ title: P.title, message: P.message, confirmLabel: P.confirm }))) return false;
  return requestNotificationPermission();
}

// Also used by Settings → Notifications. Asks for exact alarms straight after, if not allowed.
export async function requestNotificationPermission(): Promise<boolean> {
  if (!native()) return false;
  const res = await LocalNotifications.requestPermissions();
  if (res.display !== 'granted') return false;
  const exact = await LocalNotifications.checkExactNotificationSetting();
  if (exact.exact_alarm !== 'granted') {
    const P = LABELS.notifications.permission;
    if (await confirmDialog({ title: P.exactTitle, message: P.exactMessage, confirmLabel: P.exactConfirm })) {
      await LocalNotifications.changeExactNotificationSetting();
    }
  }
  scheduleReconcile();
  return true;
}

export async function getNotificationStatus(): Promise<{ display: string; exact: string }> {
  if (!native()) return { display: 'denied', exact: 'denied' };
  const [perm, exact] = await Promise.all([LocalNotifications.checkPermissions(), LocalNotifications.checkExactNotificationSetting()]);
  return { display: perm.display, exact: exact.exact_alarm };
}

export async function openExactAlarmSettings(): Promise<void> {
  if (native()) await LocalNotifications.changeExactNotificationSetting();
}

export async function sendTestNotification(): Promise<void> {
  if (!native()) return;
  const S = LABELS.notifications.settings;
  await LocalNotifications.schedule({ notifications: [{ id: 1, title: S.testTitle, body: S.testBody, channelId: 'reminders', schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true } }] });
}

// ── Reconcile (N2): make the OS's pending set equal what should be booked ──

let running: Promise<void> = Promise.resolve();
export function reconcile(): Promise<void> {
  if (!native()) return Promise.resolve();
  running = running.then(runReconcile, runReconcile);
  return running;
}

async function runReconcile(): Promise<void> {
  try {
    await initAndroidNotifications();
    const s = useSettingsStore.getState();
    const want = buildAndroidSchedule(currentSnapshot(), s, new Date(), resolveTimezone(s.timezone), s.clockFormat);
    if (!(await ensurePermission(want.length > 0))) return;
    const wantById = new Map(want.map((n) => [n.id, n]));
    const { notifications: pending } = await LocalNotifications.getPending();
    // Anything booked that's no longer wanted, or whose time/text changed, is cancelled (and the
    // changed ones rebooked below).
    const stale = pending.filter((p) => {
      const w = wantById.get(p.id);
      return !w || w.title !== p.title || w.body !== p.body || (w.extra as { at: string }).at !== (p.extra as { at?: string } | undefined)?.at;
    });
    if (stale.length > 0) await LocalNotifications.cancel({ notifications: stale.map((p) => ({ id: p.id })) });
    const kept = new Set(pending.filter((p) => !stale.includes(p)).map((p) => p.id));
    const toBook = want.filter((n) => !kept.has(n.id));
    if (toBook.length > 0) await LocalNotifications.schedule({ notifications: toBook });
  } catch (err) {
    log.error('notifications', 'reconcile failed', err instanceof Error ? err.message : String(err));
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function scheduleReconcile(): void {
  if (!native()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void reconcile(); }, RECONCILE_DEBOUNCE_MS);
}

// Re-plans whenever anything it reads changes (a sync pull lands here too). Returns an unsubscribe.
export function watchForChanges(): () => void {
  const unsubs = [
    useTaskStore.subscribe((s, p) => { if (s.tasks !== p.tasks) scheduleReconcile(); }),
    useCalendarStore.subscribe((s, p) => { if (s.events !== p.events || s.reminders !== p.reminders || s.deadlines !== p.deadlines) scheduleReconcile(); }),
    useScheduleStore.subscribe((s, p) => { if (s.schedules !== p.schedules) scheduleReconcile(); }),
    useSettingsStore.subscribe((s, p) => {
      if (s.timezone !== p.timezone || s.clockFormat !== p.clockFormat || s.notifyReminders !== p.notifyReminders
        || s.notifyEvents !== p.notifyEvents || s.quietHours !== p.quietHours) scheduleReconcile();
    }),
  ];
  return () => unsubs.forEach((u) => u());
}
