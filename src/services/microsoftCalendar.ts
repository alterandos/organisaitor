import { supabase } from '@/services/supabase';
import { mintOAuthState } from '@/services/oauthState';
import { useSettingsStore } from '@/store/settingsStore';
import { useCalendarStore } from '@/store/calendarStore';
import { resolveTimezone } from '@/utils/timezone';
import { apiFetch, oauthRedirectOrigin } from '@/utils/apiFetch';
import { log } from '@/utils/log';
import { waitForSyncLoad } from '@/services/sync/syncService';
import { mapMsEvent, removedDraft, seriesDrafts, type MsCalendarContext, type MsEventRaw, type MsMapContext } from '@/services/calendarImport/microsoft';
import { applyImport } from '@/services/calendarImport/reconcile';
import { importKey, importKeyOf, type ImportDraft } from '@/services/calendarImport/draft';
import { importedEventId } from '@/services/calendarImport/ids';
import type { SyncSummary } from '@/services/calendarConnections';

// Outlook / Microsoft 365 calendars (Microsoft Graph), one way, through the same import rules as
// Google (services/calendarImport/reconcile.ts). docs/features/external-calendar-sync.md "Outlook".

const SCOPES = 'offline_access User.Read Calendars.Read';

// The authorise URL on Microsoft's "common" endpoint: personal and work/school accounts. A work
// account whose organisation hasn't allowed the app sees Microsoft's "Need admin approval".
export async function getMicrosoftCalendarConnectUrl(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  `${oauthRedirectOrigin()}/api/microsoft-calendar-oauth-callback`,
    response_type: 'code',
    response_mode: 'query',
    scope:         SCOPES,
    prompt:        'select_account',
    state:         await mintOAuthState('microsoft'),
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

// Each calendar's delta cursor, on this device only (per-device bookkeeping like
// todo-sync-pending: not in PERSISTED_STORAGE_KEYS, never backed up, cleared on sign-out). It
// moves only after what it returned has been applied, so a sync cut short repeats rather than
// loses changes.
type Cursor = { link: string; windowStart: string };
type Cursors = Record<string, Record<string, Cursor>>;
export const MS_CURSOR_PREFIX = 'todo-ms-delta:';

function readCursors(userId: string): Cursors {
  try {
    return JSON.parse(localStorage.getItem(MS_CURSOR_PREFIX + userId) ?? '{}') as Cursors;
  } catch (e) {
    log.warn('microsoftCalendar', 'unreadable delta cursors, starting over', e);
    return {};
  }
}

function writeCursors(userId: string, cursors: Cursors): void {
  try {
    localStorage.setItem(MS_CURSOR_PREFIX + userId, JSON.stringify(cursors));
  } catch (e) {
    log.warn('microsoftCalendar', 'could not save delta cursors', e);
  }
}

export function clearMicrosoftCursors(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith(MS_CURSOR_PREFIX)) localStorage.removeItem(k);
  }
}

interface SyncedCalendar {
  connectionId: string;
  account:      string;
  calendarId:   string;
  calendar:     MsCalendarContext;
  changed:      MsEventRaw[];
  removed:      string[];
  seriesIds:    string[];
  cursor:       Cursor;
  reset:        boolean;
}

type SeriesResult = { id: string; deleted?: boolean; master?: MsEventRaw; instances?: MsEventRaw[] };

let running: Promise<SyncSummary> | null = null;

export function syncMicrosoftCalendars(): Promise<SyncSummary> {
  running ??= runSync().finally(() => { running = null; });
  return running;
}

async function runSync(): Promise<SyncSummary> {
  const none = { created: 0, updated: 0, removed: 0, failed: 0 };
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return none;
  const userId = session.user.id;
  await waitForSyncLoad(userId);
  const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  const cursors = readCursors(userId);

  let calendars: SyncedCalendar[];
  let errors: unknown[];
  try {
    const res = await apiFetch('/api/microsoft-calendar-sync', { method: 'POST', headers, body: JSON.stringify({ cursors }) });
    if (!res.ok) return none;
    ({ calendars, errors } = await res.json() as { calendars: SyncedCalendar[]; errors: unknown[] });
  } catch (e) {
    log.warn('microsoftCalendar', 'sync request failed', e);
    return none;
  }

  const zone = resolveTimezone(useSettingsStore.getState().timezone);
  const events = Object.values(useCalendarStore.getState().events);
  const localKeys = new Set(events.map(importKeyOf).filter((k): k is string => !!k));
  const drafts: ImportDraft[] = [];
  const nextCursors: Cursors = {};
  let failed = errors.length;

  for (const cal of calendars) {
    const ctx: MsMapContext = { account: cal.account, connectionId: cal.connectionId, calendarId: cal.calendarId, zone, calendar: cal.calendar };
    const own: ImportDraft[] = [];
    for (const ev of cal.changed) {
      const r = mapMsEvent(ev, ctx);
      if (r.kind === 'draft') own.push(r.draft);
    }
    // A removed id we hold is a deletion. One we don't may be a deleted date of a series (Graph
    // gives only the id): then every series from this calendar is checked again.
    let unknownRemoval = false;
    for (const id of cal.removed) {
      if (localKeys.has(importKey('microsoft', cal.account, cal.calendarId, id))) own.push(removedDraft(id, ctx));
      else unknownRemoval = true;
    }
    const seriesIds = new Set(cal.seriesIds);
    if (unknownRemoval || cal.reset) {
      for (const ev of events) {
        if (ev.source === 'microsoft' && ev.sourceAccount === cal.account && ev.sourceCalendarId === cal.calendarId && ev.repeat && !ev.seriesId && ev.sourceEventId) {
          seriesIds.add(ev.sourceEventId);
        }
      }
    }

    let complete = true;
    const ids = [...seriesIds];
    for (let i = 0; i < ids.length; i += 20) {
      try {
        const res = await apiFetch('/api/microsoft-calendar-series', {
          method: 'POST', headers,
          body: JSON.stringify({ connectionId: cal.connectionId, calendarId: cal.calendarId, seriesIds: ids.slice(i, i + 20) }),
        });
        if (!res.ok) { complete = false; continue; }
        const { series, window } = await res.json() as { series: SeriesResult[]; window: { start: string; end: string } };
        for (const s of series) own.push(...seriesDrafts(s, ctx, window));
      } catch (e) {
        log.warn('microsoftCalendar', 'series request failed', e);
        complete = false;
      }
    }

    drafts.push(...own);
    if (complete) (nextCursors[cal.connectionId] ??= {})[cal.calendarId] = cal.cursor;
    else {
      failed++;
      const prior = cursors[cal.connectionId]?.[cal.calendarId];
      if (prior) (nextCursors[cal.connectionId] ??= {})[cal.calendarId] = prior;
    }
  }

  const result = applyImport(drafts, { idFor: (key) => importedEventId(userId, key) });
  writeCursors(userId, nextCursors);
  return { ...result, failed };
}
