// Shared helpers for the Outlook / Microsoft 365 calendar edge functions (Microsoft Graph). Same
// shape as _lib/googleCalendar.ts; docs/features/external-calendar-sync.md "Outlook". Files under
// api/_lib/ are not routed by Vercel (leading underscore).

import type { SupabaseClient } from '@supabase/supabase-js';

// The "common" endpoint: personal Microsoft accounts and work/school ones (decided with the user
// 2026-10-18). A work tenant may still require its admin's approval (publisher verification).
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
export const MICROSOFT_SCOPES = 'offline_access User.Read Calendars.Read';

export interface MicrosoftTokenResponse {
  access_token:   string;
  refresh_token?: string;  // Microsoft issues a new one with every grant: always store it
  expires_in:     number;
  scope:          string;
  token_type:     string;
}

async function tokenRequest(body: Record<string, string>): Promise<MicrosoftTokenResponse> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.VITE_MICROSOFT_CLIENT_ID as string,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET as string,
      scope:         MICROSOFT_SCOPES,
      ...body,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Microsoft token request failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<MicrosoftTokenResponse>;
}

export function exchangeMicrosoftCode(code: string, redirectUri: string): Promise<MicrosoftTokenResponse> {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
}

export function refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
}

// Graph throttles busy apps with 429 (and sometimes 503) and a Retry-After in seconds: wait and
// try again, a few times, never longer than 10 s a wait (an edge function has a time limit).
export async function graphFetch(url: string, accessToken: string, prefer?: string): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (prefer) headers.Prefer = prefer;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });
    if ((res.status !== 429 && res.status !== 503) || attempt >= 3) return res;
    const wait = Math.min(10, Number(res.headers.get('Retry-After')) || 2 ** attempt);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

async function graphJson<T>(url: string, accessToken: string, what: string, prefer?: string): Promise<T> {
  const res = await graphFetch(url, accessToken, prefer);
  if (!res.ok) throw Object.assign(new Error(`Microsoft ${what} request failed: ${res.status}`), { status: res.status });
  return res.json() as Promise<T>;
}

export async function fetchMicrosoftAccountEmail(accessToken: string): Promise<string> {
  const me = await graphJson<{ mail?: string | null; userPrincipalName?: string }>(`${GRAPH}/me?$select=mail,userPrincipalName`, accessToken, 'profile');
  const email = me.mail || me.userPrincipalName;
  if (!email) throw new Error('Microsoft account has no email address');
  return email;
}

// Refreshes and persists a connection's access token if it expires within 5 minutes (as Google's
// does), storing the new refresh token Microsoft hands back each time.
export async function getValidMicrosoftAccessToken(
  supabase: SupabaseClient,
  connection: { id: string; access_token: string; refresh_token: string; expires_at: number },
): Promise<string> {
  const nowSecs = Math.floor(Date.now() / 1000);
  if (connection.expires_at >= nowSecs + 300) return connection.access_token;
  const refreshed = await refreshMicrosoftToken(connection.refresh_token);
  await supabase.from('calendar_connections').update({
    access_token:  refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? connection.refresh_token,
    expires_at:    nowSecs + refreshed.expires_in,
    updated_at:    new Date().toISOString(),
  }).eq('id', connection.id);
  return refreshed.access_token;
}

export interface MicrosoftCalendarEntry {
  id:         string;
  name:       string;
  hexColor?:  string;
  canEdit?:   boolean;
  isDefaultCalendar?: boolean;
}

async function allPages<T>(firstUrl: string, accessToken: string, what: string, prefer?: string): Promise<{ items: T[]; deltaLink?: string }> {
  const items: T[] = [];
  let url: string | undefined = firstUrl;
  for (let page = 0; url; page++) {
    if (page >= 60) throw new Error(`Microsoft ${what}: more than 60 pages`);
    const data: { value?: T[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string } = await graphJson(url, accessToken, what, prefer);
    items.push(...(data.value ?? []));
    if (data['@odata.deltaLink']) return { items, deltaLink: data['@odata.deltaLink'] };
    url = data['@odata.nextLink'];
  }
  return { items };
}

export async function fetchMicrosoftCalendars(accessToken: string): Promise<MicrosoftCalendarEntry[]> {
  return (await allPages<MicrosoftCalendarEntry>(`${GRAPH}/me/calendars?$select=id,name,hexColor,canEdit,isDefaultCalendar&$top=100`, accessToken, 'calendar list')).items;
}

export interface MicrosoftEvent {
  id: string;
  type?: string;              // singleInstance | occurrence | exception | seriesMaster
  seriesMasterId?: string | null;
  '@removed'?: { reason: string };
  [field: string]: unknown;
}

// Text bodies rather than HTML; times in UTC (the client moves them into the account's zone).
const PREFER = 'outlook.body-content-type="text", outlook.timezone="UTC", odata.maxpagesize=200';

// 1 month back / 6 months forward, as for Google.
export const WINDOW_PAST_DAYS = 30;
export const WINDOW_FUTURE_DAYS = 183;

export function microsoftWindow(now = Date.now()): { start: string; end: string } {
  return {
    start: new Date(now - WINDOW_PAST_DAYS * 86_400_000).toISOString(),
    end:   new Date(now + WINDOW_FUTURE_DAYS * 86_400_000).toISOString(),
  };
}

export class DeltaExpiredError extends Error {}

// The calendar's changes since `deltaLink` (or everything in the window, without one): changed
// events and the ids of removed ones (`@removed`), plus the next delta link. A delta link Graph no
// longer recognises (410 Gone, syncStateNotFound) throws DeltaExpiredError: start again.
export async function fetchCalendarDelta(accessToken: string, calendarId: string, deltaLink: string | null, window: { start: string; end: string }):
  Promise<{ changed: MicrosoftEvent[]; removed: string[]; deltaLink: string }> {
  const first = deltaLink ?? `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta?startDateTime=${encodeURIComponent(window.start)}&endDateTime=${encodeURIComponent(window.end)}`;
  let result: { items: MicrosoftEvent[]; deltaLink?: string };
  try {
    result = await allPages<MicrosoftEvent>(first, accessToken, 'calendar delta', PREFER);
  } catch (e) {
    if (deltaLink && (e as { status?: number }).status === 410) throw new DeltaExpiredError('delta expired');
    throw e;
  }
  if (!result.deltaLink) throw new Error('Microsoft calendar delta ended without a delta link');
  const changed = result.items.filter((i) => !i['@removed']);
  const removed = result.items.filter((i) => i['@removed']).map((i) => i.id);
  return { changed, removed, deltaLink: result.deltaLink };
}

// A repeating event's master (its rule) and its dates in the window (occurrences and changed
// ones; a deleted date is simply missing). null when the series no longer exists.
export async function fetchSeries(accessToken: string, seriesId: string, window: { start: string; end: string }):
  Promise<{ master: MicrosoftEvent; instances: MicrosoftEvent[] } | null> {
  const res = await graphFetch(`${GRAPH}/me/events/${encodeURIComponent(seriesId)}`, accessToken, PREFER);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Microsoft series request failed: ${res.status}`);
  const master = await res.json() as MicrosoftEvent;
  const { items } = await allPages<MicrosoftEvent>(
    `${GRAPH}/me/events/${encodeURIComponent(seriesId)}/instances?startDateTime=${encodeURIComponent(window.start)}&endDateTime=${encodeURIComponent(window.end)}&$top=200`,
    accessToken, 'series dates', PREFER,
  );
  return { master, instances: items };
}
