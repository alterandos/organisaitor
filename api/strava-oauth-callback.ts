import { exchangeStravaCode } from './_lib/strava';
import { getAnonClient } from './_lib/supabaseEdge';
import { discardState, oauthReturn, parseSaveResult } from './_lib/oauthReturn';

export const config = { runtime: 'edge' };

// Strava redirects the browser here after the user approves the connection (a full page
// navigation, not a fetch — so there's no Authorization header). `state` is a single-use,
// 10-minute nonce minted by the signed-in client (mint_oauth_state, migration 032) — never a
// credential. save_strava_connection consumes it and writes the row for the user it was
// minted for; a reused, expired or wrong-provider state is rejected there. Where the user goes
// next (the web app, or back into the Android app) depends on where the flow started — see
// _lib/oauthReturn.ts and migration 041.
export default async function handler(req: Request): Promise<Response> {
  const url   = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const authError = url.searchParams.get('error');
  const origin = url.origin;

  const fail = async (reason: string) => oauthReturn(origin, await discardState(state), 'strava', 'error', reason);

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
    const result = parseSaveResult(data);
    if (!result.ok) return fail(result.reason);

    return oauthReturn(origin, result.client, 'strava', 'connected');
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
