// @vitest-environment jsdom
//
// An Endeavour's repeating classes and Work, week by week (phase 7 (e)): a click marks Work done or
// a class attended; an unmarked past class shows as not attended, and only Work counts as behind.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ItemBoard } from './ItemBoard';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { LABELS } from '@/config/labels';

const TODAY = '2031-03-20';   // a Thursday

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2031, 2, 20, 10, 0));
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('ItemBoard', () => {
  it('marks dates, shows unmarked classes as not attended, and counts only Work as behind', () => {
    const id = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    const lec = useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2031-03-11', startTime: '12:00', collectionId: id, repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [2] } });
    const quiz = useCalendarStore.getState().addDeadline({ title: 'Quiz', date: '2031-03-14', collectionId: id, repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [5] } });
    render(<ItemBoard endeavour={useTaskStore.getState().collections[id]} today={TODAY} />);

    const board = screen.getByRole('region', { name: LABELS.itemBoard.title('GEOS215') });
    expect(board).toHaveTextContent(LABELS.itemBoard.behindCount(1));        // the quiz on the 14th
    expect(board).toHaveTextContent(LABELS.itemBoard.notMarkedCount(2));     // the lectures on the 11th and 18th

    fireEvent.click(screen.getAllByTitle(/^Lecture, .*: Not marked as attended$/)[0]);
    expect(useCalendarStore.getState().events[lec].attendedDates).toHaveLength(1);
    fireEvent.click(screen.getAllByTitle(/^Quiz, .*: Behind$/)[0]);
    expect(useCalendarStore.getState().deadlines[quiz].doneDates).toEqual(['2031-03-14']);
    expect(board).not.toHaveTextContent(LABELS.itemBoard.behindCount(1));
  });
});
