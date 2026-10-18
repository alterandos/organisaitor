import type { CalendarEventId } from '@/types';

// The id an event imported from a synced calendar gets: the same on every device, so two devices
// that import the same Google event before seeing each other's copy make the same record, and the
// sync merges them instead of keeping two (devices only see each other's changes on their next
// load). The app account is part of it, so two accounts importing a shared calendar still get
// different ids (a synced id must be unique across accounts: CLAUDE.md "Supabase sync", where this
// exception to "never a fixed id" was approved by the user 2026-10-18).
// A 106-bit hash (two 53-bit halves): collisions are not a practical concern at calendar scale.
function half(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function importedEventId(userId: string, key: string): CalendarEventId {
  const s = `${userId}\n${key}`;
  return `imp_${half(s, 1).toString(36)}${half(s, 2).toString(36)}` as CalendarEventId;
}
