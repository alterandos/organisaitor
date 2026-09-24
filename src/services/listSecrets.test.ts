// Lists twin of noteSecrets.test.ts — same cache/lock/view mechanism, applied to Lists. The
// crypto queue itself is shared code, already covered by noteSecrets.test.ts; this file only
// covers what's specific here: the List/ListItem field lists and cache.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  isListLocked, listView, isItemLocked, itemView,
  putListSecrets, dropListSecrets, putItemSecrets, dropItemSecrets, clearListSecretsCache,
  LOCKED_LIST_NAME, LOCKED_ITEM_TITLE,
} from '@/services/listSecrets';
import { useSecretsVersion } from '@/services/noteSecrets';
import type { List, ListItem } from '@/types/lists';

function list(overrides: Partial<List> = {}): List {
  return {
    id: 'l1' as never, name: '', description: null, typeId: null, kind: 'reference', color: null, icon: null,
    fieldSchema: [], tabs: [], isEncrypted: true, encryptedPayload: 'cipher-v1',
    createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', ...overrides,
  };
}

function item(overrides: Partial<ListItem> = {}): ListItem {
  return {
    id: 'i1' as never, listId: 'l1' as never, title: '', status: 'want', tabId: null, data: {}, notes: null,
    links: [], order: 0, isEncrypted: true, encryptedPayload: 'cipher-v1',
    createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', ...overrides,
  };
}

beforeEach(() => {
  clearListSecretsCache();
});

describe('listView / isListLocked', () => {
  it('a non-encrypted list passes straight through', () => {
    const l = list({ isEncrypted: false, name: 'Plain' });
    expect(isListLocked(l)).toBe(false);
    expect(listView(l)).toEqual(l);
  });

  it('locked by default; unlocks once the matching payload is cached', () => {
    const l = list();
    expect(isListLocked(l)).toBe(true);
    expect(listView(l).name).toBe(LOCKED_LIST_NAME);

    putListSecrets('l1', { v: 1, name: 'Credentials', description: null, typeId: 'lt-credentials' as never, fieldSchema: [], tabs: [] }, 'cipher-v1');
    expect(isListLocked(l)).toBe(false);
    expect(listView(l).name).toBe('Credentials');
  });

  it('a stale cache entry (payload moved on) re-locks it; a dirty one stays usable regardless', () => {
    putListSecrets('l1', { v: 1, name: 'Old', description: null, typeId: null, fieldSchema: [], tabs: [] }, 'cipher-v1');
    expect(isListLocked(list({ encryptedPayload: 'cipher-v2' }))).toBe(true);

    putListSecrets('l1', { v: 1, name: 'Edited, not yet re-encrypted', description: null, typeId: null, fieldSchema: [], tabs: [] }, 'cipher-v1', true);
    expect(isListLocked(list({ encryptedPayload: 'cipher-v2' }))).toBe(false);
  });

  it('dropListSecrets re-locks and bumps the shared cache-version counter', () => {
    putListSecrets('l1', { v: 1, name: 'X', description: null, typeId: null, fieldSchema: [], tabs: [] }, 'cipher-v1');
    const before = useSecretsVersion.getState().version;
    dropListSecrets('l1');
    expect(useSecretsVersion.getState().version).toBeGreaterThan(before);
    expect(isListLocked(list())).toBe(true);
  });
});

describe('itemView / isItemLocked', () => {
  it('locked by default; unlocks once cached, drop re-locks', () => {
    const i = item();
    expect(isItemLocked(i)).toBe(true);
    expect(itemView(i).title).toBe(LOCKED_ITEM_TITLE);

    putItemSecrets('i1', { v: 1, title: 'My password', data: {}, notes: null, links: [] }, 'cipher-v1');
    expect(isItemLocked(i)).toBe(false);
    expect(itemView(i).title).toBe('My password');

    dropItemSecrets('i1');
    expect(isItemLocked(item())).toBe(true);
  });
});

describe('clearListSecretsCache', () => {
  it('drops both lists and items', () => {
    putListSecrets('l1', { v: 1, name: 'X', description: null, typeId: null, fieldSchema: [], tabs: [] }, 'cipher-v1');
    putItemSecrets('i1', { v: 1, title: 'Y', data: {}, notes: null, links: [] }, 'cipher-v1');
    clearListSecretsCache();
    expect(isListLocked(list())).toBe(true);
    expect(isItemLocked(item())).toBe(true);
  });
});
