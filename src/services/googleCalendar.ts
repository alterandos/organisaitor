import { supabase } from '@/services/supabase';
import { useCalendarStore } from '@/store/calendarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { resolveTimezone, utcToZonedTime } from '@/utils/timezone';
import { addDaysToIso } from '@/utils/date';
import type { CalendarConnection, CalendarConnectionCalendar, CreateCalendarEventInput } from '@/types';

interface RawGoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?:   { date?: string; dateTime?: string };
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Google's redirect-back is a full page navigation, so there's no way to send an
// Authorization header — the access token rides along in the OAuth `state` param instead
// (same fix api/google-calendar-oauth-callback.ts's sibling Strava flow already uses).
// access_type=offline + prompt=consent force Google to re-issue a refresh_token every time
// (by default it's only issued on the very first consent, which would silently break
// re-connecting an account whose refresh_token was lost or revoked).
export async function getGoogleCalendarConnectUrl(): Promise<string | null> {
  const token = await accessToken();
  if (!token) return null;

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) return null;

  const redirectUri = `${window.location.origin}/api/google-calendar-oauth-callback`;
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    access_type:   'offline',
    prompt:        'consent',
    scope:         'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email',
    state:         token,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Fetches every connection plus, per connection, its live calendar list (name/color/enabled)
// — a second round-trip per connection, acceptable at the "a handful of connected accounts"
// scale this is meant for. Returns [] (not throwing) on any failure so a stale/expired
// connection can't crash the whole "Imported calendars" section.
export async function fetchGoogleCalendarConnections(): Promise<CalendarConnection[]> {
  const token = await accessToken();
  if (!token) return [];

  let connections: { id: string; provider: string; accountEmail: string; createdAt: string }[];
  try {
    const statusRes = await fetch('/api/google-calendar-status', { headers: { Authorization: `Bearer ${token}` } });
    if (!statusRes.ok) return [];
    // Local `vite dev` has no /api/* routing (only Vercel/`vercel dev` do), so this fetch can
    // come back 200 OK with the edge function's own source text instead of real JSON — `.ok`
    // alone doesn't guarantee a parseable body. Fail soft rather than throwing an uncaught
    // SyntaxError out of this function.
    ({ connections } = await statusRes.json() as {
      connections: { id: string; provider: string; accountEmail: string; createdAt: string }[];
    });
  } catch {
    return [];
  }

  const withCalendars = await Promise.all(connections.map(async (c): Promise<CalendarConnection> => {
    try {
      const listRes = await fetch(`/api/google-calendar-list?connectionId=${encodeURIComponent(c.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const calendars: CalendarConnectionCalendar[] = listRes.ok ? (await listRes.json()).calendars : [];
      return { id: c.id, provider: c.provider, accountEmail: c.accountEmail, createdAt: c.createdAt, calendars };
    } catch {
      return { id: c.id, provider: c.provider, accountEmail: c.accountEmail, createdAt: c.createdAt, calendars: [] };
    }
  }));
  return withCalendars;
}

export async function setGoogleCalendarEnabled(connectionId: string, calendarId: string, enabled: boolean): Promise<void> {
  const token = await accessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/google-calendar-set-enabled', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, calendarId, enabled }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed: ${res.status}`);
  }
}

export async function disconnectGoogleCalendar(connectionId: string): Promise<void> {
  const token = await accessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/google-calendar-disconnect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed: ${res.status}`);
  }
}

// Maps one raw Google event into this app's CreateCalendarEventInput shape. Timezone
// conversion happens HERE, client-side, against the account's own effective timezone
// (settingsStore.timezone) — a client-only setting the edge function has no way to know —
// rather than trusting Google's own local-time components, which could be in a different
// zone than the account's (e.g. an event created while travelling). All-day events are
// exempt, same as everywhere else in this app's timezone handling: Google's own `end.date`
// is EXCLUSIVE per their API, so a single-day all-day event needs no endDate and a
// multi-day one needs its end date shifted back by one day.
function mapGoogleEvent(
  raw: RawGoogleEvent, connectionId: string, calendarId: string, accountZone: string
): (CreateCalendarEventInput & { sourceConnectionId: string; sourceCalendarId: string; sourceEventId: string }) | null {
  const title = raw.summary?.trim() || '(Untitled)';
  const sourceRaw = raw as unknown as Record<string, unknown>;
  const base = {
    title,
    notes: raw.description ?? null,
    location: raw.location ?? null,
    source: 'google',
    sourceConnectionId: connectionId,
    sourceCalendarId: calendarId,
    sourceEventId: raw.id,
    sourceRaw,
  };

  if (raw.start?.date) {
    const date = raw.start.date;
    const endExclusive = raw.end?.date ?? date;
    const endDate = endExclusive > addDaysToIso(date, 1) ? addDaysToIso(endExclusive, -1) : null;
    return { ...base, date, endDate, startTime: null, endTime: null };
  }

  if (!raw.start?.dateTime) return null; // malformed — skip rather than crash the whole sync
  const { date, time: startTime } = utcToZonedTime(new Date(raw.start.dateTime), accountZone);
  let endTime: string | null = null;
  let endDate: string | null = null;
  if (raw.end?.dateTime) {
    const endZoned = utcToZonedTime(new Date(raw.end.dateTime), accountZone);
    endTime = endZoned.time;
    if (endZoned.date !== date) endDate = endZoned.date;
  }
  return { ...base, date, endDate, startTime, endTime };
}

// Pulls events for every enabled calendar across every connection (server-side fetch, see
// api/google-calendar-sync.ts) and creates a local CalendarEvent for each one not already
// imported — see calendarStore.ts's upsertSyncedEvent for the "only ever create, never
// touch again" policy. Returns how many were newly created, for a small toast/status line.
export async function syncGoogleCalendars(): Promise<{ created: number; failed: number }> {
  const token = await accessToken();
  if (!token) return { created: 0, failed: 0 };

  let events: { connectionId: string; calendarId: string; event: RawGoogleEvent | { error: string } }[];
  try {
    const res = await fetch('/api/google-calendar-sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { created: 0, failed: 0 };
    // Same local-dev-has-no-/api/*-routing caveat as fetchGoogleCalendarConnections above.
    ({ events } = await res.json() as { events: { connectionId: string; calendarId: string; event: RawGoogleEvent | { error: string } }[] });
  } catch {
    return { created: 0, failed: 0 };
  }
  const accountZone = resolveTimezone(useSettingsStore.getState().timezone);
  const upsertSyncedEvent = useCalendarStore.getState().upsertSyncedEvent;

  let created = 0;
  let failed = 0;
  for (const { connectionId, calendarId, event } of events) {
    if (calendarId === '__error__') { failed++; continue; }
    const mapped = mapGoogleEvent(event as RawGoogleEvent, connectionId, calendarId, accountZone);
    if (!mapped) continue;
    const id = upsertSyncedEvent(mapped);
    if (id) created++;
  }
  return { created, failed };
}
