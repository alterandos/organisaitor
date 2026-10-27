import { describe, expect, it } from 'vitest';
import { GLOSSARY_TYPES, factsFromText, factsToText, getStructuredTagType, glossaryMeaning, glossaryKinds, glossaryNames, namedFieldLine, takeNamedLines, NAMED_FIELD_ID } from './structuredTagTypes';

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

describe('an acronym and what it stands for: one record, made from either end', () => {
  it('reads the short and long names wherever the record keeps them', () => {
    expect(glossaryNames({ typeKey: 'acronym', term: 'ASX', fields: { expansion: 'Australian Securities Exchange' } }))
      .toEqual({ short: 'ASX', long: 'Australian Securities Exchange' });
    expect(glossaryNames({ typeKey: 'definition', term: 'Australian Securities Exchange', fields: { acronym: 'ASX' } }))
      .toEqual({ short: 'ASX', long: 'Australian Securities Exchange' });
    expect(glossaryNames({ typeKey: 'concept', term: 'Osmosis', fields: {} })).toEqual({ short: null, long: 'Osmosis' });
  });
  it('counts a record as every kind it covers, its own first', () => {
    expect(glossaryKinds({ typeKey: 'definition', term: 'World Health Organization', fields: { acronym: 'WHO' } })).toEqual(['definition', 'acronym']);
    expect(glossaryKinds({ typeKey: 'acronym', term: 'ASX', fields: { expansion: 'Australian Securities Exchange', meaning: 'The main stock exchange' } })).toEqual(['acronym', 'definition']);
    expect(glossaryKinds({ typeKey: 'acronym', term: 'ASX', fields: { expansion: 'x' } })).toEqual(['acronym']);
  });
});

describe('a field of your own: a "Name: value" line (2026-10-27)', () => {
  it('reads a name of a word or a few, starting with a letter, and its value', () => {
    expect(namedFieldLine('Origin: Latin')).toEqual({ label: 'Origin', value: 'Latin' });
    expect(namedFieldLine('Used in:')).toEqual({ label: 'Used in', value: '' });
    expect(namedFieldLine('Café: Paris')).toEqual({ label: 'Café', value: 'Paris' });
    expect(namedFieldLine('10:30 meeting')).toBeNull();
    expect(namedFieldLine('https://example.com')).toBeNull();
    expect(namedFieldLine('see: //x')).toBeNull();
    expect(namedFieldLine('Origin : Latin')).toBeNull();
    expect(namedFieldLine('This is a whole sentence that goes on and on: yes')).toBeNull();
  });

  it('takes such lines out of a field\'s text, never its first line', () => {
    expect(takeNamedLines('Note: water moves<br>Origin: Latin<br>more text<br>Used in: <b>biology</b>'))
      .toEqual({ html: 'Note: water moves<br>more text', facts: [{ label: 'Origin', value: 'Latin' }, { label: 'Used in', value: 'biology' }] });
    expect(takeNamedLines('<div>Water</div><div>Origin: Latin</div>').facts).toEqual([{ label: 'Origin', value: 'Latin' }]);
    expect(takeNamedLines('Just text<br>no colon')).toEqual({ html: 'Just text<br>no colon', facts: [] });
  });

  it('every Glossary card has a place for them', () => {
    for (const key of Object.keys(GLOSSARY_TYPES)) {
      expect(getStructuredTagType(key)?.fields.some((f) => f.id === NAMED_FIELD_ID && f.type === 'facts')).toBe(true);
    }
  });
});
