import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

const GOOGLE_RECOGNIZE_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const SAMPLE_RATE = 16000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2; // 16-bit mono
const MAX_AUDIO_SECONDS = 58;             // Google's synchronous limit is 60
// Google's v1 API bills each request rounded up to the next 15 s, so that is what the cap counts —
// a 2 s utterance uses 15 s of the free tier, not 2.
const BILLING_INCREMENT_SECONDS = 15;
// Default just under Google's 60 free minutes a month; override with SPEECH_MONTHLY_SECONDS.
const DEFAULT_MONTHLY_LIMIT_SECONDS = 3300;

const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

// Dictation only — takes one utterance of 16 kHz mono PCM16 (base64) and returns its text.
// Holds the only copy of the Google API key, so this is also where the usage cap lives.
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: 'unauthorized' }, 401);

  const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
  if (!apiKey) return json({ error: 'not-configured' }, 500);

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  let body: { audio?: unknown; language?: unknown };
  try {
    body = await req.json() as { audio?: unknown; language?: unknown };
  } catch {
    return json({ error: 'bad-request' }, 400);
  }

  const audio = typeof body.audio === 'string' ? body.audio : '';
  const language = typeof body.language === 'string' && LANGUAGE_PATTERN.test(body.language)
    ? body.language
    : 'en-US';
  if (!audio) return json({ error: 'bad-request' }, 400);

  // Duration comes from the payload size, never from anything the client claims.
  const padding = audio.endsWith('==') ? 2 : audio.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((audio.length * 3) / 4) - padding;
  const seconds = bytes / BYTES_PER_SECOND;
  if (seconds > MAX_AUDIO_SECONDS) return json({ error: 'too-long' }, 413);

  const billedSeconds = Math.max(
    BILLING_INCREMENT_SECONDS,
    Math.ceil(seconds / BILLING_INCREMENT_SECONDS) * BILLING_INCREMENT_SECONDS,
  );
  const monthlyLimit = Number(process.env.SPEECH_MONTHLY_SECONDS) || DEFAULT_MONTHLY_LIMIT_SECONDS;

  const { data: allowed, error: usageError } = await supabase.rpc('record_speech_usage', {
    p_seconds: billedSeconds,
    p_monthly_limit: monthlyLimit,
  });
  if (usageError) {
    console.error('speech usage check failed', usageError.message);
    return json({ error: 'usage-unavailable' }, 503);
  }
  if (!allowed) return json({ error: 'limit-reached' }, 429);

  const config: Record<string, unknown> = {
    encoding: 'LINEAR16',
    sampleRateHertz: SAMPLE_RATE,
    languageCode: language,
    enableAutomaticPunctuation: true,
    maxAlternatives: 1,
  };
  if (process.env.GOOGLE_SPEECH_MODEL) config.model = process.env.GOOGLE_SPEECH_MODEL;

  const googleRes = await fetch(`${GOOGLE_RECOGNIZE_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, audio: { content: audio } }),
  });
  if (!googleRes.ok) {
    console.error('google speech failed', googleRes.status, await googleRes.text());
    return json({ error: 'recognition-failed' }, 502);
  }

  const result = (await googleRes.json()) as {
    results?: { alternatives?: { transcript?: string }[] }[];
  };
  const text = (result.results ?? [])
    .map((r) => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim();

  return json({ text }, 200);
}
