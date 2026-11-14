import { describe, expect, it } from 'vitest';
import { blocksHolding } from './glossaryPlaces';

// 2026-11-14: an Example's card says which blocks it's shown in, worked out from the notes.
describe('blocksHolding', () => {
  it('names the nearest block around each chip or card of the record, and none for one in plain text', () => {
    const chip = { type: 'glossaryChip', attrs: { entryId: 'ex1' } };
    const doc = { type: 'doc', content: [
      { type: 'argument', content: [{ type: 'prosConsPoint', content: [{ type: 'paragraph', content: [chip] }] }] },
      { type: 'paragraph', content: [chip] },
      { type: 'caseStudy', content: [{ type: 'caseField', content: [{ type: 'paragraph', content: [{ type: 'glossaryChip', attrs: { entryId: 'other' } }] }] }] },
    ] };
    expect(blocksHolding(JSON.stringify(doc), 'ex1')).toEqual(['argument']);
    expect(blocksHolding('not json ex1', 'ex1')).toEqual([]);
  });
});
