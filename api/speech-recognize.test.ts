import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  let user: { id: string } | null = { id: 'u1' };
  let rpcResult: { allowed: boolean; error: { message: string } | null } = { allowed: true, error: null };
  const rpcCalls: { p_seconds: number; p_monthly_limit: number }[] = [];
  return {
    setUser: (u: typeof user) => { user = u; },
    setRpc: (r: typeof rpcResult) => { rpcResult = r; },
    rpcCalls,
    client: {
      auth: { getUser: () => Promise.resolve({ data: { user }, error: user ? null : { message: 'no user' } }) },
      rpc: (_name: string, args: { p_seconds: number; p_monthly_limit: number }) => {
        rpcCalls.push(args);
        return Promise.resolve({ data: rpcResult.allowed, error: rpcResult.error });
      },
    },
  };
});

vi.mock('./_lib/supabaseEdge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/supabaseEdge')>();
  return { ...actual, getUserClient: () => fake.client };
});

const { default: handler } = await import('./speech-recognize');

// 16 kHz mono PCM16 = 32,000 bytes/sec. Base64 encodes 3 bytes as 4 chars, so this produces
// exactly `seconds` worth of audio bytes (no padding, since 32000 is divisible by 3... it isn't,
// so pad to a multiple of 3 first to keep the byte math exact).
function fakeAudioBase64(seconds: number): string {
  const bytes = Math.floor(seconds * 32000);
  const padded = bytes - (bytes % 3);
  return Buffer.alloc(padded, 1).toString('base64');
}

const req = (body: Record<string, unknown> | null, headers: Record<string, string> = { Authorization: 'Bearer good' }) =>
  new Request('http://x/api/speech-recognize', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  fake.setUser({ id: 'u1' });
  fake.setRpc({ allowed: true, error: null });
  fake.rpcCalls.length = 0;
  vi.stubEnv('GOOGLE_SPEECH_API_KEY', 'test-key');
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ results: [{ alternatives: [{ transcript: 'hello world' }] }] }), { status: 200 }))));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('api/speech-recognize', () => {
  it('401s with no bearer token', async () => {
    const res = await handler(new Request('http://x', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('401s when the token doesn\'t resolve to a user', async () => {
    fake.setUser(null);
    const res = await handler(req({ audio: fakeAudioBase64(1) }));
    expect(res.status).toBe(401);
  });

  it('405s on anything but POST', async () => {
    const res = await handler(new Request('http://x', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('500s when the server has no Google API key configured', async () => {
    vi.stubEnv('GOOGLE_SPEECH_API_KEY', '');
    const res = await handler(req({ audio: fakeAudioBase64(1) }));
    expect(res.status).toBe(500);
  });

  it('400s on missing/empty audio, or unparseable JSON', async () => {
    expect((await handler(req({}))).status).toBe(400);
    expect((await handler(req({ audio: '' }))).status).toBe(400);
    const badJson = new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: 'not json' });
    expect((await handler(badJson)).status).toBe(400);
  });

  it('413s when the audio (by its actual byte size, not any client-claimed duration) exceeds the cap', async () => {
    const res = await handler(req({ audio: fakeAudioBase64(59) })); // > MAX_AUDIO_SECONDS (58)
    expect(res.status).toBe(413);
  });

  it('the duration used for billing/limits comes from the payload size, not anything the client sends', async () => {
    // No "duration" field exists on the request at all — proving the server can't be told a
    // false (shorter) duration to dodge the cap. 5 real seconds of audio bills a full 15s block.
    await handler(req({ audio: fakeAudioBase64(5) }));
    expect(fake.rpcCalls[0].p_seconds).toBe(15);
  });

  it('billing rounds UP to the next 15s increment for longer audio too', async () => {
    await handler(req({ audio: fakeAudioBase64(20) })); // > 15, <= 30
    expect(fake.rpcCalls[0].p_seconds).toBe(30);
  });

  it('429s when the monthly usage cap function says no', async () => {
    fake.setRpc({ allowed: false, error: null });
    const res = await handler(req({ audio: fakeAudioBase64(1) }));
    expect(res.status).toBe(429);
  });

  it('503s if the usage-check call itself fails, rather than silently allowing unmetered use', async () => {
    fake.setRpc({ allowed: true, error: { message: 'db down' } });
    const res = await handler(req({ audio: fakeAudioBase64(1) }));
    expect(res.status).toBe(503);
  });

  it('an invalid language code falls back to en-US rather than being sent to Google as-is', async () => {
    await handler(req({ audio: fakeAudioBase64(1), language: '<script>' }));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.config.languageCode).toBe('en-US');
  });

  it('502s when Google\'s API call itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 500 }))));
    const res = await handler(req({ audio: fakeAudioBase64(1) }));
    expect(res.status).toBe(502);
  });

  it('returns the joined transcript text on success', async () => {
    const res = await handler(req({ audio: fakeAudioBase64(1) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'hello world' });
  });
});
