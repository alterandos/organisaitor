import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key || url.includes('your-project-ref')) {
  console.warn('[Supabase] Credentials not configured — cloud sync disabled. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
}

// Circuit breaker: if the auth token endpoint fails outright (DNS/network error — not an
// HTTP error response, which still resolves normally) several times in a row, stop
// autoRefreshToken's retry loop for a cooldown instead of letting it keep retrying every
// few seconds forever. This covers the case a plain online/offline listener can't: the
// browser still reports "online" (other hosts work fine) but this specific project host
// doesn't resolve at all — e.g. a deleted/paused Supabase project or a stale project ref.
const AUTH_FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000;
let consecutiveAuthFailures = 0;

const circuitBreakerFetch: typeof fetch = async (input, init) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    const res = await fetch(input, init);
    if (href.includes('/auth/v1/')) consecutiveAuthFailures = 0;
    return res;
  } catch (err) {
    if (href.includes('/auth/v1/')) {
      consecutiveAuthFailures += 1;
      if (consecutiveAuthFailures >= AUTH_FAILURE_THRESHOLD) {
        supabase.auth.stopAutoRefresh();
        console.warn(`[Supabase] Auth endpoint unreachable ${consecutiveAuthFailures} times in a row — pausing token refresh for ${COOLDOWN_MS / 60000} minute(s). Check that VITE_SUPABASE_URL points to a project that still exists.`);
        setTimeout(() => {
          consecutiveAuthFailures = 0;
          supabase.auth.startAutoRefresh();
        }, COOLDOWN_MS);
      }
    }
    throw err;
  }
};

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', key ?? 'placeholder', {
  global: { fetch: circuitBreakerFetch },
});

export const isSupabaseConfigured = !!url && !!key && !url.includes('your-project-ref');

// GoTrueClient's autoRefreshToken keeps retrying on its own schedule regardless of
// connectivity, which spams the console with repeated ERR_NAME_NOT_RESOLVED / "Failed
// to fetch" errors while offline. Pausing/resuming on browser online/offline events is
// Supabase's documented pattern for this (normally used for RN AppState) — it stops the
// retry loop while there's no network and resumes it the moment connectivity returns.
// (This alone doesn't cover the "specific host unreachable, rest of the internet fine"
// case — that's what the circuit breaker above is for.)
if (typeof window !== 'undefined') {
  if (!navigator.onLine) supabase.auth.stopAutoRefresh();
  window.addEventListener('online', () => supabase.auth.startAutoRefresh());
  window.addEventListener('offline', () => supabase.auth.stopAutoRefresh());
}
