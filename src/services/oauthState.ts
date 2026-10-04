import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/services/supabase';

// The OAuth `state` for a provider connect flow: a single-use, 10-minute random nonce bound to
// the signed-in user and the provider (mint_oauth_state, migration 032). Never a credential —
// the redirect back can't carry an Authorization header, so the callback redeems this instead.
// The Android app also records that the flow started there (migration 041), so the callback
// sends the user back into the app rather than to the web app.
export async function mintOAuthState(provider: 'strava' | 'google'): Promise<string> {
  if (Capacitor.getPlatform() === 'android') {
    const { data, error } = await supabase.rpc('mint_oauth_state', { p_provider: provider, p_client: 'android' });
    if (!error && typeof data === 'string' && data) return data;
    // Migration 041 not run yet: mint as before. The connection is still saved; the callback
    // just lands on the web app in the in-app browser instead of returning to the app.
  }
  const { data, error } = await supabase.rpc('mint_oauth_state', { p_provider: provider });
  if (error || typeof data !== 'string' || !data) {
    throw new Error("Couldn't start the connection. Please try again in a moment.");
  }
  return data;
}

export type OAuthProvider = 'strava' | 'google-calendar';
export interface OAuthResult { status: 'connected' | 'error' | 'closed'; reason?: string }

const waiting = new Map<OAuthProvider, (result: OAuthResult) => void>();

// Called by the organisaitor://oauth-done route (services/android/oauthReturn.ts).
export function settleOAuthFlow(provider: OAuthProvider, result: OAuthResult): void {
  const resolve = waiting.get(provider);
  waiting.delete(provider);
  resolve?.(result);
}

// Sends the user to a provider's authorise URL. On the web (and desktop) that's a full page
// navigation, so this returns null and the page goes away. On Android it opens the in-app
// browser and resolves once the flow comes back to the app (organisaitor://oauth-done) or the
// user closes the browser. Either way the connection, if made, is already saved by then, so the
// caller just refreshes what it shows.
export async function openOAuthFlow(provider: OAuthProvider, url: string): Promise<OAuthResult | null> {
  if (Capacitor.getPlatform() !== 'android') {
    window.location.href = url;
    return null;
  }

  settleOAuthFlow(provider, { status: 'closed' });
  const finished = await Browser.addListener('browserFinished', () => settleOAuthFlow(provider, { status: 'closed' }));
  const result = new Promise<OAuthResult>((resolve) => {
    waiting.set(provider, (r) => { void finished.remove(); resolve(r); });
  });
  try {
    await Browser.open({ url });
  } catch (e) {
    settleOAuthFlow(provider, { status: 'error', reason: e instanceof Error ? e.message : String(e) });
  }
  return result;
}
