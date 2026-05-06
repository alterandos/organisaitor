// Swap this out for an API-backed adapter when syncing to a server
export interface StorageAdapter<T> {
  load(): T | null;
  save(data: T): void;
}
