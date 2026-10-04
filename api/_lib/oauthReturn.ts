import { getAnonClient } from './supabaseEdge';

// Where an OAuth callback sends the user once it's done (migration 041). A flow started from the
// web app (or desktop) goes back to the web app with `?<webParam>=connected|error`, as it always
// has. A flow started from the Android app returns to the app through its custom scheme,
// organisaitor://oauth-done (src/services/android/deepLinks.ts routes it).

export type OAuthClient = 'web' | 'android';
export type OAuthReturnProvider = 'strava' | 'google-calendar';

const WEB_PARAM: Record<OAuthReturnProvider, string> = {
  strava: 'strava',
  'google-calendar': 'googleCalendar',
};

// A save function's result: 'ok' (web), 'ok:<client>' (another client), or an error code.
export function parseSaveResult(data: unknown): { ok: true; client: OAuthClient } | { ok: false; reason: string } {
  if (data === 'ok') return { ok: true, client: 'web' };
  if (data === 'ok:android') return { ok: true, client: 'android' };
  return { ok: false, reason: String(data) };
}

// On failure the nonce may still be live (the provider reported an error, or the token exchange
// threw), so consume it to learn where the flow started. Unknown, already used, or migration 041
// not run yet: the web app, as before.
export async function discardState(state: string | null): Promise<OAuthClient> {
  if (!state) return 'web';
  try {
    const { data, error } = await getAnonClient().rpc('discard_oauth_state', { p_nonce: state });
    return !error && data === 'android' ? 'android' : 'web';
  } catch {
    return 'web';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function oauthReturn(
  origin: string,
  client: OAuthClient,
  provider: OAuthReturnProvider,
  status: 'connected' | 'error',
  reason?: string,
): Response {
  if (client === 'web') {
    const query = `${WEB_PARAM[provider]}=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`;
    return Response.redirect(`${origin}/?${query}`, 302);
  }

  const params = new URLSearchParams({ provider, status });
  if (reason) params.set('reason', reason);
  const appUrl = `organisaitor://oauth-done?${params.toString()}`;
  // A page rather than a bare 302: if the browser won't open the app without a tap, the link is
  // there to tap. The script covers the usual case where it will.
  const href = escapeHtml(appUrl);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Organisaitor</title>
<style>body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:90vh;margin:0;padding:16px;text-align:center}a{display:inline-block;margin-top:16px;padding:12px 24px;border-radius:8px;background:#6366f1;color:#fff;text-decoration:none;font-weight:600}</style>
</head><body>
<p>${status === 'connected' ? 'Connected.' : 'The connection didn&#39;t complete.'}</p>
<a href="${href}">Return to Organisaitor</a>
<script>location.replace(${JSON.stringify(appUrl).replace(/</g, '\\u003c')});</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
