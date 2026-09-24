// @vitest-environment jsdom
//
// A modal-prefill regression test — the safety net for brief 01 Task 4's lazy-initializer
// rewrite (CLAUDE.md "Form state that starts from an item"): create mode opens blank, edit mode
// shows the item's values, and switching directly from editing item A to item B (via the `key`
// App.tsx mounts it with) shows B's values with none of A's left over.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddCollectionModal } from './AddCollectionModal';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import type { Collection } from '@/types';

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
});

// Mirrors how App.tsx actually mounts it: `{openModal === 'add-collection' && <AddCollectionModal key={editingCollection?.id ?? 'new'} />}`
function Mounted() {
  const openModal = useUIStore((s) => s.openModal);
  const editingCollection = useUIStore((s) => s.editingCollection);
  const isVisible = editingCollection !== null || openModal === 'add-collection';
  return isVisible ? <AddCollectionModal key={editingCollection?.id ?? 'new'} /> : null;
}

describe('AddCollectionModal prefill', () => {
  it('create mode opens with a blank name field', () => {
    useUIStore.setState({ openModal: 'add-collection' });
    render(<Mounted />);
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('edit mode shows the item\'s existing values', () => {
    const a: Collection = {
      id: 'c1' as never, kind: 'project', name: 'Project A', description: 'Desc A', color: null,
      purposeIds: [], tagIds: [], deadline: '2030-01-01', completed: false, completedAt: null,
      fieldSchema: [], routineTasks: [], repeatConfig: null, collectionId: null, archivedAt: null,
      createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    useTaskStore.setState({ collections: { c1: a } as never });
    useUIStore.setState({ editingCollection: a });
    render(<Mounted />);
    expect(screen.getByLabelText('Name')).toHaveValue('Project A');
    expect(screen.getByLabelText('Description')).toHaveValue('Desc A');
  });

  it('switching directly from editing A to editing B shows B\'s values, not A\'s leftovers', () => {
    const a: Collection = {
      id: 'c1' as never, kind: 'project', name: 'Project A', description: 'Desc A', color: null,
      purposeIds: [], tagIds: [], deadline: '', completed: false, completedAt: null,
      fieldSchema: [], routineTasks: [], repeatConfig: null, collectionId: null, archivedAt: null,
      createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    };
    const b: Collection = { ...a, id: 'c2' as never, name: 'Project B', description: '' };
    useTaskStore.setState({ collections: { c1: a, c2: b } as never });
    useUIStore.setState({ editingCollection: a });
    render(<Mounted />);
    expect(screen.getByLabelText('Name')).toHaveValue('Project A');

    act(() => { useUIStore.setState({ editingCollection: b }); });
    expect(screen.getByLabelText('Name')).toHaveValue('Project B');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('cancelling (Escape) leaves the store untouched', async () => {
    useUIStore.setState({ openModal: 'add-collection' });
    render(<Mounted />);
    await userEvent.type(screen.getByLabelText('Name'), 'Never saved');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(Object.keys(useTaskStore.getState().collections)).toHaveLength(0);
    expect(useUIStore.getState().openModal).toBeNull();
  });

  it('Ctrl+Enter submits the form and creates the collection', async () => {
    useUIStore.setState({ openModal: 'add-collection' });
    render(<Mounted />);
    await userEvent.type(screen.getByLabelText('Name'), 'New Endeavour');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    const created = Object.values(useTaskStore.getState().collections);
    expect(created).toHaveLength(1);
    expect(created[0].name).toBe('New Endeavour');
  });
});
