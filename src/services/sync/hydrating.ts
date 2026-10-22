// True while sync is writing the cloud's rows into the stores. In its own module so a store watcher
// (services/eventTaskFollow.ts) can tell a change that arrived from another device, already acted
// on there, without importing the whole sync service.
let hydrating = false;
export const isHydrating = (): boolean => hydrating;
export const setHydrating = (on: boolean): void => { hydrating = on; };
