import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
  platform: 'web',
  request: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => cap.platform },
  CapacitorHttp: { request: cap.request },
}));

import { apiFetch, oauthRedirectOrigin, PRODUCTION_API_ORIGIN } from './apiFetch';

const fetchMock = vi.fn();

beforeEach(() => {
  cap.platform = 'web';
  cap.request.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { origin: 'https://preview.example.app' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch on the web', () => {
  it('uses a plain same-origin fetch', async () => {
    const res = new Response('{}');
    fetchMock.mockResolvedValue(res);
    const init = { headers: { Authorization: 'Bearer t' } };

    expect(await apiFetch('/api/strava-status', init)).toBe(res);
    expect(fetchMock).toHaveBeenCalledWith('/api/strava-status', init);
    expect(cap.request).not.toHaveBeenCalled();
  });

  it('uses the page origin for OAuth redirects', () => {
    expect(oauthRedirectOrigin()).toBe('https://preview.example.app');
  });
});

describe('apiFetch on Android', () => {
  beforeEach(() => { cap.platform = 'android'; });

  it('calls the production origin through CapacitorHttp, not fetch', async () => {
    cap.request.mockResolvedValue({ status: 200, headers: {}, data: '[]', url: '' });

    await apiFetch('/api/ticker-search?q=abc');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(cap.request).toHaveBeenCalledWith(expect.objectContaining({
      url: `${PRODUCTION_API_ORIGIN}/api/ticker-search?q=abc`,
      method: 'GET',
      data: undefined,
    }));
  });

  it('sends a JSON string body as the parsed value, with headers and method', async () => {
    cap.request.mockResolvedValue({ status: 200, headers: {}, data: '{}', url: '' });
    const audio = 'AAEC'.repeat(1000);

    await apiFetch('/api/speech-recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify({ audio, language: 'en-AU' }),
    });

    expect(cap.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
      data: { audio, language: 'en-AU' },
    }));
  });

  it('keeps status, headers and a JSON body that arrives as text', async () => {
    cap.request.mockResolvedValue({
      status: 401, headers: { 'Content-Type': 'application/json' }, data: '{"error":"unauthorized"}', url: '',
    });

    const res = await apiFetch('/api/strava-sync', { method: 'POST' });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('keeps a JSON body the native side already parsed', async () => {
    cap.request.mockResolvedValue({ status: 200, headers: {}, data: { connections: [{ id: 'c1' }] }, url: '' });

    const res = await apiFetch('/api/google-calendar-status');

    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ connections: [{ id: 'c1' }] });
  });

  it('handles a status that cannot carry a body', async () => {
    cap.request.mockResolvedValue({ status: 204, headers: {}, data: '', url: '' });
    const res = await apiFetch('/api/google-calendar-set-enabled', { method: 'POST' });
    expect(res.status).toBe(204);
  });

  it('leaves non-/api paths as plain fetches', async () => {
    fetchMock.mockResolvedValue(new Response('{}'));
    await apiFetch('/yf/v1/finance/search?q=a');
    expect(fetchMock).toHaveBeenCalled();
    expect(cap.request).not.toHaveBeenCalled();
  });

  it('uses the production origin for OAuth redirects', () => {
    expect(oauthRedirectOrigin()).toBe(PRODUCTION_API_ORIGIN);
  });
});
