import { supabase } from '@/services/supabase';
import { apiFetch } from '@/utils/apiFetch';
import { SpeechError, type SpeechEngine, type SpeechErrorCode } from '../types';

function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const ERROR_CODES: Record<string, SpeechErrorCode> = {
  unauthorized: 'signed-out',
  'limit-reached': 'limit-reached',
  'not-configured': 'not-configured',
  'usage-unavailable': 'unavailable',
};

// Sends one utterance to api/speech-recognize.ts, which holds the Google API key and enforces
// the per-user monthly cap. See CLAUDE.md "Voice dictation".
export const googleEngine: SpeechEngine = {
  async transcribe(pcm, { language }) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new SpeechError('signed-out');

    let res: Response;
    try {
      res = await apiFetch('/api/speech-recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audio: toBase64(pcm), language }),
      });
    } catch {
      throw new SpeechError('unavailable');
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new SpeechError(ERROR_CODES[body.error ?? ''] ?? 'failed');
    }
    const { text } = (await res.json()) as { text?: string };
    return text ?? '';
  },
};
