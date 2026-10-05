import { useEffect, useRef } from 'react';
import { clearElementScope, setElementScope } from './registry';
import type { ContextMenuScope } from './types';

// Declares what an element is, for right-click menus: `describe` is called at right-click time
// (always the latest render's), so it can close over current props and state. `target` is a ref,
// or an element itself (e.g. a Tiptap editor's `view.dom`).
export function useContextMenuScope(
  target: React.RefObject<Element | null> | Element | null | undefined,
  describe: () => ContextMenuScope,
  enabled = true,
): void {
  const describeRef = useRef(describe);
  useEffect(() => { describeRef.current = describe; });

  const isRef = !!target && 'current' in target;
  const directEl = isRef ? null : (target as Element | null | undefined) ?? null;
  useEffect(() => {
    if (!enabled) return;
    const el = isRef ? (target as React.RefObject<Element | null>).current : directEl;
    if (!el) return;
    const fn = () => describeRef.current();
    setElementScope(el, fn);
    return () => clearElementScope(el, fn);
  }, [enabled, isRef, target, directEl]);
}
