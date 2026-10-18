import { fetchSeries, getValidMicrosoftAccessToken, microsoftWindow } from './_lib/microsoftCalendar';
import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// POST { connectionId, calendarId, seriesIds: string[] } → { series: [{ id, master, instances } | { id, deleted: true }], window }.
// Repeating Outlook events: each one's rule (the series master) and its dates in the window
// (src/services/calendarImport/microsoft.ts turns them into a native series, its changed dates
// and its deleted ones). Bearer-authenticated; the connection must be the caller's.
const MAX_SERIES = 20;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const token = bearerToken(req);
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null) as { connectionId?: unknown; calendarId?: unknown; seriesIds?: unknown } | null;
  const { connectionId, calendarId, seriesIds } = body ?? {};
  if (typeof connectionId !== 'string' || typeof calendarId !== 'string' || !Array.isArray(seriesIds)
    || seriesIds.length > MAX_SERIES || !seriesIds.every((id) => typeof id === 'string')) {
    return Response.json({ error: 'Missing or invalid connectionId, calendarId or seriesIds' }, { status: 400 });
  }

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: connection, error: connError } = await supabase
    .from('calendar_connections')
    .select('id, access_token, refresh_token, expires_at, calendars_enabled')
    .eq('id', connectionId)
    .eq('user_id', userData.user.id)
    .eq('provider', 'microsoft')
    .maybeSingle();
  if (connError || !connection) return Response.json({ error: 'Connection not found' }, { status: 404 });
  if (!(connection.calendars_enabled ?? []).includes(calendarId)) return Response.json({ error: 'Calendar not enabled' }, { status: 400 });

  try {
    const accessToken = await getValidMicrosoftAccessToken(supabase, connection);
    const window = microsoftWindow();
    const series = [];
    for (const id of seriesIds as string[]) {
      const s = await fetchSeries(accessToken, id, window);
      series.push(s ? { id, ...s } : { id, deleted: true });
    }
    return Response.json({ series, window });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
