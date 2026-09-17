import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Toggles one calendar within a connection on/off for syncing — reads the current
// calendars_enabled array and adds/removes the given calendarId, rather than requiring the
// client to send the whole array (which could race against a concurrent list-fetch).
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const token = bearerToken(req);
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { connectionId, calendarId, enabled } = await req.json() as { connectionId?: string; calendarId?: string; enabled?: boolean };
  if (!connectionId || !calendarId || typeof enabled !== 'boolean') {
    return Response.json({ error: 'Missing connectionId, calendarId, or enabled' }, { status: 400 });
  }

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: connection, error: connError } = await supabase
    .from('calendar_connections')
    .select('calendars_enabled')
    .eq('id', connectionId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (connError || !connection) return Response.json({ error: 'Connection not found' }, { status: 404 });

  const current: string[] = connection.calendars_enabled ?? [];
  const next = enabled
    ? [...new Set([...current, calendarId])]
    : current.filter((id) => id !== calendarId);

  const { error: updateError } = await supabase
    .from('calendar_connections')
    .update({ calendars_enabled: next, updated_at: new Date().toISOString() })
    .eq('id', connectionId);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
  return Response.json({ calendarsEnabled: next });
}
