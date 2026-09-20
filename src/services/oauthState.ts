import { supabase } from '@/services/supabase';

// The OAuth `state` for a provider connect flow: a single-use, 10-minute random nonce bound to
// the signed-in user and the provider (mint_oauth_state, migration 032). Never a credential —
// the redirect back can't carry an Authorization header, so the callback redeems this instead.
export async function mintOAuthState(provider: 'strava' | 'google'): Promise<string> {
  const { data, error } = await supabase.rpc('mint_oauth_state', { p_provider: provider });
  if (error || typeof data !== 'string' || !data) {
    throw new Error("Couldn't start the connection. Please try again in a moment.");
  }
  return data;
}
