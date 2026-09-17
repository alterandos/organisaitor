import { getUserClient, bearerToken } from './_lib/supabaseEdge';

export const config = { runtime: 'edge' };

// Removes a connection. Deliberately does NOT delete events already imported from it —
// this app is the source of truth for those once created (see calendarStore.ts's
// upsertSyncedEvent); disconnecting just stops pulling in anything new.
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const token = bearerToken(req);
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { connectionId } = await req.json() as { connectionId?: string };
  if (!connectionId) return Response.json({ error: 'Missing connectionId' }, { status: 400 });

  const supabase = getUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { error } = await supabase
    .from('calendar_connections')
    .delete()
    .eq('id', connectionId)
    .eq('user_id', userData.user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
