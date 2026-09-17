import { exchangeGoogleCode, fetchGoogleAccountEmail } from './_lib/googleCalendar';
import { getUserClient } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Google redirects the browser here after the user approves the connection (a full page
// navigation, not a fetch — so there's no Authorization header). `state` carries the
// user's Supabase access token instead (set by the client when it built the authorize
// URL); used to identify who's connecting and to make the DB write as that user, so RLS
// applies normally — same "redirect-identity problem" fix the Strava integration already
// uses (see CLAUDE.md).
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
    const supabase = getUserClient(state);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return fail('session_expired');

    const redirectUri = `${origin}/api/google-calendar-oauth-callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const accountEmail = await fetchGoogleAccountEmail(tokens.access_token);
    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    // Google only re-issues a refresh_token when prompt=consent forces it (the client
    // always requests this — see src/services/googleCalendar.ts), but fall back to
    // preserving whatever's already stored just in case a given request doesn't return one.
    let refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      const { data: existing } = await supabase
        .from('calendar_connections')
        .select('refresh_token')
        .eq('user_id', userData.user.id)
        .eq('provider', 'google')
        .eq('account_email', accountEmail)
        .maybeSingle();
      refreshToken = existing?.refresh_token;
    }
    if (!refreshToken) return fail('no_refresh_token');

    const { error: upsertError } = await supabase.from('calendar_connections').upsert({
      user_id:       userData.user.id,
      provider:      'google',
      account_email: accountEmail,
      access_token:  tokens.access_token,
      refresh_token: refreshToken,
      expires_at:    expiresAt,
      scope:         tokens.scope,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id,provider,account_email' });

    if (upsertError) return fail(upsertError.message);

    return Response.redirect(`${origin}/?googleCalendar=connected`, 302);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
