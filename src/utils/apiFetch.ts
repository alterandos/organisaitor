// `/api/*` Vercel Edge Functions only exist on an actual deployment — a relative fetch
// resolves against whatever origin the page was loaded from, which works fine for the
// browser PWA (same origin as the deployment) but not for the packaged Tauri desktop app,
// which loads static files with no backend of its own (frontendDist, no dev server — see
// CLAUDE.md's "Desktop (Tauri) and Android builds can't reach /api/*" entry). Under Tauri,
// these calls are routed through @tauri-apps/plugin-http's fetch (a native HTTP client, not
// the webview's) against the production deployment's absolute URL — a native request isn't
// subject to browser CORS, so this needs no server-side changes, just the widened capability
// scope in src-tauri/capabilities/default.json.
const PRODUCTION_API_ORIGIN = 'https://organisaitor.vercel.app';

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Only /api/* needs this treatment — dev-only paths like the Yahoo Finance /yf/* proxy
  // only ever make sense against a live Vite dev server's own origin (tauri dev's devUrl
  // included) and are never requested at all once import.meta.env.DEV is false (a real
  // build), so they're left as plain same-origin fetches.
  if (path.startsWith('/api/') && '__TAURI_INTERNALS__' in window) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(`${PRODUCTION_API_ORIGIN}${path}`, init);
  }
  return fetch(path, init);
}
