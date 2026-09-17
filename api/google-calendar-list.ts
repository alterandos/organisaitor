import { getValidAccessToken, fetchGoogleCalendarList } from './_lib/googleCalendar';
import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Lists the calendars available within one connected account (for the "which calendars do
// you want to sync" picker, shown right after connecting) — live from Google every time,
// not cached, so a calendar created/renamed/shared after connecting still shows up.
export default async function handler(req: Request): Promise<Response> {
  const token = bearerToken(req);
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const connectionId = new URL(req.url).searchParams.get('connectionId');
  if (!connectionId) return Response.json({ error: 'Missing connectionId' }, { status: 400 });

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

  try {
    const accessToken = await getValidAccessToken(supabase, connection);
    const calendars = await fetchGoogleCalendarList(accessToken);
    const enabled: string[] = connection.calendars_enabled ?? [];
    return Response.json({
      calendars: calendars.map((c) => ({
        id: c.id,
        name: c.summary,
        color: c.backgroundColor ?? null,
        enabled: enabled.includes(c.id),
      })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
