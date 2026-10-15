// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useUIStore } from '@/store/uiStore';
import { NavFlash } from './NavFlash';

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(() => { cleanup(); vi.useRealTimers(); });

const arrows = () => document.querySelectorAll('[data-direction]');
const cards = () => document.querySelectorAll('article');
const layerHidden = () => document.querySelector('[role="status"]')!.parentElement!.getAttribute('aria-hidden') === 'true';

describe('NavFlash (Alt+← / Alt+→)', () => {
  it('shows nothing until a keyboard back/forward', () => {
    render(<NavFlash />);
    expect(arrows()).toHaveLength(0);
  });

  it('one arrow at a time, pointing the way you went, and the history cards around where you are', () => {
    act(() => { useUIStore.getState().setActiveView('tasks'); });
    act(() => { useUIStore.getState().setActiveView('calendar'); });
    render(<NavFlash />);
    act(() => { useUIStore.getState().navigateBack(); useUIStore.getState().flashNav('back'); });
    expect(arrows()).toHaveLength(1);
    expect(arrows()[0]).toHaveAttribute('data-direction', 'back');
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Back to Tasks');
    // Where you are (Tasks, the middle card) and the stop ahead (the Calendar): the same cards as Alt+N.
    expect(cards()).toHaveLength(2);
    expect(document.querySelector('article[aria-current]')?.textContent).toContain('Tasks');

    act(() => { useUIStore.getState().travelHistory(1); useUIStore.getState().flashNav('forward'); });
    expect(arrows()).toHaveLength(1);
    expect(arrows()[0]).toHaveAttribute('data-direction', 'forward');
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(/^Forward to/);
  });

  it('stays while Alt is held, and fades a moment after it is let go', () => {
    vi.useFakeTimers();
    act(() => { useUIStore.getState().setActiveView('tasks'); });
    act(() => { useUIStore.getState().setActiveView('calendar'); });
    render(<NavFlash />);
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    act(() => { useUIStore.getState().navigateBack(); useUIStore.getState().flashNav('back'); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(layerHidden()).toBe(false);
    fireEvent.keyUp(window, { key: 'Alt' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(layerHidden()).toBe(true);
  });

  it('without Alt (Backspace) it fades by itself', () => {
    vi.useFakeTimers();
    act(() => { useUIStore.getState().setActiveView('tasks'); });
    act(() => { useUIStore.getState().setActiveView('calendar'); });
    render(<NavFlash />);
    act(() => { useUIStore.getState().navigateBack(); useUIStore.getState().flashNav('back'); });
    expect(layerHidden()).toBe(false);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(layerHidden()).toBe(true);
  });
});
