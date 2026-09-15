import { createClient } from '@supabase/supabase-js';

// A Supabase client scoped to a specific user's access token, for use inside edge
// functions — every request it makes is authenticated as that user, so RLS policies
// (auth.uid() = user_id, same pattern as every other table in this app) apply exactly
// as they would from the browser. No service-role key involved or needed.
export function getUserClient(accessToken: string) {
  const url    = process.env.VITE_SUPABASE_URL as string;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY as string;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}
