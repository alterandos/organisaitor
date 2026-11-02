// @vitest-environment jsdom
//
// "Part of" / "Related to" in the Endeavour editor: each linked Endeavour once, even when a link is
// stored twice (found 2026-10-30: the editor of a sub-Endeavour drew two chips with one key) or a
// symmetric link is stored on both ends.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EndeavourLinksField } from './EndeavourLinksField';
import { useTaskStore } from '@/store/taskStore';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';

beforeEach(() => { useTaskStore.setState(useTaskStore.getInitialState(), true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('EndeavourLinksField', () => {
  it('shows a link stored twice once, and removing it takes off every copy', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const parent = useTaskStore.getState().addCollection({ kind: 'project', name: 'Semester 2' });
    const sub = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    const link = { kind: 'partOf' as const, targetId: parent, createdAt: '2031-01-01T00:00:00.000Z' };
    const c = useTaskStore.getState().collections[sub];
    useTaskStore.setState({ collections: { ...useTaskStore.getState().collections, [sub]: { ...c, links: [link, link] } } });

    render(<EndeavourLinksField kind="partOf" selfId={sub as CollectionId} />);
    expect(screen.getAllByText('Semester 2')).toHaveLength(1);
    expect(errors.mock.calls.some((args) => String(args[0]).includes('same key'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: LABELS.endeavourLinks.remove('Semester 2') }));
    expect(useTaskStore.getState().collections[sub].links).toEqual([]);
  });

  it('a symmetric link stored on both ends shows once', () => {
    const a = useTaskStore.getState().addCollection({ kind: 'project', name: 'Essay' });
    const b = useTaskStore.getState().addCollection({ kind: 'project', name: 'Lab report' });
    const at = '2031-01-01T00:00:00.000Z';
    const all = useTaskStore.getState().collections;
    useTaskStore.setState({ collections: {
      ...all,
      [a]: { ...all[a], links: [{ kind: 'related', targetId: b, createdAt: at }] },
      [b]: { ...all[b], links: [{ kind: 'related', targetId: a, createdAt: at }] },
    } });
    render(<EndeavourLinksField kind="related" selfId={a as CollectionId} />);
    expect(screen.getAllByText('Lab report')).toHaveLength(1);
  });
});
