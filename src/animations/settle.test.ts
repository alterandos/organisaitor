// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { SETTLE_MS, useSettling } from './settle';

afterEach(() => { cleanup(); vi.useRealTimers(); });

// 2026-11-13: a completed task left the list in the same frame, so its tick and the burst on its
// checkbox were never seen. It now stays a moment (TaskList reads this), then goes.
describe('useSettling', () => {
  it('holds what was just done for SETTLE_MS, then lets it go', () => {
    vi.useFakeTimers();
    const listeners = new Set<(id: string) => void>();
    const subscribe = (fn: (id: string) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
    const { result, unmount } = renderHook(() => useSettling(subscribe));
    act(() => listeners.forEach((fn) => fn('t1')));
    expect(result.current.has('t1')).toBe(true);
    act(() => { vi.advanceTimersByTime(SETTLE_MS - 1); });
    expect(result.current.has('t1')).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.has('t1')).toBe(false);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
