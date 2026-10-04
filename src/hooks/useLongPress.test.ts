// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { LONG_PRESS_MS, useLongPress } from './useLongPress';

vi.mock('@/utils/haptics', () => ({ hapticMedium: vi.fn() }));

// jsdom has no Touch constructor, so a touch event is a plain Event carrying a `touches` list.
function touch(el: Element, type: string, x = 100, y = 100) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const points = type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperty(e, 'touches', { value: points });
  el.dispatchEvent(e);
  return e;
}

function setup(enabled = true) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const onLongPress = vi.fn();
  const onClick = vi.fn();
  el.addEventListener('click', onClick);
  renderHook(() => useLongPress({ current: el }, onLongPress, enabled));
  return { el, onLongPress, onClick };
}

describe('useLongPress', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = ''; });

  it('fires once the finger has been held still for the delay', () => {
    const { el, onLongPress } = setup();
    touch(el, 'touchstart');
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('a quick tap does not fire, and its click goes through', () => {
    const { el, onLongPress, onClick } = setup();
    touch(el, 'touchstart');
    vi.advanceTimersByTime(150);
    touch(el, 'touchend');
    el.click();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('moving more than the tolerance (a scroll) cancels it', () => {
    const { el, onLongPress } = setup();
    touch(el, 'touchstart', 100, 100);
    touch(el, 'touchmove', 100, 115);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('a small wobble within the tolerance still fires', () => {
    const { el, onLongPress } = setup();
    touch(el, 'touchstart', 100, 100);
    touch(el, 'touchmove', 104, 103);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('swallows the click the release produces, but not a later tap', () => {
    const { el, onClick } = setup();
    touch(el, 'touchstart');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    touch(el, 'touchend');
    el.click();
    expect(onClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("cancels Android's own long-press context menu", () => {
    const { el } = setup();
    const e = new Event('contextmenu', { cancelable: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('does nothing when disabled', () => {
    const { el, onLongPress } = setup(false);
    touch(el, 'touchstart');
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
