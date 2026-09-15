// Shared helpers for the Strava edge functions. Files under api/_lib/ are not routed
// by Vercel (leading underscore), so this is safe to import from multiple api/*.ts
// endpoints without becoming an endpoint itself.

export interface StravaTokenResponse {
  access_token:  string;
  refresh_token: string;
  expires_at:    number;  // unix seconds
  expires_in:    number;
  athlete?:      { id: number };
}

async function tokenRequest(body: Record<string, string>): Promise<StravaTokenResponse> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.VITE_STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  return tokenRequest({ code, grant_type: 'authorization_code' });
}

export function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
}

// Strava's sport_type (the modern, granular field) -> our built-in ActivityTypeId.
// Unrecognised values fall back to 'other' rather than being dropped, so a sync never
// silently loses an activity just because Strava added a new sport_type.
export function mapSportType(sportType: string | undefined): string {
  switch (sportType) {
    case 'Run':
    case 'TrailRun':          return 'run';
    case 'Hike':               return 'hike';
    case 'Walk':                return 'walk';
    case 'Ride':
    case 'VirtualRide':
    case 'GravelRide':
    case 'MountainBikeRide':
    case 'EBikeRide':          return 'ride';
    case 'Swim':                return 'swim';
    case 'WeightTraining':
    case 'Workout':
    case 'Crossfit':
    case 'HIIT':                return 'strength';
    case 'Yoga':                 return 'yoga';
    default:                     return 'other';
  }
}
