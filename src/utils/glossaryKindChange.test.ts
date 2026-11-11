import { describe, expect, it } from 'vitest';
import { changeKind } from './glossaryKindChange';

// Changing a Glossary record's kind (2026-11-11): what moves where, and that nothing is lost.

describe('changing a Glossary record’s kind', () => {
  const concept = {
    typeKey: 'concept',
    term: 'Carbon pricing',
    fields: {
      summary: 'A price put on emissions',
      examples: ['The EU ETS', 'Canada’s carbon tax'],
      nonExamples: ['A feed-in tariff'],
      image: 'picture:abc',
      related: [{ kind: 'related', entryId: 'x' }],
      importance: 1,
      facts: [{ label: 'Since', value: '1990' }],
    },
  };

  it('a Concept into a Definition: its meaning and examples move, what has no place becomes its own field, the rest is kept', () => {
    const out = changeKind(concept, 'definition')!;
    expect(out.typeKey).toBe('definition');
    expect(out.term).toBe('Carbon pricing');
    expect(out.fields.meaning).toBe('A price put on emissions');
    expect(out.fields.example).toBe('The EU ETS<br>Canada’s carbon tax');
    expect(out.fields.image).toBe('picture:abc');
    expect(out.fields.facts).toEqual([{ label: 'Since', value: '1990' }, { label: 'Not to be confused with', value: 'A feed-in tariff' }]);
    // Links have no place on a Definition: kept on the record for changing back, and its importance stays.
    expect(out.fields.related).toEqual([{ kind: 'related', entryId: 'x' }]);
    expect(out.fields.importance).toBe(1);
  });

  it('back again: what was kept comes back', () => {
    const back = changeKind({ typeKey: 'definition', term: 'Carbon pricing', fields: changeKind(concept, 'definition')!.fields }, 'concept')!;
    expect(back.fields.summary).toBe('A price put on emissions');
    expect(back.fields.examples).toEqual(['The EU ETS', 'Canada’s carbon tax']);
    expect(back.fields.related).toEqual([{ kind: 'related', entryId: 'x' }]);
    expect(back.fields.nonExamples).toEqual(['A feed-in tariff']);
    expect(back.fields.facts).toEqual([{ label: 'Since', value: '1990' }]);
  });

  it('an Acronym’s names change ends: the long form becomes the term, the short one its acronym', () => {
    const out = changeKind({ typeKey: 'acronym', term: 'ETS', fields: { expansion: 'Emissions Trading Scheme', meaning: 'A cap and trade market' } }, 'definition')!;
    expect(out.term).toBe('Emissions Trading Scheme');
    expect(out.fields.acronym).toBe('ETS');
    expect(out.fields.meaning).toBe('A cap and trade market');
    const back = changeKind({ typeKey: 'definition', term: out.term, fields: out.fields }, 'acronym')!;
    expect(back.term).toBe('ETS');
    expect(back.fields.expansion).toBe('Emissions Trading Scheme');
  });

  it('a Concept into an Example: its meaning becomes the example, its links stay links, nothing lost', () => {
    const out = changeKind(concept, 'instance')!;
    expect(out.typeKey).toBe('instance');
    expect(out.fields.example).toBe('A price put on emissions');
    expect(out.fields.related).toEqual([{ kind: 'related', entryId: 'x' }]);
    expect(changeKind({ typeKey: 'instance', term: 'Carbon pricing', fields: out.fields }, 'concept')!.fields.examples).toEqual(['The EU ETS', 'Canada’s carbon tax']);
  });

  it('nothing to change into the same kind, or an unknown one', () => {
    expect(changeKind(concept, 'concept')).toBeNull();
    expect(changeKind(concept, 'hub')).toBeNull();
  });
});
