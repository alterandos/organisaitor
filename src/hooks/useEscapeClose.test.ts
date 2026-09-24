// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeClose } from './useEscapeClose';

const pressEscape = () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
};

describe('useEscapeClose', () => {
  it('a single registered overlay closes on Escape', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose));
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('only the most recently opened (registered) overlay closes — the one under it stays open', () => {
    const first = vi.fn();
    const second = vi.fn();
    renderHook(() => useEscapeClose(first));
    renderHook(() => useEscapeClose(second));
    pressEscape();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('once the top overlay unmounts, Escape falls through to the one now on top', () => {
    const first = vi.fn();
    const second = vi.fn();
    renderHook(() => useEscapeClose(first));
    const { unmount } = renderHook(() => useEscapeClose(second));
    unmount();
    pressEscape();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('registration order is open order, not mount timing of the active flag — "active" becoming true later counts as opening later', () => {
    const older = vi.fn();
    const newer = vi.fn();
    const { rerender } = renderHook(({ active }) => useEscapeClose(older, active), { initialProps: { active: false } });
    renderHook(() => useEscapeClose(newer));
    // The first hook only actually registers once `active` flips true — after the second one
    // already registered — so it is now the "most recently opened" despite mounting first.
    rerender({ active: true });
    pressEscape();
    expect(older).toHaveBeenCalledTimes(1);
    expect(newer).not.toHaveBeenCalled();
  });

  it('a re-render with a new callback identity does not reshuffle order, and always calls the LATEST callback', () => {
    const first = vi.fn();
    const second1 = vi.fn();
    const second2 = vi.fn();
    renderHook(() => useEscapeClose(first));
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => useEscapeClose(cb), { initialProps: { cb: second1 } });
    rerender({ cb: second2 }); // same registration slot, new callback — must not re-order or call the old one
    pressEscape();
    expect(second2).toHaveBeenCalledTimes(1);
    expect(second1).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  it('active=false never registers, so it never intercepts Escape even if mounted last', () => {
    const inactive = vi.fn();
    const activeOne = vi.fn();
    renderHook(() => useEscapeClose(activeOne));
    renderHook(() => useEscapeClose(inactive, false));
    pressEscape();
    expect(activeOne).toHaveBeenCalledTimes(1);
    expect(inactive).not.toHaveBeenCalled();
  });

  it('stops the keydown from reaching any other document listener registered after it (stopImmediatePropagation)', () => {
    const onClose = vi.fn();
    const strayListener = vi.fn();
    renderHook(() => useEscapeClose(onClose));
    document.addEventListener('keydown', strayListener);
    pressEscape();
    document.removeEventListener('keydown', strayListener);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(strayListener).not.toHaveBeenCalled();
  });

  it('a non-Escape key is ignored entirely', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('with nothing registered, Escape does nothing (no throw)', () => {
    expect(() => pressEscape()).not.toThrow();
  });
});
