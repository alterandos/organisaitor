import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Connection status only — never returns tokens. The client uses this to decide
// whether to show "Connect Strava" or "Sync now" without ever reading the tokens table
// directly (that's the discipline this endpoint exists to enforce).
export default async function handler(req: Request): Promise<Response> {
  const token = bearerToken(req);
  if (!token) return Response.json({ connected: false }, { status: 401 });

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ connected: false }, { status: 401 });

  const { data, error } = await supabase
    .from('fitness_strava_connection')
    .select('athlete_id, created_at')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error || !data) return Response.json({ connected: false });

  return Response.json({ connected: true, athleteId: data.athlete_id, connectedAt: data.created_at });
}
