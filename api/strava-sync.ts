import { refreshStravaToken, mapSportType } from './_lib/strava';
import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

interface StravaActivity {
  id:            number;
  name:          string;
  sport_type?:   string;
  type?:         string;
  start_date:    string;
  distance?:     number;
  moving_time?:  number;
  elapsed_time?: number;
  average_speed?: number;
}

// Called by the "Sync now" button. Refreshes the Strava access token if it's expired
// (or about to be), fetches the most recent activities, and returns them mapped to a
// shape the client's fitnessStore.upsertBySource() can consume directly — this endpoint
// never writes to the Fitness store itself (that stays localStorage-only, client-side),
// it just does the parts that need the client secret / Strava API.
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const token = bearerToken(req);
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: connection, error: connError } = await supabase
    .from('fitness_strava_connection')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (connError || !connection) return Response.json({ error: 'Strava not connected' }, { status: 404 });

  let accessToken = connection.access_token;

  // Refresh if expired or expiring within the next 5 minutes.
  const nowSecs = Math.floor(Date.now() / 1000);
  if (connection.expires_at < nowSecs + 300) {
    try {
      const refreshed = await refreshStravaToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      await supabase.from('fitness_strava_connection').update({
        access_token:  refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at:    refreshed.expires_at,
        updated_at:    new Date().toISOString(),
      }).eq('user_id', userData.user.id);
    } catch (e) {
      return Response.json({ error: `Token refresh failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
    }
  }

  // Most recent 200 activities per sync — no pagination/incremental-since-last-sync yet
  // (Phase 2; see BACKLOG.md). Fine for keeping a Fitness log up to date via repeated
  // manual syncs, not intended as a one-shot full historical import on first connect.
  const activitiesRes = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=200', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!activitiesRes.ok) {
    return Response.json({ error: `Strava API error: ${activitiesRes.status}` }, { status: 502 });
  }

  const activities = await activitiesRes.json() as StravaActivity[];

  const mapped = activities.map((a) => ({
    type:               mapSportType(a.sport_type || a.type),
    title:               a.name,
    startedAt:           a.start_date,
    distanceMeters:      a.distance ?? null,
    movingTimeSeconds:   a.moving_time ?? null,
    elapsedTimeSeconds:  a.elapsed_time ?? null,
    averageSpeedMps:     a.average_speed ?? null,
    sourceId:            String(a.id),
    sourceRaw:           a as unknown as Record<string, unknown>,
  }));

  return Response.json({ activities: mapped });
}
