import { supabase } from '@/services/supabase';
import { mintOAuthState } from '@/services/oauthState';
import { useFitnessStore } from '@/store/fitnessStore';
import type { ActivityTypeId } from '@/types/fitness';
import { apiFetch } from '@/utils/apiFetch';

export interface StravaStatus {
  connected:   boolean;
  athleteId?:  number;
  connectedAt?: string;
}

interface SyncedActivity {
  type:               string;
  title:              string;
  startedAt:          string;
  distanceMeters:     number | null;
  movingTimeSeconds:  number | null;
  elapsedTimeSeconds: number | null;
  averageSpeedMps:    number | null;
  sourceId:           string;
  sourceRaw:          Record<string, unknown>;
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Strava's redirect-back is a full page navigation, so there's no way to send an
// Authorization header — a single-use nonce (mintOAuthState) rides in the OAuth `state` param
// instead, and api/strava-oauth-callback.ts redeems it to learn which user is connecting.
// Throws if the nonce can't be minted (e.g. migration 032 not run yet).
export async function getStravaConnectUrl(): Promise<string | null> {
  const token = await accessToken();
  if (!token) return null;

  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;
  if (!clientId) return null;

  const redirectUri = `${window.location.origin}/api/strava-oauth-callback`;
  const params = new URLSearchParams({
    client_id:        clientId,
    redirect_uri:      redirectUri,
    response_type:     'code',
    approval_prompt:   'auto',
    scope:              'activity:read',
    state:              await mintOAuthState('strava'),
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export async function checkStravaStatus(): Promise<StravaStatus> {
  const token = await accessToken();
  if (!token) return { connected: false };

  try {
    const res = await apiFetch('/api/strava-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { connected: false };
    // Local `vite dev` has no /api/* routing (only Vercel/`vercel dev` do), so this fetch can
    // come back 200 OK with the edge function's own source text instead of real JSON — `.ok`
    // alone doesn't guarantee a parseable body. Fail soft rather than throwing an uncaught
    // SyntaxError out of this function.
    return await res.json();
  } catch {
    return { connected: false };
  }
}

// Fetches recent activities from Strava (server-side, via api/strava-sync.ts) and
// upserts each into fitnessStore by source+sourceId, so repeat syncs update existing
// rows instead of duplicating them. Returns the number of activities synced.
export async function syncStrava(): Promise<number> {
  const token = await accessToken();
  if (!token) throw new Error('Not signed in');

  const res = await apiFetch('/api/strava-sync', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Sync failed: ${res.status}`);
  }

  const { activities }: { activities: SyncedActivity[] } = await res.json();
  const upsertBySource = useFitnessStore.getState().upsertBySource;
  for (const a of activities) {
    upsertBySource('strava', a.sourceId, {
      type:               a.type as ActivityTypeId,
      title:              a.title,
      startedAt:          a.startedAt,
      distanceMeters:     a.distanceMeters,
      movingTimeSeconds:  a.movingTimeSeconds,
      elapsedTimeSeconds: a.elapsedTimeSeconds,
      averageSpeedMps:    a.averageSpeedMps,
      sourceRaw:          a.sourceRaw,
    });
  }
  return activities.length;
}
