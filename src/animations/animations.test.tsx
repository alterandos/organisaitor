// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { onSignal, signal, useSignal } from './signals';
import { useGlide } from './glide';
import { flashArrival } from './flash';
import { installTickPop } from './tickPop';

// The animations of 2026-11-14 (docs/agent-tasks/10-animation-audit.md): what starts them (a
// signal from the change), and that each plays where it should. The motion itself isn't checked
// (jsdom draws nothing); `animate` is a spy.

const animate = vi.fn();
beforeEach(() => {
  animate.mockClear();
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
  window.matchMedia = ((q: string) => ({ matches: false, media: q })) as unknown as typeof window.matchMedia;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('signals', () => {
  it('an arrival plays on a row already there, and on one drawn just after it (a new task)', () => {
    const played: string[] = [];
    const { unmount } = renderHook(() => useSignal('arrive', 'a', () => played.push('a')));
    act(() => signal('arrive', 'a'));
    expect(played).toEqual(['a']);
    unmount();
    signal('arrive', 'b');
    renderHook(() => useSignal('arrive', 'b', () => played.push('b')));
    expect(played).toEqual(['a', 'b']);
  });
  it('a listener is told the detail (a removed task\'s copy) and can stop listening', () => {
    const got: unknown[] = [];
    const off = onSignal('remove', (id, d) => got.push([id, d]));
    signal('remove', 't', { title: 'x' });
    off();
    signal('remove', 't2', {});
    expect(got).toEqual([['t', { title: 'x' }]]);
  });
});

describe('glide', () => {
  function Item({ when, top }: { when: string; top: number }) {
    const ref = useRef<HTMLDivElement>(null);
    useGlide('ev1', when, ref);
    return <div ref={(el) => { ref.current = el; if (el) el.getBoundingClientRect = () => new DOMRect(0, top, 10, 10); }} />;
  }
  it('glides when its time changes, never when it is only drawn somewhere else', () => {
    const { rerender } = render(<Item when="2026-11-14 09:00" top={100} />);
    rerender(<Item when="2026-11-14 09:00" top={300} />);   // scrolled: same time
    expect(animate).not.toHaveBeenCalled();
    rerender(<Item when="2026-11-14 11:00" top={500} />);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0][0]).toEqual({ translate: '0px -200px' });
  });
});

describe('flash and ticks', () => {
  it('flashArrival glows the element', () => {
    const el = document.createElement('div');
    document.body.append(el);
    el.getBoundingClientRect = () => new DOMRect(0, 10, 10, 10);
    flashArrival(el);
    expect(animate).toHaveBeenCalled();
    el.remove();
  });
  it('a tick draws the strike-through on the ticked item\'s text', () => {
    if (!globalThis.CSS?.escape) (globalThis as { CSS?: unknown }).CSS = { escape: (s: string) => s };   // jsdom has no CSS.escape
    const off = installTickPop();
    document.body.innerHTML = '<li data-tick-row><button data-tick="item1"></button><span data-tick-text>Milk</span></li>';
    signal('tick', 'item1');
    expect(document.querySelector('[data-tick-text]')!.className).not.toBe('');
    off();
  });
});
