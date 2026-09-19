import { getValidAccessToken, fetchGoogleCalendarEvents, fetchGoogleCalendarList } from './_lib/googleCalendar';
import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Called while the app is open (on load + a periodic interval — see src/App.tsx), not a
// server-side cron: this app has no service-role Supabase credential anywhere, and running
// this only while a session is open keeps it that way. Syncs every enabled calendar across
// every one of the user's connections in one call, and returns the raw events —
// this endpoint never writes to calendarStore itself (that stays client-side, same
// boundary api/strava-sync.ts already draws); date/time extraction and timezone
// conversion (the account's effective zone, a client-only setting) happen client-side too,
// in src/services/googleCalendar.ts.
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const token = bearerToken(req);
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: connections, error: connError } = await supabase
    .from('calendar_connections')
    .select('id, access_token, refresh_token, expires_at, calendars_enabled')
    .eq('user_id', userData.user.id);

  if (connError) return Response.json({ error: connError.message }, { status: 500 });
  if (!connections || connections.length === 0) return Response.json({ events: [] });

  const results: { connectionId: string; calendarId: string; event: unknown; calendar?: unknown }[] = [];

  for (const connection of connections) {
    const enabledCalendars: string[] = connection.calendars_enabled ?? [];
    if (enabledCalendars.length === 0) continue;
    try {
      const accessToken = await getValidAccessToken(supabase, connection);
      // Each calendar's default reminders and our access level on it: an event that says "use the
      // default reminders" carries no times of its own, so the client needs the calendar's.
      const calendarList = await fetchGoogleCalendarList(accessToken);
      for (const calendarId of enabledCalendars) {
        const entry = calendarList.find((c) => c.id === calendarId);
        const calendar = { defaultReminders: entry?.defaultReminders, accessRole: entry?.accessRole };
        const events = await fetchGoogleCalendarEvents(accessToken, calendarId);
        for (const event of events) {
          // Cancelled instances of an expanded recurring event still come back from the
          // API (singleEvents=true) — skip them rather than importing a "cancelled" event.
          if (event.status === 'cancelled') continue;
          results.push({ connectionId: connection.id, calendarId, event, calendar });
        }
      }
    } catch (e) {
      // One connection's failure (e.g. a revoked token) shouldn't block the others —
      // skip it and let the rest of the sync proceed; the client can surface a partial-
      // failure message if `errors` is non-empty.
      results.push({ connectionId: connection.id, calendarId: '__error__', event: { error: e instanceof Error ? e.message : String(e) } });
    }
  }

  return Response.json({ events: results });
}
