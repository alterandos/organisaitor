import { beforeEach, describe, expect, it } from 'vitest';
import { useListStore } from '@/store/listStore';
import { builtInList, builtInListItem, ensureBuiltInList, type BuiltInListSpec } from './builtInLists';
import type { ListTypeId } from '@/types/lists';

const BOOKS = 'lt-books' as ListTypeId;
const DICTIONARY = 'lt-dictionary' as ListTypeId;

beforeEach(() => { useListStore.setState(useListStore.getInitialState(), true); });

describe('a built-in list fed from elsewhere (2026-11-02)', () => {
  it('is made the first time, with its type’s kind, icon and fields, then found again', () => {
    const spec: BuiltInListSpec = { typeId: DICTIONARY, name: 'Dictionary' };
    expect(builtInList(spec)).toBeNull();
    const id = ensureBuiltInList(spec);
    const list = useListStore.getState().lists[id];
    const type = useListStore.getState().listTypes[DICTIONARY];
    expect(list).toMatchObject({ name: 'Dictionary', typeId: DICTIONARY, kind: type.kind, icon: type.icon });
    expect(list.fieldSchema.map((f) => f.id)).toEqual(type.defaultFields.map((f) => f.id));
    expect(ensureBuiltInList(spec)).toBe(id);
  });

  it('a general type is told apart by name; a list made before a field was added gains it', () => {
    const other = useListStore.getState().addList({ name: 'Books I own', typeId: BOOKS, kind: 'watchlist', fieldSchema: [] });
    const spec: BuiltInListSpec = { typeId: BOOKS, name: 'Reading list', matchName: true };
    expect(builtInList(spec)).toBeNull();
    const old = useListStore.getState().addList({ name: 'reading list', typeId: BOOKS, kind: 'watchlist', fieldSchema: [] });
    expect(ensureBuiltInList(spec)).toBe(old);
    expect(useListStore.getState().lists[old].fieldSchema.length).toBeGreaterThan(0);
    expect(useListStore.getState().lists[other].fieldSchema).toEqual([]);
  });

  it('finds an item by its title, any case and spacing', () => {
    const id = ensureBuiltInList({ typeId: DICTIONARY, name: 'Dictionary' });
    const itemId = useListStore.getState().addListItem({ listId: id, title: 'Ephemeral', data: {} });
    expect(builtInListItem(id, '  ephemeral ')?.id).toBe(itemId);
    expect(builtInListItem(id, 'other')).toBeNull();
  });
});
