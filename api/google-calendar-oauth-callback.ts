import { exchangeGoogleCode, fetchGoogleAccountEmail } from './_lib/googleCalendar';
import { getAnonClient } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Google redirects the browser here after the user approves the connection (a full page
// navigation, not a fetch — so there's no Authorization header). `state` is a single-use,
// 10-minute nonce minted by the signed-in client (mint_oauth_state, migration 032) — never a
// credential. save_calendar_connection consumes it and writes the row for the user it was
// minted for; a reused, expired or wrong-provider state is rejected there. Same flow as the
// Strava callback.
export default async function handler(req: Request): Promise<Response> {
  const url   = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const authError = url.searchParams.get('error');
  const origin = url.origin;

  const fail = (reason: string) => Response.redirect(`${origin}/?googleCalendar=error&reason=${encodeURIComponent(reason)}`, 302);

  if (authError) return fail(authError);
  if (!code || !state) return fail('missing_params');

  try {
    const redirectUri = `${origin}/api/google-calendar-oauth-callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const accountEmail = await fetchGoogleAccountEmail(tokens.access_token);
    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    // Google only re-issues a refresh_token when prompt=consent forces it (the client always
    // requests this — see src/services/googleCalendar.ts); when a response carries none,
    // save_calendar_connection keeps the one already stored for this account.
    const { data, error } = await getAnonClient().rpc('save_calendar_connection', {
      p_nonce:         state,
      p_account_email: accountEmail,
      p_access_token:  tokens.access_token,
      p_refresh_token: tokens.refresh_token ?? null,
      p_expires_at:    expiresAt,
      p_scope:         tokens.scope,
    });

    if (error) return fail(error.message);
    if (data !== 'ok') return fail(String(data));

    return Response.redirect(`${origin}/?googleCalendar=connected`, 302);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
