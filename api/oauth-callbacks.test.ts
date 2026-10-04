import { beforeEach, describe, expect, it, vi } from 'vitest';

// Both OAuth callbacks: where the user is sent once the connection is saved (or fails) — the web
// app as before, or back into the Android app (migration 041, decision D5).
const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('./_lib/supabaseEdge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/supabaseEdge')>();
  return { ...actual, getAnonClient: () => ({ rpc: fake.rpc }) };
});
vi.mock('./_lib/strava', () => ({
  exchangeStravaCode: () => Promise.resolve({ access_token: 'a', refresh_token: 'r', expires_at: 1, athlete: { id: 7 } }),
}));
vi.mock('./_lib/googleCalendar', () => ({
  exchangeGoogleCode: () => Promise.resolve({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 's' }),
  fetchGoogleAccountEmail: () => Promise.resolve('me@example.com'),
}));

const { default: strava } = await import('./strava-oauth-callback');
const { default: google } = await import('./google-calendar-oauth-callback');

// rpc results by function name; anything not listed fails the way a missing function does.
function rpcReturns(results: Record<string, unknown>) {
  fake.rpc.mockImplementation((fn: string) => Promise.resolve(
    fn in results ? { data: results[fn], error: null } : { data: null, error: { message: `function ${fn} not found` } },
  ));
}

beforeEach(() => fake.rpc.mockReset());

const ORIGIN = 'https://organisaitor.vercel.app';

describe.each([
  { name: 'strava', handler: strava, path: 'strava-oauth-callback', save: 'save_strava_connection', webParam: 'strava', provider: 'strava' },
  { name: 'google', handler: google, path: 'google-calendar-oauth-callback', save: 'save_calendar_connection', webParam: 'googleCalendar', provider: 'google-calendar' },
])('api/$path', ({ handler, path, save, webParam, provider }) => {
  const req = (query: string) => new Request(`${ORIGIN}/api/${path}?${query}`);

  it('a web flow redirects to the web app exactly as before', async () => {
    rpcReturns({ [save]: 'ok' });
    const res = await handler(req('code=c&state=n'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?${webParam}=connected`);
  });

  it('an Android flow returns to the app through organisaitor://oauth-done', async () => {
    rpcReturns({ [save]: 'ok:android' });
    const res = await handler(req('code=c&state=n'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`organisaitor://oauth-done?provider=${provider}&#38;status=connected`);
    expect(html).toContain(`location.replace("organisaitor://oauth-done?provider=${provider}&status=connected")`);
  });

  it('a provider error in an Android flow consumes the nonce and returns to the app with the reason', async () => {
    rpcReturns({ discard_oauth_state: 'android' });
    const res = await handler(req('error=access_denied&state=n'));
    expect(fake.rpc).toHaveBeenCalledWith('discard_oauth_state', { p_nonce: 'n' });
    expect(await res.text()).toContain(`provider=${provider}&status=error&reason=access_denied`);
  });

  it('falls back to the web app when migration 041 has not run (no discard function)', async () => {
    rpcReturns({});
    const res = await handler(req('error=access_denied&state=n'));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?${webParam}=error&reason=access_denied`);
  });

  it('a rejected state goes to the web app with the reason', async () => {
    rpcReturns({ [save]: 'invalid_state', discard_oauth_state: null });
    const res = await handler(req('code=c&state=n'));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?${webParam}=error&reason=invalid_state`);
  });

  it('missing params never call the database to discard', async () => {
    const res = await handler(req(''));
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?${webParam}=error&reason=missing_params`);
  });
});
