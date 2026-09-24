import { describe, expect, it } from 'vitest';
import { getOrderedEndeavours } from '@/utils/collections';
import type { Collection, CollectionId } from '@/types';

function collection(overrides: Partial<Collection>): Collection {
  return {
    id: 'c1' as CollectionId,
    name: 'Test',
    kind: 'project',
    color: null,
    tagIds: [],
    purposeIds: [],
    collectionId: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deadline: null,
    completed: false,
    completedAt: null,
    fieldSchema: [],
    routineTasks: [],
    repeatConfig: null,
    ...overrides,
  } as Collection;
}

describe('getOrderedEndeavours', () => {
  it('orders projects before lists', () => {
    const record: Record<string, Collection> = {
      l1: collection({ id: 'l1' as CollectionId, kind: 'list', name: 'A List' }),
      p1: collection({ id: 'p1' as CollectionId, kind: 'project', name: 'A Project' }),
    };
    const out = getOrderedEndeavours(record);
    expect(out.map((c) => c.id)).toEqual(['p1', 'l1']);
  });

  it('excludes archived Endeavours', () => {
    const record: Record<string, Collection> = {
      p1: collection({ id: 'p1' as CollectionId, kind: 'project' }),
      p2: collection({ id: 'p2' as CollectionId, kind: 'project', archivedAt: '2026-01-01T00:00:00.000Z' }),
    };
    const out = getOrderedEndeavours(record);
    expect(out.map((c) => c.id)).toEqual(['p1']);
  });

  it('excludes trackers and routines (only project/list kinds)', () => {
    const record: Record<string, Collection> = {
      t1: collection({ id: 't1' as CollectionId, kind: 'tracker' }),
      r1: collection({ id: 'r1' as CollectionId, kind: 'routine' }),
      p1: collection({ id: 'p1' as CollectionId, kind: 'project' }),
    };
    const out = getOrderedEndeavours(record);
    expect(out.map((c) => c.id)).toEqual(['p1']);
  });

  it('returns an empty array for an empty record', () => {
    expect(getOrderedEndeavours({})).toEqual([]);
  });
});
