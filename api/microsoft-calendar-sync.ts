import {
  DeltaExpiredError, fetchCalendarDelta, fetchMicrosoftCalendars, getValidMicrosoftAccessToken, microsoftWindow, WINDOW_PAST_DAYS,
  type MicrosoftEvent,
} from './_lib/microsoftCalendar';
import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// POST { cursors?: { [connectionId]: { [calendarId]: { link, windowStart } } } }
// For every enabled calendar of every Microsoft connection, what changed since the cursor the
// client sends (Graph's calendarView delta, decided with the user 2026-10-18): changed single
// events, the ids of removed events, and the repeating series that changed (their rules and dates
// come from api/microsoft-calendar-series.ts). Returns each calendar's next cursor.
//
// The cursor lives on the device, not here: it only moves once the client has applied what it was
// given, so nothing is lost if the app closes in between, and each device follows its own.
// A delta link stays bound to the window it started with, so after a week it is drained and a new
// one started over the current window.
// A cursor's windowStart is its window's first day (30 days before it was made), so it is a
// week old once windowStart is 37 days back.
const RESTART_AFTER_MS = (WINDOW_PAST_DAYS + 7) * 86_400_000;
const MAX_CALENDARS = 30;

interface Cursor { link: string; windowStart: string }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const token = bearerToken(req);
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { cursors?: Record<string, Record<string, Cursor>> };
  const cursors = body.cursors && typeof body.cursors === 'object' ? body.cursors : {};

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: connections, error: connError } = await supabase
    .from('calendar_connections')
    .select('id, account_email, access_token, refresh_token, expires_at, calendars_enabled')
    .eq('user_id', userData.user.id)
    .eq('provider', 'microsoft');
  if (connError) return Response.json({ error: connError.message }, { status: 500 });

  const calendars: unknown[] = [];
  const errors: { connectionId: string; error: string }[] = [];
  let count = 0;

  for (const connection of connections ?? []) {
    const enabled: string[] = connection.calendars_enabled ?? [];
    if (enabled.length === 0) continue;
    try {
      const accessToken = await getValidMicrosoftAccessToken(supabase, connection);
      const list = await fetchMicrosoftCalendars(accessToken);
      for (const calendarId of enabled) {
        if (++count > MAX_CALENDARS) break;
        const entry = list.find((c) => c.id === calendarId);
        const prior = cursors[connection.id]?.[calendarId];
        const changed: MicrosoftEvent[] = [];
        const removed: string[] = [];
        let window = microsoftWindow();
        let link: string | null = null;
        let reset = !prior;

        if (prior && typeof prior.link === 'string') {
          try {
            const old = await fetchCalendarDelta(accessToken, calendarId, prior.link, window);
            changed.push(...old.changed);
            removed.push(...old.removed);
            if (Date.now() - Date.parse(prior.windowStart) < RESTART_AFTER_MS) {
              link = old.deltaLink;
              window = { ...window, start: prior.windowStart };
            }
          } catch (e) {
            if (!(e instanceof DeltaExpiredError)) throw e;
            reset = true;
          }
        }
        if (!link) {
          const fresh = await fetchCalendarDelta(accessToken, calendarId, null, window);
          changed.push(...fresh.changed);
          removed.push(...fresh.removed);
          link = fresh.deltaLink;
        }

        const seriesIds = [...new Set(changed.flatMap((e) => (e.type === 'seriesMaster' ? [e.id] : e.seriesMasterId ? [e.seriesMasterId] : [])))];
        calendars.push({
          connectionId: connection.id,
          account: connection.account_email,
          calendarId,
          calendar: { name: entry?.name, color: entry?.hexColor || null, canEdit: entry?.canEdit },
          changed: changed.filter((e) => e.type === 'singleInstance' || (!e.type && !e.seriesMasterId)),
          removed,
          seriesIds,
          cursor: { link, windowStart: window.start },
          reset,
        });
      }
    } catch (e) {
      errors.push({ connectionId: connection.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return Response.json({ calendars, errors });
}
