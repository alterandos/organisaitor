import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Connection metadata only — never returns tokens. The client uses this to render the
// "Imported calendars" list (CalendarSidePane) without ever reading the connections table
// directly (that's the discipline this endpoint exists to enforce, same as strava-status.ts).
export default async function handler(req: Request): Promise<Response> {
  const token = bearerToken(req);
  if (!token) return Response.json({ connections: [] }, { status: 401 });

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ connections: [] }, { status: 401 });

  const { data, error } = await supabase
    .from('calendar_connections')
    .select('id, provider, account_email, calendars_enabled, created_at')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: true });

  if (error) return Response.json({ connections: [] });

  return Response.json({
    connections: (data ?? []).map((c) => ({
      id: c.id,
      provider: c.provider,
      accountEmail: c.account_email,
      calendarsEnabled: c.calendars_enabled ?? [],
      createdAt: c.created_at,
    })),
  });
}
