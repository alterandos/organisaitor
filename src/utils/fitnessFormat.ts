// Display formatting only — stored data is always SI (meters, seconds, m/s).
// Metric-only for Phase 1 (see BACKLOG.md "Fitness App" — imperial toggle is deferred).

export function formatDistance(meters: number | null): string {
  if (meters === null) return '—';
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!h && (s || parts.length === 0)) parts.push(`${s}s`);
  return parts.join(' ');
}

export function formatSpeed(metersPerSecond: number | null): string {
  if (metersPerSecond === null) return '—';
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

export function computeAverageSpeedMps(distanceMeters: number | null, movingTimeSeconds: number | null): number | null {
  if (!distanceMeters || !movingTimeSeconds) return null;
  return distanceMeters / movingTimeSeconds;
}
