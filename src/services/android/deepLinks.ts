import { App as CapApp } from '@capacitor/app';

import { log } from '@/utils/log';
// THE router for organisaitor:// links opening the Android app (AndroidManifest.xml registers
// the scheme on MainActivity). A link's host picks the route: organisaitor://oauth-done?… goes to
// whatever registered 'oauth-done'. Features register their own route here rather than adding
// another appUrlOpen listener. Started once from App.tsx (Android only).

export const DEEP_LINK_SCHEME = 'organisaitor:';

export type DeepLinkHandler = (url: URL) => void | Promise<void>;

const routes = new Map<string, DeepLinkHandler>();

export function registerDeepLink(host: string, handler: DeepLinkHandler): () => void {
  routes.set(host, handler);
  return () => {
    if (routes.get(host) === handler) routes.delete(host);
  };
}

// The same link can arrive twice on a cold start (as the launch URL and as an appUrlOpen event).
let lastHandled: { url: string; at: number } | null = null;

// Returns whether a route handled the link.
export async function handleDeepLink(raw: string): Promise<boolean> {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== DEEP_LINK_SCHEME) return false;

  const now = Date.now();
  if (lastHandled && lastHandled.url === raw && now - lastHandled.at < 5000) return true;

  const handler = routes.get(url.host);
  if (!handler) {
    log.warn('deepLinks', 'no route for', raw);
    return false;
  }
  lastHandled = { url: raw, at: now };
  await handler(url);
  return true;
}

export function startDeepLinks(): () => void {
  const listener = CapApp.addListener('appUrlOpen', ({ url }) => { void handleDeepLink(url); });
  // A link that cold-started the app (it had been closed while the browser was open).
  void CapApp.getLaunchUrl().then((launch) => { if (launch?.url) void handleDeepLink(launch.url); });
  return () => { void listener.then((h) => h.remove()); };
}

// Tests only.
export function resetDeepLinksForTest(): void {
  routes.clear();
  lastHandled = null;
}
