// True while sync is writing the cloud's rows into the stores. In its own module so a store watcher
// (services/eventTaskFollow.ts) can tell a change that arrived from another device, already acted
// on there, without importing the whole sync service.
let hydrating = false;
export const isHydrating = (): boolean => hydrating;
export const setHydrating = (on: boolean): void => { hydrating = on; };

// Called once a load's merge is done (the stores hold the cloud's rows): a service that must work
// on merged data (converting old Schedules, services/schedules.ts) listens here rather than the sync
// service importing it.
const loadedListeners = new Set<() => void>();
export const onLoaded = (cb: () => void): (() => void) => { loadedListeners.add(cb); return () => { loadedListeners.delete(cb); }; };
export const notifyLoaded = (): void => { for (const cb of loadedListeners) cb(); };
