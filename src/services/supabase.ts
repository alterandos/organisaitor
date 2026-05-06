import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key || url.includes('your-project-ref')) {
  console.warn('[Supabase] Credentials not configured — cloud sync disabled. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', key ?? 'placeholder');

export const isSupabaseConfigured = !!url && !!key && !url.includes('your-project-ref');
