// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useUIStore } from '@/store/uiStore';
import { NavFlash } from './NavFlash';

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(() => cleanup());

const arrows = () => document.querySelectorAll('[data-direction]');

describe('NavFlash (Alt+← / Alt+→)', () => {
  it('shows nothing until a keyboard back/forward', () => {
    render(<NavFlash />);
    expect(arrows()).toHaveLength(0);
  });

  it('one arrow at a time, pointing the way you went, and the stops around where you are', () => {
    act(() => { useUIStore.getState().setActiveView('tasks'); });
    act(() => { useUIStore.getState().setActiveView('calendar'); });
    render(<NavFlash />);
    act(() => { useUIStore.getState().navigateBack(); useUIStore.getState().flashNav('back'); });
    expect(arrows()).toHaveLength(1);
    expect(arrows()[0]).toHaveAttribute('data-direction', 'back');
    // Where you are (Tasks) and the stop ahead (the Calendar, titled by its month).
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Back to Tasks');
    expect(document.querySelectorAll('[class*="stop"]')).toHaveLength(2);

    act(() => { useUIStore.getState().travelHistory(1); useUIStore.getState().flashNav('forward'); });
    expect(arrows()).toHaveLength(1);
    expect(arrows()[0]).toHaveAttribute('data-direction', 'forward');
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(/^Forward to/);
  });
});
