import { supabase } from '@/services/supabase';
import { mintOAuthState } from '@/services/oauthState';
import { useSettingsStore } from '@/store/settingsStore';
import { resolveTimezone } from '@/utils/timezone';
import { apiFetch, oauthRedirectOrigin } from '@/utils/apiFetch';
import { log } from '@/utils/log';
import { waitForSyncLoad } from '@/services/sync/syncService';
import { mapGoogleEvent, type GoogleCalendarContext, type GoogleEventRaw, type GoogleMapContext } from '@/services/calendarImport/google';
import { applyImport } from '@/services/calendarImport/reconcile';
import { importKey, type ImportDraft } from '@/services/calendarImport/draft';
import { importedEventId } from '@/services/calendarImport/ids';
import type { SyncSummary } from '@/services/calendarConnections';

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Google's redirect-back is a full page navigation, so there's no way to send an
// Authorization header — a single-use nonce (mintOAuthState) rides in the OAuth `state` param
// instead (same flow as Strava's). Throws if the nonce can't be minted (e.g. migration 032
// not run yet).
// access_type=offline + prompt=consent force Google to re-issue a refresh_token every time
// (by default it's only issued on the very first consent, which would silently break
// re-connecting an account whose refresh_token was lost or revoked).
export async function getGoogleCalendarConnectUrl(): Promise<string | null> {
  const token = await accessToken();
  if (!token) return null;

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) return null;

  const redirectUri = `${oauthRedirectOrigin()}/api/google-calendar-oauth-callback`;
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    access_type:   'offline',
    prompt:        'consent',
    scope:         'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email',
    state:         await mintOAuthState('google'),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Pulls every enabled calendar across every connection (server-side fetch, see
// api/google-calendar-sync.ts) and applies it to the calendar (services/calendarImport/reconcile.ts):
// new events are created, ones changed in Google follow it where not edited here, deleted ones go.
// Waits until this device has loaded the account's cloud data, so what's already imported (on
// any device) is known first. One run at a time.
let running: Promise<SyncSummary> | null = null;


export function syncGoogleCalendars(): Promise<SyncSummary> {
  running ??= runSync().finally(() => { running = null; });
  return running;
}

type SyncedEvent = {
  connectionId: string;
  account?: string;
  calendarId: string;
  event: GoogleEventRaw | { error: string };
  calendar?: GoogleCalendarContext;
};

async function runSync(): Promise<SyncSummary> {
  const none = { created: 0, updated: 0, removed: 0, failed: 0 };
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return none;
  await waitForSyncLoad(session.user.id);
  const headers = { Authorization: `Bearer ${session.access_token}` };

  let events: SyncedEvent[];
  try {
    const res = await apiFetch('/api/google-calendar-sync', { method: 'POST', headers });
    if (!res.ok) return none;
    // Same local-dev-has-no-/api/*-routing caveat as fetchGoogleCalendarConnections above.
    ({ events } = await res.json() as { events: SyncedEvent[] });
  } catch (e) {
    log.warn('googleCalendar', 'sync request failed', e);
    return none;
  }
  if (!events.length) return none;

  const zone = resolveTimezone(useSettingsStore.getState().timezone);
  const drafts: ImportDraft[] = [];
  const needInstances = new Map<string, { connectionId: string; calendarId: string; ctx: GoogleMapContext; eventIds: string[] }>();
  let failed = 0;

  for (const { connectionId, account, calendarId, event, calendar } of events) {
    if (calendarId === '__error__') { failed++; continue; }
    if (!account) continue;
    const ctx: GoogleMapContext = { account, connectionId, calendarId, zone, calendar };
    const mapped = mapGoogleEvent(event as GoogleEventRaw, ctx);
    if (mapped.kind === 'draft') drafts.push(mapped.draft);
    else if (mapped.kind === 'instances') {
      const k = `${connectionId}
${calendarId}`;
      const entry = needInstances.get(k) ?? { connectionId, calendarId, ctx, eventIds: [] };
      entry.eventIds.push((event as GoogleEventRaw).id);
      needInstances.set(k, entry);
    }
  }

  // Series the app can't show: their single dates instead, each its own event. Their changed
  // dates came in the main listing too; the single dates cover them.
  const expanded = new Set<string>();
  for (const { connectionId, calendarId, ctx, eventIds } of needInstances.values()) {
    for (const id of eventIds) expanded.add(importKey('google', ctx.account, calendarId, id));
    for (let i = 0; i < eventIds.length; i += 50) {
      try {
        const res = await apiFetch('/api/google-calendar-instances', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId, calendarId, eventIds: eventIds.slice(i, i + 50) }),
        });
        if (!res.ok) { failed++; continue; }
        const { instances } = await res.json() as { instances: { event: GoogleEventRaw }[] };
        for (const { event } of instances) {
          const mapped = mapGoogleEvent(event, { ...ctx, standalone: true });
          if (mapped.kind === 'draft') drafts.push(mapped.draft);
        }
      } catch (e) {
        log.warn('googleCalendar', 'instances request failed', e);
        failed++;
      }
    }
  }

  const userId = session.user.id;
  const result = applyImport(
    drafts.filter((d) => !d.series || !expanded.has(d.series.key)),
    { idFor: (key) => importedEventId(userId, key) },
  );
  return { ...result, failed };
}
