// Which tagline the welcome page shows next: random, but leaning hard away from the ones shown in
// the last RECENT turns (the one showing now is never picked again straight away). Pure, so it can
// be tested with a fixed `random`.
export const RECENT = 5;
const RECENT_WEIGHT = 0.1;   // a recently shown tagline is ten times less likely than a fresh one

export function pickTagline(count: number, recent: readonly number[], random: () => number = Math.random): number {
  if (count <= 1) return 0;
  const window = recent.slice(-RECENT);
  const last = recent[recent.length - 1];
  const weights = Array.from({ length: count }, (_, i): number => (i === last ? 0 : window.includes(i) ? RECENT_WEIGHT : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let at = random() * total;
  for (let i = 0; i < count; i++) {
    at -= weights[i];
    if (at < 0 && weights[i] > 0) return i;
  }
  for (let i = count - 1; i >= 0; i--) if (weights[i] > 0) return i;
  return 0;
}
