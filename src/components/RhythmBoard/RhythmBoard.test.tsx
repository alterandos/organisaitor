// @vitest-environment jsdom
//
// A rhythm's board (screen B of docs/features/endeavours.md) on its Endeavour's home, and its
// occurrences in Tasks: a click ticks one, and what's behind is said.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EndeavoursSection } from '@/components/EndeavoursSection/EndeavoursSection';
import { RhythmDueList } from './RhythmDueList';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useUIStore } from '@/store/uiStore';
import { saveStreams } from '@/services/rhythms';
import { tickIndex, tickKey } from '@/utils/rhythms';
import type { CollectionId, RhythmStream } from '@/types';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0));   // Wednesday 28 October 2026
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useTrackerStore.setState(useTrackerStore.getInitialState(), true);
  useUIStore.setState({ ...useUIStore.getInitialState(), activeView: 'endeavours' }, true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const reading: RhythmStream = {
  id: 'read', label: 'Reading', kind: 'doBy', typeId: null, start: '2026-10-01', time: null, notebookId: null,
  rule: { kind: 'repeat', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [1] } },
  show: { calendar: 'marker', tasks: 'near', notify: false },
};

function geos(): { geos: CollectionId; rhythm: CollectionId } {
  const s = useTaskStore.getState();
  const g = s.addCollection({ kind: 'project', name: 'GEOS215' });
  const r = s.addCollection({ kind: 'routine', name: 'GEOS215 weekly' });
  s.updateCollection(r, { collectionId: g });
  saveStreams(r, [reading]);
  return { geos: g, rhythm: r };
}

describe('the rhythm board', () => {
  it('shows on the Endeavour home, says what is behind, and a click ticks an occurrence', () => {
    const { geos: g, rhythm } = geos();
    act(() => { useUIStore.getState().openEndeavourHome(g); });
    render(<EndeavoursSection />);
    const board = screen.getByRole('region', { name: 'Rhythm: GEOS215 weekly' });
    expect(within(board).getByText('2 behind')).toBeInTheDocument();   // 19 and 26 Oct; 5 and 12 Oct are older: missed
    expect(screen.getByRole('region', { name: 'Behind' })).toHaveTextContent('Reading');
    fireEvent.click(within(board).getByTitle(/Reading, .*19.*: Behind/));
    expect(tickIndex(useTrackerStore.getState().entries, useTaskStore.getState().collections).get(tickKey(rhythm, 'read', '2026-10-19'))?.status).toBe('done');
    expect(within(board).getByText('1 behind')).toBeInTheDocument();
  });
});

describe('rhythms in Tasks', () => {
  it('lists what its stream shows there (behind or close), ticked like a task, under the Endeavour filter', () => {
    const { geos: g } = geos();
    const s = useTaskStore.getState();
    const other = s.addCollection({ kind: 'project', name: 'Other' });
    render(<RhythmDueList scope={null} />);
    const list = screen.getByRole('region', { name: 'From your rhythms' });
    expect(within(list).getAllByText('Reading')).toHaveLength(2);   // 19 Oct and 26 Oct behind; 2 Nov not close yet
    fireEvent.click(within(list).getAllByRole('checkbox')[0]);
    expect(within(list).getAllByText('Reading')).toHaveLength(1);
    cleanup();
    const { container } = render(<RhythmDueList scope={new Set([other])} />);
    expect(container).toBeEmptyDOMElement();
    void g;
  });
});
