import { exchangeStravaCode } from './_lib/strava';
import { getUserClient } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Strava redirects the browser here after the user approves the connection (a full page
// navigation, not a fetch — so there's no Authorization header). `state` carries the
// user's Supabase access token instead (set by the client when it builds the authorize
// URL); we use it to identify who's connecting and to make the DB write as that user,
// so RLS applies normally. See BACKLOG.md "Fitness App" for the full OAuth flow.
export default async function handler(req: Request): Promise<Response> {
  const url   = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const authError = url.searchParams.get('error');
  const origin = url.origin;

  const fail = (reason: string) => Response.redirect(`${origin}/?strava=error&reason=${encodeURIComponent(reason)}`, 302);

  if (authError) return fail(authError);
  if (!code || !state) return fail('missing_params');

  try {
    const supabase = getUserClient(state);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return fail('session_expired');

    const tokens = await exchangeStravaCode(code);

    const { error: upsertError } = await supabase.from('fitness_strava_connection').upsert({
      user_id:       userData.user.id,
      athlete_id:    tokens.athlete?.id ?? 0,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    tokens.expires_at,
      scope:         url.searchParams.get('scope') ?? 'activity:read',
      updated_at:    new Date().toISOString(),
    });

    if (upsertError) return fail(upsertError.message);

    return Response.redirect(`${origin}/?strava=connected`, 302);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
