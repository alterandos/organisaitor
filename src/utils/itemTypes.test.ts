import { describe, expect, it } from 'vitest';
import type { ItemType, ItemTypeId } from '@/types';
import { canExtend, fieldValuesText, partDue, resolveItemType, typeChain, typeDescendants } from './itemTypes';

const T = (id: string, extendsId: string | null, extra: Partial<ItemType> = {}): ItemType => ({
  id: id as ItemTypeId, name: id, icon: null, extendsId: extendsId as ItemTypeId | null,
  fields: [], defaults: {}, parts: [], archivedAt: null, createdAt: '', updatedAt: '', ...extra,
});

const types = {
  assessment: T('assessment', null, {
    fields: [{ id: 'weight', name: 'Weight', type: 'number', unit: '%' }],
    defaults: { makeAs: 'deadline', important: true },
    parts: [{ id: 'plan', kind: 'task', title: 'Plan', offsetDays: 14 }],
  }),
  exam: T('exam', 'assessment', {
    fields: [{ id: 'room', name: 'Room', type: 'text' }],
    defaults: { makeAs: 'event' },
    parts: [{ id: 'result', kind: 'followUp', title: 'Check the result', offsetDays: 14 }],
  }),
  final: T('final', 'exam'),
} as Record<string, ItemType>;

describe('Types', () => {
  it('a Type has what the Types it extends have, then its own; its own defaults win', () => {
    const r = resolveItemType(types, 'exam' as ItemTypeId)!;
    expect(r.chain.map((t) => t.id)).toEqual(['assessment', 'exam']);
    expect(r.fields.map((f) => f.id)).toEqual(['weight', 'room']);
    expect(r.parts.map((p) => p.id)).toEqual(['plan', 'result']);
    expect(r.defaults).toEqual({ makeAs: 'event', important: true });
  });

  it('a missing Type up the chain just ends it; a stored loop does not hang', () => {
    const { assessment: _gone, ...rest } = types;
    void _gone;
    expect(typeChain(rest, 'exam' as ItemTypeId).map((t) => t.id)).toEqual(['exam']);
    const loop = { a: T('a', 'b'), b: T('b', 'a') };
    expect(typeChain(loop, 'a' as ItemTypeId).map((t) => t.id)).toEqual(['b', 'a']);
    expect(resolveItemType(types, 'gone' as ItemTypeId)).toBeNull();
  });

  it('refuses a Type that would extend itself, directly or further down', () => {
    expect(canExtend(types, 'exam' as ItemTypeId, 'exam' as ItemTypeId)).toBe('self');
    expect(canExtend(types, 'assessment' as ItemTypeId, 'final' as ItemTypeId)).toBe('loop');
    expect(canExtend(types, 'final' as ItemTypeId, 'assessment' as ItemTypeId)).toBeNull();
    expect(canExtend(types, null, 'exam' as ItemTypeId)).toBeNull();
    expect(typeDescendants(types, 'assessment' as ItemTypeId).map((t) => t.id)).toEqual(['exam', 'final']);
  });

  it('a part is dated from the item: a task before it, a follow-up after', () => {
    expect(partDue({ id: 'p', kind: 'task', title: '', offsetDays: 14 }, '2026-11-20')).toBe('2026-11-06');
    expect(partDue({ id: 'p', kind: 'followUp', title: '', offsetDays: 14 }, '2026-11-20')).toBe('2026-12-04');
  });

  it('field values read as one line, leaving out what is not filled in', () => {
    const r = resolveItemType(types, 'exam' as ItemTypeId)!;
    expect(fieldValuesText(r.fields, { weight: 40, room: '' })).toBe('Weight: 40%');
    expect(fieldValuesText(r.fields, undefined)).toBe('');
  });
});
