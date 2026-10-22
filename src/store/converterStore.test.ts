import { beforeEach, describe, expect, it } from 'vitest';
import { useConverterStore } from './converterStore';
import { useTrashStore } from './trashStore';
import { restoreFromTrash } from '@/services/trash';

// The person's own converters (store/converterStore.ts): deleting goes to the Recycling Bin, and
// restoring brings the converter back as it was.

beforeEach(() => {
  useConverterStore.setState(useConverterStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
});

describe('converters', () => {
  it('add, use, delete to the Recycling Bin, restore', () => {
    const s = useConverterStore.getState();
    const id = s.addConverter({ name: ' CO₂ to carbon ', icon: null, inputs: [{ key: 'co2', label: 'CO₂', unit: 'kg' }], output: { key: 'c', label: 'Carbon', unit: 'kg' }, formula: 'co2 * 12/44', inverse: 'c * 44/12' });
    expect(useConverterStore.getState().converters[id].name).toBe('CO₂ to carbon');
    s.markUsed(id);
    s.markUsed('length');
    expect(useConverterStore.getState().recent).toEqual(['length', id]);

    useConverterStore.getState().deleteConverter(id);
    expect(useConverterStore.getState().converters[id]).toBeUndefined();
    expect(useConverterStore.getState().recent).toEqual(['length']);
    const [entry] = Object.values(useTrashStore.getState().entries);
    expect(entry).toMatchObject({ kind: 'converter', title: 'CO₂ to carbon' });

    expect(restoreFromTrash(entry.id)).toBe(true);
    expect(useConverterStore.getState().converters[id].formula).toBe('co2 * 12/44');
  });
});
