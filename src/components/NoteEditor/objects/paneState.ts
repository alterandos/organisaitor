import { createContext, useCallback, useContext, useState } from 'react';

// UI state of an expanded pane's body (is the list of dates open, a half-typed note…), kept outside
// React. ProseMirror sometimes builds a pane's body again — it matches widgets one step at a time,
// so replacing the heading widget just before the body (its date changed: ticking the current
// occurrence does that) replaces the body too — and state held in the component would be lost:
// the list would close under the click that ticked it. Kept here, the new body carries on where
// the old one was. Cleared when the pane collapses, so it opens fresh next time.

const states = new Map<string, Map<string, unknown>>();

// Which pane a body belongs to: "<link key>|<nth>", provided by ArtifactBody.
export const PaneStateKey = createContext<string>('');

export function usePaneState<T>(name: string, initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const key = useContext(PaneStateKey);
  const [value, setValue] = useState<T>(() => {
    let saved = states.get(key);
    if (saved?.has(name)) return saved.get(name) as T;
    // The starting value is kept too: it may come from a one-off request (the list of dates asked
    // for by the inline pane) that a rebuilt body couldn't ask again.
    const value = typeof initial === 'function' ? (initial as () => T)() : initial;
    if (!saved) states.set(key, (saved = new Map()));
    saved.set(name, value);
    return value;
  });
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
      let saved = states.get(key);
      if (!saved) states.set(key, (saved = new Map()));
      saved.set(name, value);
      return value;
    });
  }, [key, name]);
  return [value, set];
}

// Forget the state of every pane of one link (it collapsed).
export function clearPaneState(linkKey: string): void {
  for (const key of states.keys()) if (key.startsWith(`${linkKey}|`)) states.delete(key);
}
