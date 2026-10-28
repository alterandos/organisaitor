// What each persisted store held when the app opened, before any `migrate` upgraded it: the first
// value its storage handed out. services/upgradeSnapshot.ts compares it with what's stored once the
// stores have loaded, and keeps a "before upgrade" snapshot of any store whose version changed
// (2026-10-28, the Endeavours plan's rule: a safety snapshot before every store migration).
// Strings are shared, not copied, so holding them costs nothing until they're taken.

const firstReads = new Map<string, string | null>();

export function recordFirstRead(name: string, value: string | null): void {
  if (!firstReads.has(name)) firstReads.set(name, value);
}

// Hands them over once and forgets them.
export function takeFirstReads(): Map<string, string | null> {
  const out = new Map(firstReads);
  firstReads.clear();
  return out;
}
