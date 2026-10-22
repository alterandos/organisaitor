// @vitest-environment jsdom
//
// The new calendar item modal, rebuilt 2026-10-19: one field order for every kind, More options
// closed for every kind, Ctrl+Tab between kinds, the Notify checkbox, and the magic wand.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AddCalendarItemModal } from './AddCalendarItemModal';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 24, 10, 0));   // Thursday 24 September 2026
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const heading = () => document.querySelector('[class*="header"] [class*="title"]')?.textContent ?? '';
const moreOptions = () => screen.getByRole('button', { name: /More options|Fewer options/ });

describe('AddCalendarItemModal', () => {
  it('More options starts closed for every kind, and opens and closes', () => {
    for (const kind of ['event', 'reminder', 'deadline'] as const) {
      useUIStore.setState({ calendarItemKind: kind });
      render(<AddCalendarItemModal />);
      expect(moreOptions()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText(/Tentative/)).toBeNull();
      fireEvent.click(moreOptions());
      expect(screen.getByText(/Tentative/)).toBeInTheDocument();
      fireEvent.click(moreOptions());
      expect(screen.queryByText(/Tentative/)).toBeNull();
      cleanup();
    }
  });

  it('Ctrl+Tab steps Event → Reminder → Deadline, Ctrl+Shift+Tab back; the heading shows its icon', () => {
    render(<AddCalendarItemModal />);
    expect(heading()).toBe('📅New Event');
    fireEvent.keyDown(document, { key: 'Tab', ctrlKey: true });
    expect(heading()).toBe('⏰New Reminder');
    fireEvent.keyDown(document, { key: 'Tab', ctrlKey: true });
    expect(heading()).toBe('🏁New Deadline');
    fireEvent.keyDown(document, { key: 'Tab', ctrlKey: true });
    expect(heading()).toBe('📅New Event');
    fireEvent.keyDown(document, { key: 'Tab', ctrlKey: true, shiftKey: true });
    expect(heading()).toBe('🏁New Deadline');
  });

  it('a reminder or deadline notifies by default; unticking Notify saves it as never notifying', () => {
    useUIStore.setState({ calendarItemKind: 'deadline' });
    render(<AddCalendarItemModal />);
    fireEvent.change(screen.getByPlaceholderText('Deadline title'), { target: { value: 'Essay' } });
    const notify = screen.getByRole('checkbox', { name: 'Notify me' });
    expect(notify).toBeChecked();
    fireEvent.click(notify);
    fireEvent.click(screen.getByRole('button', { name: 'Add Deadline' }));
    const [saved] = Object.values(useCalendarStore.getState().deadlines);
    expect(saved).toMatchObject({ title: 'Essay', notify: false, notifyDaysBefore: 1, notifyAtTime: '17:00' });
  });

  it('the magic wand fills in the form from pasted text', () => {
    render(<AddCalendarItemModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill in from text' }));
    const box = screen.getByRole('textbox', { name: 'Fill in from text' });
    const text = 'Every 3rd Sunday of the month until December 19, 2027 hash run is on at Minervastrasse 65, 8032 Zürich, Switzerland · Zürich, ZH https://www.meetup.com/x/events/1/';
    fireEvent.paste(box, { clipboardData: { getData: () => text } });
    expect(screen.getByPlaceholderText('Event title')).toHaveValue('Hash run');
    const dateField = screen.getByRole('group', { name: 'Date' });   // DateInput: day, month and year
    expect(within(dateField).getByLabelText('Year', { selector: 'input' })).toHaveValue('2026');
    expect(within(dateField).getByLabelText('Month', { selector: 'input' })).toHaveValue('10');
    expect(within(dateField).getByLabelText('Day', { selector: 'input' })).toHaveValue('18');
    expect(screen.getByPlaceholderText('Address or link')).toHaveValue('Minervastrasse 65, 8032 Zürich, Switzerland');
    expect(moreOptions()).toHaveAttribute('aria-expanded', 'true');   // the repeat it found is shown
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));
    const [saved] = Object.values(useCalendarStore.getState().events);
    expect(saved).toMatchObject({
      title: 'Hash run', date: '2026-10-18', links: ['https://www.meetup.com/x/events/1/'],
      repeat: { freq: 'monthly', monthWeekday: { week: 3, day: 0 }, endKind: 'until', until: '2027-12-19' },
    });
  });

  it('text the wand can read nothing from says so and changes nothing', () => {
    render(<AddCalendarItemModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill in from text' }));
    const box = screen.getByRole('textbox', { name: 'Fill in from text' });
    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
    expect(screen.getByText('Nothing to fill in from that text.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Event title')).toHaveValue('');
  });
});
