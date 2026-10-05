// @vitest-environment jsdom
//
// The right-click host and menu, end to end: an element declares a scope, a right-click on it
// shows our menu (and suppresses the browser's), and the menu behaves like a menu.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenuHost } from './ContextMenuHost';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import { RowOptionsMenu } from '@/components/RowHoverActions/RowOptionsMenu';
import { RowAction } from '@/components/RowHoverActions/RowAction';
import { useUIStore } from '@/store/uiStore';
import type { ContextMenuItem } from '@/contextMenu/types';

beforeEach(() => { useUIStore.setState(useUIStore.getInitialState(), true); });
afterEach(() => { cleanup(); });

function Target({ items }: { items: ContextMenuItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useContextMenuScope(ref, () => ({ kind: 'thing', items: () => items }));
  return (
    <div>
      <div ref={ref} data-testid="target">target <input aria-label="field" /></div>
      <div data-testid="elsewhere">elsewhere</div>
    </div>
  );
}

// fireEvent returns false when the default (the browser's menu) was prevented.
const rightClick = (el: Element, init: MouseEventInit = {}) => {
  let shown = true;
  act(() => { shown = fireEvent.contextMenu(el, { clientX: 40, clientY: 50, ...init }); });
  return !shown; // true = our menu took over
};

describe('ContextMenuHost', () => {
  it('a right-click on a declared scope shows its items instead of the browser menu', () => {
    render(<><ContextMenuHost /><Target items={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]} /></>);
    expect(rightClick(screen.getByTestId('target'))).toBe(true);
    expect(screen.getByRole('menuitem', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Beta/ })).toBeInTheDocument();
  });

  it('the browser menu is left alone: undeclared places, Shift+right-click, text inputs', () => {
    render(<><ContextMenuHost /><Target items={[{ id: 'a', label: 'Alpha' }]} /></>);
    expect(rightClick(screen.getByTestId('elsewhere'))).toBe(false);
    expect(rightClick(screen.getByTestId('target'), { shiftKey: true })).toBe(false);
    expect(rightClick(screen.getByLabelText('field'))).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('choosing an item closes the menu, then runs it; disabled items do nothing', async () => {
    const run = vi.fn();
    const never = vi.fn();
    render(<><ContextMenuHost /><Target items={[{ id: 'a', label: 'Alpha', run }, { id: 'd', label: 'Off', disabled: true, run: never }]} /></>);
    rightClick(screen.getByTestId('target'));
    await userEvent.click(screen.getByRole('menuitem', { name: /Off/ }));
    expect(never).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('menuitem', { name: /Alpha/ }));
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keyboard: arrows skip disabled items, Enter runs, a submenu opens with → and closes with Escape', async () => {
    const run = vi.fn();
    const sub = vi.fn();
    render(<><ContextMenuHost /><Target items={[
      { id: 'd', label: 'Off', disabled: true },
      { id: 'a', label: 'Alpha', run },
      { id: 's', label: 'More', submenu: [[{ id: 'x', label: 'Inner', run: sub }]] },
    ]} /></>);
    rightClick(screen.getByTestId('target'));
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /Alpha/ }).className).toMatch(/itemActive/);
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getAllByRole('menu')).toHaveLength(2);
    await userEvent.keyboard('{Escape}');
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(sub).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape or a press elsewhere closes it', async () => {
    render(<><ContextMenuHost /><Target items={[{ id: 'a', label: 'Alpha' }]} /></>);
    rightClick(screen.getByTestId('target'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    rightClick(screen.getByTestId('target'));
    fireEvent.mouseDown(screen.getByTestId('elsewhere'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a row with RowOptionsMenu gets its RowActions as its right-click menu', async () => {
    const edit = vi.fn();
    function Row() {
      const rowRef = useRef<HTMLDivElement>(null);
      return (
        <div ref={rowRef} data-testid="row">
          <RowOptionsMenu rowRef={rowRef} title="Biology">
            <RowAction icon="✎" label="Edit" onClick={edit} />
            {false && <RowAction icon="↳" label="Hidden" onClick={() => {}} />}
            <RowAction icon="×" label="Delete" onClick={() => {}} destructive />
          </RowOptionsMenu>
          Biology
        </div>
      );
    }
    render(<><ContextMenuHost /><Row /></>);
    rightClick(screen.getByTestId('row'));
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(items).toEqual(['✎Edit', '×Delete']);
    await userEvent.click(screen.getByRole('menuitem', { name: /Edit/ }));
    expect(edit).toHaveBeenCalledOnce();
  });
});
