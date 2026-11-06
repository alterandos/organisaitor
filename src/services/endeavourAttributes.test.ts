import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useCalendarStore } from '@/store/calendarStore';
import { addBuiltInType } from './itemTypes';
import { addOwnField, periodImpact, removeOwnField, saveFieldsAsType, setAttributeValue, setEndeavourType } from './endeavourAttributes';
import { attributeFields, attributeValue, inheritedAttributes } from '@/utils/endeavourAttributes';
import { pickableTypes } from '@/utils/itemTypes';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import type { CollectionId } from '@/types';

// An Endeavour's attributes and Types (agreed with the user 2026-10-30): a Type's fields and its
// own, defaults copied never changed, the period an ordinary field that's never lost without asking.

beforeEach(() => {
  for (const s of [useTaskStore, useItemTypeStore, useCalendarStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});

const types = () => useItemTypeStore.getState().types;
const col = (id: string) => useTaskStore.getState().collections[id as CollectionId];
const make = (name: string) => useTaskStore.getState().addCollection({ kind: 'project', name });
const PERIOD = { start: '2031-07-28', end: '2031-11-07', breaks: [{ id: 'b', label: 'Break', from: '2031-09-29', to: '2031-10-03' }] };

describe('default Types', () => {
  it('give the person their own copy, reused while unchanged; once changed, the default again is a fresh copy', () => {
    const a = addBuiltInType('semester')!;
    expect(types()[a]).toMatchObject({ name: 'Semester', builtIn: 'semester', usedFor: ['endeavour'], fields: [{ type: 'period', inherit: true }] });
    expect(addBuiltInType('semester')).toBe(a);
    useItemTypeStore.getState().updateItemType(a, { fields: [...types()[a].fields, { id: 'x', name: 'Faculty', type: 'text' }] });
    const b = addBuiltInType('semester')!;
    expect(b).not.toBe(a);
    expect(types()[b].name).toBe('Semester (default)');
    expect(types()[b].fields).toHaveLength(1);
  });

  it('an Endeavour Type isn’t offered for items, nor an item Type for Endeavours', () => {
    const sem = addBuiltInType('semester')!;
    const exam = addBuiltInType('exam')!;
    expect(pickableTypes(types()).map((t) => t.id)).toContain(exam);
    expect(pickableTypes(types()).map((t) => t.id)).not.toContain(sem);
    expect(pickableTypes(types(), null, 'endeavour').map((t) => t.id)).toEqual([sem]);
  });
});

describe('attributes', () => {
  it('a Type’s fields, then its own; values kept by field id; saved as a Type', () => {
    const id = make('GEOS215');
    setEndeavourType(id, addBuiltInType('subject'));
    addOwnField(id, { name: 'Lecturer', type: 'text', inherit: false });
    const fields = attributeFields(col(id), types());
    expect(fields.map((f) => [f.field.name, f.fromType])).toEqual([['Code', true], ['Lecturer', false]]);
    setAttributeValue(id, 'code', 'GEOS215');
    expect(attributeValue(col(id), fields[0].field)).toBe('GEOS215');

    const t = saveFieldsAsType(id, 'Science subject')!;
    expect(types()[t]).toMatchObject({ usedFor: ['endeavour'], fields: [{ name: 'Code' }, { name: 'Lecturer' }] });
    expect(col(id).attributes).toMatchObject({ typeId: t, fields: [], values: { code: 'GEOS215' } });
  });

  it('a field marked "parts take this" shows on parts that don’t have it; "Set its own" replaces it there', () => {
    const sem = make('Semester 2');
    const sub = make('GEOS215');
    useTaskStore.getState().addEndeavourLink(sub, 'partOf', sem);
    const faculty = addOwnField(sem, { name: 'Faculty', type: 'text', inherit: true })!;
    addOwnField(sem, { name: 'Notes', type: 'text' });
    setAttributeValue(sem, faculty, 'Science');
    expect(inheritedAttributes(sub, useTaskStore.getState().collections, types()).map((x) => [x.field.name, x.value, x.fromId])).toEqual([['Faculty', 'Science', sem]]);
    addOwnField(sub, { name: 'Faculty', type: 'text' }, faculty);
    setAttributeValue(sub, faculty, 'Arts');
    expect(inheritedAttributes(sub, useTaskStore.getState().collections, types())).toEqual([]);
  });

  it('a period with no period field shows as its own field; a Type without one keeps it; removing the field clears it, its parts no longer take it', () => {
    const sem = make('Semester 2');
    const sub = make('GEOS215');
    useTaskStore.getState().addEndeavourLink(sub, 'partOf', sem);
    useTaskStore.getState().updateCollection(sem, { period: PERIOD });   // given before attributes existed
    const loose = attributeFields(col(sem), types()).find((f) => f.field.type === 'period')!;
    expect(loose.fromType).toBe(false);
    setEndeavourType(sem, addBuiltInType('subject'));                   // no period in this Type
    expect(col(sem).period).toEqual(PERIOD);
    expect(effectivePeriod(sub, useTaskStore.getState().collections)?.from).toBe(sem);

    useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2031-07-29', collectionId: sub,
      repeat: { freq: 'weekly', interval: 1, endKind: 'until', count: null, until: '2031-11-07', breakSkips: ['2031-09-30'], exceptions: ['2031-09-30'] } });
    expect(periodImpact(sem)).toBe(1);
    removeOwnField(sem, loose.field.id);
    expect(col(sem).period).toBeNull();
    expect(effectivePeriod(sub, useTaskStore.getState().collections)).toBeNull();
  });

  it('a second period field isn’t added', () => {
    const id = make('Summer subject');
    expect(addOwnField(id, { name: 'Teaching', type: 'period' })).toBeTruthy();
    expect(addOwnField(id, { name: 'Another', type: 'period' })).toBeNull();
  });
});
