// Shared helpers for the Google Calendar sync edge functions (see CLAUDE.md "External
// calendar sync"). Files under api/_lib/ are not routed by Vercel (leading underscore).

import type { SupabaseClient } from '@supabase/supabase-js';

export interface GoogleTokenResponse {
  access_token:  string;
  refresh_token?: string;  // only present on first consent, or when prompt=consent forces re-issue
  expires_in:    number;   // seconds from now — unlike Strava, Google doesn't return an absolute expiry
  scope:         string;
  token_type:    string;
}

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.VITE_GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      ...body,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
}

export function refreshGoogleToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo request failed: ${res.status}`);
  const data = await res.json() as { email: string };
  return data.email;
}

// Refreshes and persists a connection's access token if it's expired or expiring within
// the next 5 minutes, else returns the one already on the row unchanged — same "refresh if
// about to expire" window api/strava-sync.ts already uses.
export async function getValidAccessToken(
  supabase: SupabaseClient,
  connection: { id: string; access_token: string; refresh_token: string; expires_at: number }
): Promise<string> {
  const nowSecs = Math.floor(Date.now() / 1000);
  if (connection.expires_at >= nowSecs + 300) return connection.access_token;

  const refreshed = await refreshGoogleToken(connection.refresh_token);
  const expiresAt = nowSecs + refreshed.expires_in;
  await supabase.from('calendar_connections').update({
    access_token: refreshed.access_token,
    // Google doesn't always re-issue a refresh_token on a refresh grant — keep the
    // existing one when it doesn't.
    refresh_token: refreshed.refresh_token ?? connection.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', connection.id);
  return refreshed.access_token;
}

export interface GoogleCalendarListEntry {
  id:              string;
  summary:         string;
  backgroundColor?: string;
  timeZone?:       string;
  primary?:        boolean;
  accessRole?:     string;                                  // owner | writer | reader | freeBusyReader
  defaultReminders?: { method: string; minutes: number }[]; // what an event using "default" reminders gets
}

export async function fetchGoogleCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google calendar list request failed: ${res.status}`);
  const data = await res.json() as { items?: GoogleCalendarListEntry[] };
  return data.items ?? [];
}

// The fields the client reads (src/services/calendarImport/google.ts has the full shape); the
// rest of Google's payload is passed through untouched.
export interface GoogleCalendarEvent {
  id:      string;
  status?: string;   // 'confirmed' | 'cancelled' | 'tentative' — Google's own event status
  summary?: string;
  recurringEventId?: string;
  [field: string]: unknown;
}

// 1 month back / 6 months forward — pulling in a Google account's entire history would be
// both pointless (this is a planning calendar, not an archive) and slow. Easy to change
// later; not user-configurable in this pass.
const SYNC_WINDOW_PAST_DAYS = 30;
const SYNC_WINDOW_FUTURE_DAYS = 183;

export function syncWindow(): { timeMin: string; timeMax: string } {
  const now = Date.now();
  return {
    timeMin: new Date(now - SYNC_WINDOW_PAST_DAYS * 86_400_000).toISOString(),
    timeMax: new Date(now + SYNC_WINDOW_FUTURE_DAYS * 86_400_000).toISOString(),
  };
}

const MAX_PAGES = 40;

// Every page of an events listing (Google pages at maxResults, at most 2500 a page).
async function fetchAllPages(accessToken: string, url: string, params: URLSearchParams, what: string): Promise<GoogleCalendarEvent[]> {
  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${url}?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Google ${what} request failed: ${res.status}`);
    const data = await res.json() as { items?: GoogleCalendarEvent[]; nextPageToken?: string };
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) return items;
  }
  throw new Error(`Google ${what}: more than ${MAX_PAGES} pages`);
}

// singleEvents=false: a repeating event comes back once, with its rule (`recurrence`), and each
// date changed or deleted in it as its own entry (`recurringEventId`), so the client can make one
// native series. showDeleted=true: events deleted in Google come back as status 'cancelled', so
// the client can remove them here too. A series is returned when any of its dates is in the window.
export function fetchGoogleCalendarEvents(accessToken: string, calendarId: string): Promise<GoogleCalendarEvent[]> {
  const { timeMin, timeMax } = syncWindow();
  const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'false', showDeleted: 'true', maxResults: '2500' });
  return fetchAllPages(accessToken, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, params, `events for ${calendarId}`);
}

// The single dates of one repeating event, in the window: for a rule the app can't show as a series.
export function fetchGoogleEventInstances(accessToken: string, calendarId: string, eventId: string): Promise<GoogleCalendarEvent[]> {
  const { timeMin, timeMax } = syncWindow();
  const params = new URLSearchParams({ timeMin, timeMax, showDeleted: 'true', maxResults: '2500' });
  return fetchAllPages(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/instances`,
    params, `instances of ${eventId}`,
  );
}
