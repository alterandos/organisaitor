// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MiniDatePickerPopover } from './MiniDatePicker';

afterEach(cleanup);

describe('the go-to-date picker from the calendar header', () => {
  it('picking a day goes there and closes it; Escape closes it', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<MiniDatePickerPopover anchor={{ left: 0, top: 0, right: 100, bottom: 20 }} anchorDate="2026-10-01" onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Go to a date' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '15' })[0]);
    expect(onSelect).toHaveBeenCalledWith('2026-10-15');
    expect(onClose).toHaveBeenCalled();
    onClose.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
