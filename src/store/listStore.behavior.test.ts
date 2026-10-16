import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useListStore } from '@/store/listStore';
import type { ListId, ListItemId } from '@/types/lists';

beforeEach(() => {
  useListStore.setState(useListStore.getInitialState(), true);
});

function seedChecklist(titles: string[]) {
  const listId = useListStore.getState().addList({ name: 'Groceries', typeId: 'lt-shopping' as never });
  const ids = titles.map((title) => useListStore.getState().addListItem({ listId, title }));
  return { listId, ids };
}

// Display order used by ChecklistView: unchecked by order, then checked by order.
function displayOrder(listId: ListId): string[] {
  const items = Object.values(useListStore.getState().listItems)
    .filter((i) => i.listId === listId)
    .sort((a, b) => a.order - b.order);
  return [...items.filter((i) => i.status !== 'done'), ...items.filter((i) => i.status === 'done')].map((i) => i.title);
}

describe('checklist lists', () => {
  it('the Shopping built-in creates a checklist-kind list', () => {
    const { listId } = seedChecklist([]);
    expect(useListStore.getState().lists[listId].kind).toBe('checklist');
  });

  it('checking an item marks it done and moves it to the very bottom', () => {
    const { listId, ids: [milk, , bread] } = seedChecklist(['Milk', 'Eggs', 'Bread']);
    useListStore.getState().toggleListItemChecked(bread);
    useListStore.getState().toggleListItemChecked(milk);
    expect(useListStore.getState().listItems[milk].status).toBe('done');
    // Milk was checked last, so it sits below Bread even though it was added first.
    expect(displayOrder(listId)).toEqual(['Eggs', 'Bread', 'Milk']);
  });

  it('unchecking returns the item to the unchecked group', () => {
    const { listId, ids: [milk] } = seedChecklist(['Milk', 'Eggs']);
    useListStore.getState().toggleListItemChecked(milk);
    useListStore.getState().toggleListItemChecked(milk);
    expect(useListStore.getState().listItems[milk].status).toBe('want');
    expect(displayOrder(listId)).toEqual(['Eggs', 'Milk']);
  });

  it('a newly added item lands after every existing item, even after checks bumped orders', () => {
    const { listId, ids: [milk] } = seedChecklist(['Milk', 'Eggs']);
    useListStore.getState().toggleListItemChecked(milk);
    useListStore.getState().toggleListItemChecked(milk);
    useListStore.getState().addListItem({ listId, title: 'Butter' });
    expect(displayOrder(listId)).toEqual(['Eggs', 'Milk', 'Butter']);
  });

  it('ignores an unknown id', () => {
    expect(() => useListStore.getState().toggleListItemChecked('nope' as ListItemId)).not.toThrow();
  });
});

describe('built-in list types on rehydrate', () => {
  it('re-adds a built-in type missing from persisted state, keeping custom types', async () => {
    localStorage.setItem('lists-storage', JSON.stringify({
      version: 5,
      state: {
        lists: {}, listItems: {},
        listTypes: {
          'lt-custom1': { id: 'lt-custom1', name: 'Recipes', icon: '🍳', color: null, kind: 'reference', defaultFields: [], isBuiltIn: false },
        },
      },
    }));
    vi.resetModules();
    const { useListStore: fresh } = await import('@/store/listStore');
    const types = fresh.getState().listTypes as Record<string, { name: string }>;
    expect(types['lt-shopping']?.name).toBe('Shopping');
    expect(types['lt-custom1']?.name).toBe('Recipes');
    localStorage.removeItem('lists-storage');
  });

  it('a saved copy of a built-in type gains default fields added in code since, keeping the user’s edits', async () => {
    localStorage.setItem('lists-storage', JSON.stringify({
      version: 7,
      state: {
        lists: {}, listItems: {},
        listTypes: {
          'lt-dictionary': { id: 'lt-dictionary', name: 'My words', icon: '📕', color: null, kind: 'reference', isBuiltIn: true,
            defaultFields: [{ id: 'lf-meaning', name: 'Meaning', type: 'text' }, { id: 'lf-mine', name: 'Mine', type: 'text' }] },
        },
      },
    }));
    vi.resetModules();
    const { useListStore: fresh } = await import('@/store/listStore');
    const dict = fresh.getState().listTypes['lt-dictionary' as never];
    expect(dict.name).toBe('My words');
    expect(dict.defaultFields.map((f) => f.id)).toEqual(['lf-meaning', 'lf-mine', 'lf-pos', 'lf-example', 'lf-source', 'lf-added']);
    expect(dict.titleColumn).toBe('Word');
    localStorage.removeItem('lists-storage');
  });
});
