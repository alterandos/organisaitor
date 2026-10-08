// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSettingsStore } from '@/store/settingsStore';
import { ResizeHandle } from './ResizeHandle';
import { usePaneWidth } from './usePaneWidth';

const platform = vi.hoisted(() => ({ isAndroid: false }));
vi.mock('@/hooks/usePlatform', () => ({ usePlatform: () => ({ isAndroid: platform.isAndroid, isNative: platform.isAndroid, isWeb: !platform.isAndroid }) }));

// jsdom has no layout or pointer capture.
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

function Pane({ edge = 'left' as const }: { edge?: 'left' | 'right' }) {
  const resize = usePaneWidth('test-pane', { edge, min: 200, max: 600 });
  return (
    // jsdom's style parser drops CSS min(), so the width the hook asks for is read from here.
    <aside data-testid="pane" data-width={resize.style?.width ?? ''}>
      {resize.handle && <ResizeHandle {...resize.handle} />}
    </aside>
  );
}

beforeEach(() => {
  platform.isAndroid = false;
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 800));
  window.innerWidth = 1600;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const drag = (from: number, to: number) => {
  const handle = screen.getByRole('separator');
  fireEvent.pointerDown(handle, { button: 0, clientX: from, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: to, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientX: to, pointerId: 1 });
};

describe('usePaneWidth + ResizeHandle', () => {
  it('keeps the CSS width until dragged', () => {
    render(<Pane />);
    expect(screen.getByTestId('pane').dataset.width).toBe('');
  });

  it('a pane on the right grows when its left edge is dragged left, and remembers it', () => {
    render(<Pane />);
    drag(1000, 900);
    expect(useSettingsStore.getState().paneWidths['test-pane']).toBe(500);
    expect(screen.getByTestId('pane').dataset.width).toBe('min(500px, 100vw)');
  });

  it('a pane on the left grows when its right edge is dragged right; clamped to min and max', () => {
    render(<Pane edge="right" />);
    drag(400, 2000);
    expect(useSettingsStore.getState().paneWidths['test-pane']).toBe(600);
    drag(600, 0);
    expect(useSettingsStore.getState().paneWidths['test-pane']).toBe(200);
  });

  it('arrow keys move the edge; a double-click resets to the CSS width', () => {
    render(<Pane />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(useSettingsStore.getState().paneWidths['test-pane']).toBe(416);
    fireEvent.doubleClick(handle);
    expect(useSettingsStore.getState().paneWidths['test-pane']).toBeUndefined();
    expect(screen.getByTestId('pane').dataset.width).toBe('');
  });

  it('panes of one family share a width', () => {
    act(() => useSettingsStore.getState().setPaneWidth('test-pane', 480));
    render(<><Pane /><Pane /></>);
    expect(screen.getAllByTestId('pane').map((p) => p.dataset.width)).toEqual(['min(480px, 100vw)', 'min(480px, 100vw)']);
  });

  it('no handle on Android', () => {
    platform.isAndroid = true;
    act(() => useSettingsStore.getState().setPaneWidth('test-pane', 480));
    render(<Pane />);
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByTestId('pane').dataset.width).toBe('');
  });
});
