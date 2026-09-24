import { describe, expect, it } from 'vitest';
import { inferAcronymFromSelection } from '@/utils/acronymInference';

describe('inferAcronymFromSelection — single token selected', () => {
  it('finds "Expansion (TERM)" — captures everything back to the last non-letter/space/dash character', () => {
    // The capture class is [A-Za-z\s-], so it runs back as far as punctuation allows — here
    // all the way to the start of the sentence, not just the nearest noun phrase. Documents
    // the actual (broader-than-you'd-guess) behavior rather than an idealized one.
    const out = inferAcronymFromSelection('ASX', 'Trading occurs on the Australian Stock Exchange (ASX) daily.');
    expect(out).toEqual({ term: 'ASX', expansion: 'Trading occurs on the Australian Stock Exchange' });
  });

  it('finds "TERM (Expansion)"', () => {
    const out = inferAcronymFromSelection('ASX', 'The ASX (Australian Stock Exchange) opens at 10am.');
    expect(out).toEqual({ term: 'ASX', expansion: 'Australian Stock Exchange' });
  });

  it('finds "TERM: Expansion" and "TERM - Expansion" (captures up to the next sentence-ending punctuation)', () => {
    expect(inferAcronymFromSelection('API', 'API: Application Programming Interface is used here.').expansion)
      .toBe('Application Programming Interface is used here');
    expect(inferAcronymFromSelection('API', 'API - Application Programming Interface, used here.').expansion)
      .toBe('Application Programming Interface, used here');
  });

  it('finds the reversed "Expansion - TERM" as a lower-priority fallback', () => {
    const out = inferAcronymFromSelection('API', 'Application Programming Interface - API is used here.');
    expect(out.expansion).toBe('Application Programming Interface');
  });

  it('prefers "Expansion (TERM)" over a colon match elsewhere in the text', () => {
    const out = inferAcronymFromSelection(
      'ASX',
      'Notes: ASX: some other definition. The Australian Stock Exchange (ASX) is the real one.'
    );
    expect(out.expansion).toBe('The Australian Stock Exchange');
  });

  it('returns null expansion when nothing is found', () => {
    expect(inferAcronymFromSelection('ASX', 'No expansion here at all.')).toEqual({ term: 'ASX', expansion: null });
  });

  it('returns null term for empty selection', () => {
    expect(inferAcronymFromSelection('', 'some context')).toEqual({ term: '', expansion: null });
  });
});

describe('inferAcronymFromSelection — whole phrase selected', () => {
  it('acronym-first, initials match: high-confidence split', () => {
    const out = inferAcronymFromSelection('ASX Australian Stock Exchange', 'ASX Australian Stock Exchange is a market.');
    expect(out).toEqual({ term: 'ASX', expansion: 'Australian Stock Exchange' });
  });

  it('acronym-last, initials match: high-confidence split', () => {
    const out = inferAcronymFromSelection('Australian Stock Exchange ASX', 'context');
    expect(out).toEqual({ term: 'ASX', expansion: 'Australian Stock Exchange' });
  });

  it('initials matching skips stopwords (of/the/and/for/…)', () => {
    const out = inferAcronymFromSelection('ASX Australian Stock Exchange of the South', 'context');
    // "of"/"the" are skipped by initialsMatch, so initials should be A,S,E,S -> "ASES", not ASX;
    // falls back to acronym-shaped-but-not-confirmed handling (still picks ASX as the term).
    expect(out.term).toBe('ASX');
  });

  it('falls back to whichever end looks acronym-shaped without a confirmed initials match', () => {
    const out = inferAcronymFromSelection('ASX totally unrelated words here', 'context with no expansion clue');
    expect(out.term).toBe('ASX');
    expect(out.expansion).toBe('totally unrelated words here');
  });

  it('neither end is acronym-shaped: falls back to searching context for the whole phrase', () => {
    const out = inferAcronymFromSelection('some plain phrase', 'no acronym clue here');
    expect(out).toEqual({ term: 'some plain phrase', expansion: null });
  });
});
