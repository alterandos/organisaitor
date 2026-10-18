import { getValidAccessToken, fetchGoogleEventInstances } from './_lib/googleCalendar';
import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// POST { connectionId, calendarId, eventIds: string[] } → { instances: [{ eventId, event }] }.
// The single dates (in the sync window) of repeating events whose rule the app can't show as a
// series (src/services/calendarImport/google.ts, kind 'instances'). Bearer-authenticated; the
// connection must be the caller's.
const MAX_EVENTS = 50;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const token = bearerToken(req);
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null) as { connectionId?: unknown; calendarId?: unknown; eventIds?: unknown } | null;
  const { connectionId, calendarId, eventIds } = body ?? {};
  if (typeof connectionId !== 'string' || typeof calendarId !== 'string' || !Array.isArray(eventIds)
    || eventIds.length > MAX_EVENTS || !eventIds.every((id) => typeof id === 'string')) {
    return Response.json({ error: 'Missing or invalid connectionId, calendarId or eventIds' }, { status: 400 });
  }

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: connection, error: connError } = await supabase
    .from('calendar_connections')
    .select('id, access_token, refresh_token, expires_at, calendars_enabled')
    .eq('id', connectionId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (connError || !connection) return Response.json({ error: 'Connection not found' }, { status: 404 });
  if (!(connection.calendars_enabled ?? []).includes(calendarId)) return Response.json({ error: 'Calendar not enabled' }, { status: 400 });

  try {
    const accessToken = await getValidAccessToken(supabase, connection);
    const instances: { eventId: string; event: unknown }[] = [];
    for (const eventId of eventIds as string[]) {
      for (const event of await fetchGoogleEventInstances(accessToken, calendarId, eventId)) instances.push({ eventId, event });
    }
    return Response.json({ instances });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
