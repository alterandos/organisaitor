import { exchangeStravaCode } from './_lib/strava';
import { getAnonClient } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Strava redirects the browser here after the user approves the connection (a full page
// navigation, not a fetch — so there's no Authorization header). `state` is a single-use,
// 10-minute nonce minted by the signed-in client (mint_oauth_state, migration 032) — never a
// credential. save_strava_connection consumes it and writes the row for the user it was
// minted for; a reused, expired or wrong-provider state is rejected there.
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
    const tokens = await exchangeStravaCode(code);

    const { data, error } = await getAnonClient().rpc('save_strava_connection', {
      p_nonce:         state,
      p_athlete_id:    tokens.athlete?.id ?? 0,
      p_access_token:  tokens.access_token,
      p_refresh_token: tokens.refresh_token,
      p_expires_at:    tokens.expires_at,
      p_scope:         url.searchParams.get('scope') ?? 'activity:read',
    });

    if (error) return fail(error.message);
    if (data !== 'ok') return fail(String(data));

    return Response.redirect(`${origin}/?strava=connected`, 302);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
