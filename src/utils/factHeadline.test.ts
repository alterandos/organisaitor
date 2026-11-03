import { describe, expect, it } from 'vitest';
import { factHeadline, quoteHeadline, splitQuote } from './factHeadline';

describe("a Fact's headline (2026-11-03)", () => {
  it('uses the title it came with', () => {
    expect(factHeadline('Ada Lovelace was a mathematician.', { title: 'Ada Lovelace' })).toBe('Ada Lovelace');
  });
  it('else a Glossary term it mentions, as a whole word: the first mentioned, the longer where two start together', () => {
    expect(factHeadline("Mitochondria produce most of a cell's energy.", { terms: ['cell', 'mitochondria', 'chondria'] })).toBe('mitochondria');
    expect(factHeadline('Red blood cells carry oxygen.', { terms: ['red blood cells', 'red'] })).toBe('red blood cells');
    expect(factHeadline('Plants have roots.', { terms: ['plan'] })).toBe('Plants');
  });
  it('else the subject: the words before its first main verb, without a leading article', () => {
    expect(factHeadline('Honey never spoils.')).toBe('Honey');
    expect(factHeadline('The Great Wall of China is not visible from space.')).toBe('Great Wall of China');
    expect(factHeadline('octopuses have three hearts')).toBe('Octopuses');
  });
  it('else its first few words', () => {
    expect(factHeadline('Bananas, botanically, count as berries but strawberries do not.')).toBe('Bananas, botanically, count as berries…');
    expect(factHeadline('Short one')).toBe('Short one');
    expect(factHeadline('   ')).toBe('');
  });
});

describe('a Quote (2026-11-03)', () => {
  it('reads who said it from the selection, either way round, and takes the quotation marks off', () => {
    expect(splitQuote('“Stay hungry, stay foolish.” — Steve Jobs')).toEqual({ text: 'Stay hungry, stay foolish.', who: 'Steve Jobs' });
    expect(splitQuote('Einstein: "Imagination is more important than knowledge."')).toEqual({ text: 'Imagination is more important than knowledge.', who: 'Einstein' });
    expect(splitQuote('“Just the words.”')).toEqual({ text: 'Just the words.', who: '' });
  });
  it('its headline is who said it and its opening words', () => {
    expect(quoteHeadline('Imagination is more important than knowledge.', 'Einstein')).toBe('Einstein: Imagination is more important than knowledge');
    expect(quoteHeadline('The only thing we have to fear is fear itself.', 'FDR')).toBe('FDR: The only thing we have to…');
    expect(quoteHeadline('Less is more.')).toBe('Less is more');
  });
});
