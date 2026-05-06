import type { StorageAdapter } from './StorageAdapter';

const KEY = 'todo-app-data';

export function createLocalStorageAdapter<T>(): StorageAdapter<T> {
  return {
    load(): T | null {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    save(data: T): void {
      localStorage.setItem(KEY, JSON.stringify(data));
    },
  };
}
