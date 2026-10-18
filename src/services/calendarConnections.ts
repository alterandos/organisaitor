import { supabase } from '@/services/supabase';
import { apiFetch } from '@/utils/apiFetch';
import { log } from '@/utils/log';
import { syncGoogleCalendars } from '@/services/googleCalendar';
import { syncMicrosoftCalendars } from '@/services/microsoftCalendar';
import type { CalendarConnection, CalendarConnectionCalendar } from '@/types';

// Connected calendar accounts of every provider (Google, Microsoft), for the side pane's
// "Imported calendars". The status, enable and disconnect endpoints work on any connection by
// id; only the calendar list and the sync are per provider.

export interface SyncSummary { created: number; updated: number; removed: number; failed: number }

const LIST_ENDPOINT: Record<string, string> = {
  google:    '/api/google-calendar-list',
  microsoft: '/api/microsoft-calendar-list',
};

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Every connection plus, per connection, its live calendar list (name/color/enabled) — a second
// round-trip per connection, acceptable at the "a handful of connected accounts" scale this is
// meant for. Returns [] (not throwing) on any failure so a stale/expired connection can't crash
// the whole "Imported calendars" section.
export async function fetchCalendarConnections(): Promise<CalendarConnection[]> {
  const token = await accessToken();
  if (!token) return [];

  let connections: { id: string; provider: string; accountEmail: string; createdAt: string }[];
  try {
    const statusRes = await apiFetch('/api/google-calendar-status', { headers: { Authorization: `Bearer ${token}` } });
    if (!statusRes.ok) return [];
    // Local `vite dev` has no /api/* routing (only Vercel/`vercel dev` do), so this fetch can
    // come back 200 OK with the edge function's own source text instead of real JSON — `.ok`
    // alone doesn't guarantee a parseable body. Fail soft rather than throwing.
    ({ connections } = await statusRes.json() as {
      connections: { id: string; provider: string; accountEmail: string; createdAt: string }[];
    });
  } catch (e) {
    log.warn('calendarConnections', 'status request failed', e);
    return [];
  }

  return Promise.all(connections.filter((c) => LIST_ENDPOINT[c.provider]).map(async (c): Promise<CalendarConnection> => {
    try {
      const listRes = await apiFetch(`${LIST_ENDPOINT[c.provider]}?connectionId=${encodeURIComponent(c.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const calendars: CalendarConnectionCalendar[] = listRes.ok ? (await listRes.json()).calendars : [];
      return { id: c.id, provider: c.provider, accountEmail: c.accountEmail, createdAt: c.createdAt, calendars };
    } catch (e) {
      log.warn('calendarConnections', 'calendar list request failed', e);
      return { id: c.id, provider: c.provider, accountEmail: c.accountEmail, createdAt: c.createdAt, calendars: [] };
    }
  }));
}

export async function setCalendarEnabled(connectionId: string, calendarId: string, enabled: boolean): Promise<void> {
  const token = await accessToken();
  if (!token) throw new Error('Not signed in');
  const res = await apiFetch('/api/google-calendar-set-enabled', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, calendarId, enabled }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed: ${res.status}`);
  }
}

export async function disconnectCalendar(connectionId: string): Promise<void> {
  const token = await accessToken();
  if (!token) throw new Error('Not signed in');
  const res = await apiFetch('/api/google-calendar-disconnect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed: ${res.status}`);
  }
}

// Every provider, one after the other (each waits for the cloud load itself).
export async function syncAllCalendars(): Promise<SyncSummary> {
  const total: SyncSummary = { created: 0, updated: 0, removed: 0, failed: 0 };
  for (const sync of [syncGoogleCalendars, syncMicrosoftCalendars]) {
    try {
      const r = await sync();
      total.created += r.created; total.updated += r.updated; total.removed += r.removed; total.failed += r.failed;
    } catch (e) {
      log.warn('calendarConnections', 'a calendar sync failed', e);
      total.failed++;
    }
  }
  return total;
}
