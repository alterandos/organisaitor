// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialogHost } from './ConfirmDialog';
import { confirmDialog, confirmDelete, alertDialog } from './dialogs';
import { useDialogStore } from '@/store/dialogStore';

beforeEach(() => {
  useDialogStore.setState({ queue: [] });
});

afterEach(() => {
  cleanup();
});

describe('ConfirmDialog', () => {
  it('shows the title and message, and resolves false when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogHost />);
    const resultPromise = confirmDialog({ title: 'Disconnect account?', message: 'You can reconnect later.' });

    expect(await screen.findByText('Disconnect account?')).toBeInTheDocument();
    expect(screen.getByText('You can reconnect later.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await resultPromise).toBe(false);
    expect(screen.queryByText('Disconnect account?')).not.toBeInTheDocument();
  });

  it('resolves true when Confirm is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogHost />);
    const resultPromise = confirmDialog({ title: 'Proceed?' });
    await user.click(await screen.findByRole('button', { name: /^Confirm/ }));
    expect(await resultPromise).toBe(true);
  });

  it('a destructive dialog (confirmDelete) focuses Cancel, not the red Confirm button', async () => {
    render(<ConfirmDialogHost />);
    void confirmDelete('tracker', 'Weight');
    const cancelBtn = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancelBtn));
  });

  it('confirmDelete shows the standard wording: item name and the "cannot be undone" warning', async () => {
    render(<ConfirmDialogHost />);
    void confirmDelete('tracker', 'Weight', 'All its entries will be deleted too.');
    expect(await screen.findByText('Weight')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText('All its entries will be deleted too.')).toBeInTheDocument();
  });

  it('a non-destructive dialog focuses the primary Confirm button by default', async () => {
    render(<ConfirmDialogHost />);
    void confirmDialog({ title: 'Change timezone?' });
    const confirmBtn = await screen.findByRole('button', { name: /Confirm/ });
    await waitFor(() => expect(document.activeElement).toBe(confirmBtn));
  });

  it('Escape resolves false for a confirm dialog', async () => {
    render(<ConfirmDialogHost />);
    const resultPromise = confirmDialog({ title: 'Sure?' });
    await screen.findByText('Sure?');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(await resultPromise).toBe(false);
  });

  it('Escape resolves an alert() dialog (which has no cancel concept) without throwing', async () => {
    render(<ConfirmDialogHost />);
    const resultPromise = alertDialog('Something went wrong.');
    await screen.findByText('Something went wrong.');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await expect(resultPromise).resolves.toBeUndefined();
  });

  it('Ctrl+Enter confirms, and does not also trigger a Ctrl+Enter listener from whatever is underneath', async () => {
    render(<ConfirmDialogHost />);
    const strayListener = vi.fn();
    document.addEventListener('keydown', strayListener); // simulates the modal-underneath's own Ctrl+Enter handler
    const resultPromise = confirmDialog({ title: 'Sure?' });
    await screen.findByText('Sure?');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    document.removeEventListener('keydown', strayListener);

    expect(await resultPromise).toBe(true);
    expect(strayListener).not.toHaveBeenCalled();
  });

  it('several dialogs queue and are answered strictly one at a time, in order', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogHost />);
    const firstPromise = confirmDialog({ title: 'First' });
    const secondPromise = confirmDialog({ title: 'Second' });

    expect(await screen.findByText('First')).toBeInTheDocument();
    expect(screen.queryByText('Second')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Confirm/ }));
    expect(await firstPromise).toBe(true);

    expect(await screen.findByText('Second')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Confirm/ }));
    expect(await secondPromise).toBe(true);
  });

  it('a focus-delayed dialog ignores Ctrl+Enter until the delay elapses', async () => {
    vi.useFakeTimers();
    render(<ConfirmDialogHost />);
    const resultPromise = confirmDialog({ title: 'Remove the link too?', focusDelayMs: 500 });
    await vi.waitFor(() => expect(screen.queryByText('Remove the link too?')).toBeInTheDocument());

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);

    vi.advanceTimersByTime(500);
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));

    expect(await resultPromise).toBe(true);
    vi.useRealTimers();
  });

  it('a stale focus-delayed dialog cancels itself once the delay elapses, instead of stealing focus', async () => {
    vi.useFakeTimers();
    render(<ConfirmDialogHost />);
    let stale = false;
    const resultPromise = confirmDialog({ title: 'Remove the link too?', focusDelayMs: 300, isStale: () => stale });
    await vi.waitFor(() => expect(screen.queryByText('Remove the link too?')).toBeInTheDocument());

    stale = true;
    vi.advanceTimersByTime(300);
    await vi.advanceTimersByTimeAsync(0);

    expect(await resultPromise).toBe(false);
    vi.useRealTimers();
  });
});
