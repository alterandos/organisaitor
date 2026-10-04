import { Capacitor, CapacitorHttp } from '@capacitor/core';

// `/api/*` Vercel Edge Functions only exist on an actual deployment — a relative fetch
// resolves against whatever origin the page was loaded from, which works fine for the
// browser PWA (same origin as the deployment) but not for the packaged apps, which load static
// files with no backend of their own: Tauri (frontendDist, no dev server) and Android (served
// from https://localhost by Capacitor). Both call the production deployment's absolute URL
// through a native HTTP client instead of the webview's — a native request isn't subject to
// browser CORS, so this needs no server-side changes. Tauri uses @tauri-apps/plugin-http (scope
// widened in src-tauri/capabilities/default.json); Android uses CapacitorHttp, called directly
// here rather than enabled globally in capacitor.config.ts, which would patch every fetch
// (Supabase included).
export const PRODUCTION_API_ORIGIN = 'https://organisaitor.vercel.app';

function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

// The origin an OAuth provider should redirect back to. The packaged apps' own origins
// (https://localhost on Android, tauri.localhost on desktop) can't serve the /api/* callbacks,
// so they use the production deployment's.
export function oauthRedirectOrigin(): string {
  return isAndroid() || isTauri() ? PRODUCTION_API_ORIGIN : window.location.origin;
}

// Status codes a Response may not carry a body for (the constructor throws otherwise).
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

// Covers exactly what the callers send and read: string bodies (JSON — speech-recognize's audio
// travels base64 inside the JSON), plain-object headers, and `ok`/`status`/`headers`/`json()`
// on the way back.
async function androidFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => { headers[key] = value; });

  let data: unknown;
  if (typeof init?.body === 'string') {
    // CapacitorHttp serialises a JSON request body itself; handing it the string would send it
    // re-quoted, so pass the parsed value.
    const isJson = (headers['content-type'] ?? '').includes('application/json');
    data = isJson ? JSON.parse(init.body) : init.body;
  } else if (init?.body != null) {
    throw new Error('apiFetch on Android only supports string request bodies');
  }

  const res = await CapacitorHttp.request({
    url: `${PRODUCTION_API_ORIGIN}${path}`,
    method: init?.method ?? 'GET',
    headers,
    data,
    responseType: 'text',
  });

  // The native side parses a JSON response itself regardless of responseType, so the data can
  // arrive as an object; turn it back into the text a Response carries.
  const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  return new Response(NULL_BODY_STATUSES.has(res.status) ? null : text, {
    status: res.status,
    headers: res.headers,
  });
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Only /api/* needs this treatment — dev-only paths like the Yahoo Finance /yf/* proxy
  // only ever make sense against a live Vite dev server's own origin (tauri dev's devUrl
  // included) and are never requested at all once import.meta.env.DEV is false (a real
  // build), so they're left as plain same-origin fetches.
  if (path.startsWith('/api/')) {
    if (isAndroid()) return androidFetch(path, init);
    if (isTauri()) {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      return tauriFetch(`${PRODUCTION_API_ORIGIN}${path}`, init);
    }
  }
  return fetch(path, init);
}
