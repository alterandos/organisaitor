import { exchangeMicrosoftCode, fetchMicrosoftAccountEmail } from './_lib/microsoftCalendar';
import { getAnonClient } from './_lib/supabaseEdge';
import { discardState, oauthReturn, parseSaveResult } from './_lib/oauthReturn';

export const config = { runtime: 'edge' };

// Microsoft redirects the browser here after the user approves the Outlook connection. Same flow
// as api/google-calendar-oauth-callback.ts: `state` is a single-use nonce (mint_oauth_state,
// migrations 032/041/052) that save_microsoft_calendar_connection consumes (migration 052).
export default async function handler(req: Request): Promise<Response> {
  const url   = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const authError = url.searchParams.get('error');
  const origin = url.origin;

  const fail = async (reason: string) => oauthReturn(origin, await discardState(state), 'microsoft-calendar', 'error', reason);

  // A work account whose organisation hasn't allowed the app comes back with an error here
  // (consent_required, access_denied); Microsoft's description is shown to the user.
  if (authError) return fail(url.searchParams.get('error_description') ?? authError);
  if (!code || !state) return fail('missing_params');

  try {
    const redirectUri = `${origin}/api/microsoft-calendar-oauth-callback`;
    const tokens = await exchangeMicrosoftCode(code, redirectUri);
    const accountEmail = await fetchMicrosoftAccountEmail(tokens.access_token);
    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    const { data, error } = await getAnonClient().rpc('save_microsoft_calendar_connection', {
      p_nonce:         state,
      p_account_email: accountEmail,
      p_access_token:  tokens.access_token,
      p_refresh_token: tokens.refresh_token ?? null,
      p_expires_at:    expiresAt,
      p_scope:         tokens.scope,
    });

    if (error) return fail(error.message);
    const result = parseSaveResult(data);
    if (!result.ok) return fail(result.reason);

    return oauthReturn(origin, result.client, 'microsoft-calendar', 'connected');
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
