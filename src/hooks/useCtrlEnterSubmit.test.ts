// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCtrlEnterSubmit } from './useCtrlEnterSubmit';

const pressCtrlEnter = (mod: 'ctrl' | 'meta' = 'ctrl') => {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', ctrlKey: mod === 'ctrl', metaKey: mod === 'meta', bubbles: true, cancelable: true,
  }));
};

describe('useCtrlEnterSubmit', () => {
  it('fires once on Ctrl+Enter', () => {
    const onSubmit = vi.fn();
    renderHook(() => useCtrlEnterSubmit(onSubmit));
    pressCtrlEnter('ctrl');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('also fires on Cmd+Enter (metaKey, for Mac)', () => {
    const onSubmit = vi.fn();
    renderHook(() => useCtrlEnterSubmit(onSubmit));
    pressCtrlEnter('meta');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('plain Enter (no modifier) does not trigger it', () => {
    const onSubmit = vi.fn();
    renderHook(() => useCtrlEnterSubmit(onSubmit));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is inactive when active=false — no listener at all', () => {
    const onSubmit = vi.fn();
    renderHook(() => useCtrlEnterSubmit(onSubmit, false));
    pressCtrlEnter();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('always calls the CURRENT callback — never a stale one from an earlier render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => useCtrlEnterSubmit(cb), { initialProps: { cb: first } });
    rerender({ cb: second });
    pressCtrlEnter();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('flipping active from false to true starts responding without a remount', () => {
    const onSubmit = vi.fn();
    const { rerender } = renderHook(({ active }) => useCtrlEnterSubmit(onSubmit, active), { initialProps: { active: false } });
    pressCtrlEnter();
    expect(onSubmit).not.toHaveBeenCalled();
    rerender({ active: true });
    pressCtrlEnter();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('unmounting removes the listener — no call, no error, after unmount', () => {
    const onSubmit = vi.fn();
    const { unmount } = renderHook(() => useCtrlEnterSubmit(onSubmit));
    unmount();
    expect(() => pressCtrlEnter()).not.toThrow();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
