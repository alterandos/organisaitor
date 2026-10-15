import { describe, expect, it } from 'vitest';
import { GLOSSARY_TYPES, factsFromText, factsToText, getStructuredTagType, glossaryMeaning } from './structuredTagTypes';

describe('profile records (2026-10-15)', () => {
  it('are in the Glossary, their meaning the summary', () => {
    expect(getStructuredTagType('profile')?.fields.map((f) => f.type)).toContain('facts');
    expect(GLOSSARY_TYPES.profile).toBe('summary');
    expect(glossaryMeaning({ typeKey: 'profile', fields: { summary: 'A large bird of prey' } })).toBe('A large bird of prey');
  });

  it('facts read "Label: value" lines (a line without a colon is a value alone) and write them back', () => {
    const facts = factsFromText('Family: Accipitridae\n\n  Wingspan : 2 m \nendangered\nTime: 10:30');
    expect(facts).toEqual([
      { label: 'Family', value: 'Accipitridae' },
      { label: 'Wingspan', value: '2 m' },
      { label: '', value: 'endangered' },
      { label: 'Time', value: '10:30' },
    ]);
    expect(factsFromText(factsToText(facts))).toEqual(facts);
  });
});
