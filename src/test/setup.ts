import { preloadIdbStorage } from '@/utils/idbStorage';

// The stores persist through localStorage (and notes through IndexedDB), neither of which exists in
// Node. A Map-backed localStorage is enough; with no indexedDB, preloadIdbStorage falls back to it.
const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  },
});

const quiet = console.error;
console.error = () => {};
await preloadIdbStorage();
console.error = quiet;
