import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import https from 'https';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

// ── Yahoo Finance dev proxy ───────────────────────────────────────────────────
// Yahoo Finance price endpoints require a session cookie + crumb.
// Uses Node's https module (no undici header-count limit) to fetch auth state.
// In production, Vercel edge functions in api/ handle this instead.

interface YFSession { crumb: string; cookies: string; }
let yfSession: YFSession | null = null;
let yfSessionExpiry = 0;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function nodeGet(url: string, reqHeaders: Record<string, string>, redirectsLeft = 3): Promise<{ status: number; body: string; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname:      parsed.hostname,
      port:          443,
      path:          parsed.pathname + parsed.search,
      method:        'GET',
      headers:       { ...reqHeaders, Host: parsed.hostname },
      maxHeaderSize: 131072, // 128 KB — Yahoo Finance sends huge response headers
    };
    const req = https.request(options, (res: IncomingMessage) => {
      const setCookie = res.headers['set-cookie'] ?? [];
      const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie])
        .map((c: string) => c.split(';')[0]);

      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        nodeGet(res.headers.location, reqHeaders, redirectsLeft - 1)
          .then((r) => resolve({ ...r, cookies: [...cookies, ...r.cookies] }))
          .catch(reject);
        return;
      }

      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, cookies }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function refreshYFSession(): Promise<YFSession> {
  // Use a lightweight Yahoo Finance endpoint to get session cookies
  const init = await nodeGet('https://finance.yahoo.com/', {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
  });
  const cookies = init.cookies.join('; ');
  console.log(`[vite-yf] Got ${init.cookies.length} cookies, status ${init.status}`);

  // Exchange cookies for a crumb
  const crumbRes = await nodeGet('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    'User-Agent': UA,
    'Accept': 'text/plain',
    'Cookie': cookies,
    'Referer': 'https://finance.yahoo.com/',
  });

  if (crumbRes.status !== 200) throw new Error(`Crumb fetch failed: ${crumbRes.status}`);
  const crumb = crumbRes.body.trim();
  if (!crumb || crumb.length > 64) throw new Error(`Unexpected crumb value: ${JSON.stringify(crumb)}`);

  console.log(`[vite-yf] Session ready — crumb: ${crumb.slice(0, 6)}…`);
  return { crumb, cookies };
}

function yahooFinanceProxyPlugin(): Plugin {
  return {
    name: 'yahoo-finance-dev-proxy',
    configureServer(server) {
      refreshYFSession()
        .then((s) => { yfSession = s; yfSessionExpiry = Date.now() + 28 * 60_000; })
        .catch((e) => console.error('[vite-yf] initial session failed:', e));

      server.middlewares.use('/yf', async (req: IncomingMessage, res: ServerResponse) => {
        try {
          if (!yfSession || Date.now() > yfSessionExpiry) {
            yfSession = await refreshYFSession();
            yfSessionExpiry = Date.now() + 28 * 60_000;
          }

          const doFetch = async (session: YFSession) => {
            let yfUrl = `https://query1.finance.yahoo.com${req.url}`;
            if (/\/(quote|quoteSummary|chart)/.test(req.url ?? '')) {
              yfUrl += (yfUrl.includes('?') ? '&' : '?') + `crumb=${encodeURIComponent(session.crumb)}`;
            }
            return nodeGet(yfUrl, {
              'User-Agent': UA,
              'Accept': 'application/json',
              'Cookie': session.cookies,
              'Referer': 'https://finance.yahoo.com/',
            });
          };

          let result = await doFetch(yfSession);

          if (result.status === 401) {
            console.log('[vite-yf] 401 — refreshing session and retrying…');
            yfSession = await refreshYFSession();
            yfSessionExpiry = Date.now() + 28 * 60_000;
            result = await doFetch(yfSession);
          }

          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(result.body);
        } catch (err) {
          console.error('[vite-yf] proxy error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'YF proxy error' }));
        }
      });
    },
  };
}
// ─────────────────────────────────────────────────────────────────────────────

// ── No hot-swapping of stores, services or utils (dev only) ─────────────────
// Hot module replacement re-runs a changed .ts module, and every module importing it, inside the
// running page: a store would be created a second time beside the first, the encryption and sync
// services would restart with empty state, and timers and async saves already running would keep
// writing through the old copies. On 2026-10-22 that cost an encrypted note: a `git stash` swapped
// a batch of files under the running dev app, and a stale copy of the notes store was saved over the
// current one 12 seconds later. A change to any .ts file under src/ now reloads the page instead
// (state is reloaded from storage, as on a restart); .tsx components keep React Fast Refresh.
function fullReloadForStateModules(): Plugin {
  return {
    name: 'full-reload-for-state-modules',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      if (/\/src\/.+\.ts$/.test(file.replace(/\\/g, '/'))) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), yahooFinanceProxyPlugin(), fullReloadForStateModules()],

  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  build: {
    target: process.env.TAURI_ENV_PLATFORM
      ? (process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13')
      : 'es2020',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
