// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CalendarItemHoverCard } from './CalendarItemHoverCard';
import { useCalendarStore } from '@/store/calendarStore';

beforeEach(() => { useCalendarStore.setState(useCalendarStore.getInitialState(), true); });
afterEach(() => { cleanup(); });

describe('CalendarItemHoverCard', () => {
  it('shows an event whole: its title, its date and times, where, notes and links', () => {
    const id = useCalendarStore.getState().addEvent({
      title: 'A very long event title that a month cell cuts off', date: '2026-10-18', startTime: '10:00', endTime: '12:30', location: 'Minervastrasse 65, Zürich',
    });
    render(<CalendarItemHoverCard
      anchor={{ left: 10, top: 10, right: 60, bottom: 30 }}
      item={{ kind: 'event', id, title: 'A very long event title that a month cell cuts off', typeIcon: '📅', time: '10:00', date: '2026-10-18', notes: 'Bring water', links: ['https://x.example'], collectionId: null }}
    />);
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('A very long event title that a month cell cuts off');
    expect(card).toHaveTextContent('10:00 – 12:30');
    expect(card).toHaveTextContent('Minervastrasse 65, Zürich');
    expect(card).toHaveTextContent('Bring water');
    expect(card).toHaveTextContent('https://x.example');
  });
});
