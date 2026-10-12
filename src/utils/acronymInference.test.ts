import { describe, expect, it } from 'vitest';
import { acronymLetterPositions, acronymPairAtEnd, deduceAcronym, inferAcronymFromSelection, longFormAfter, longFormBefore, looksLikeAcronym } from '@/utils/acronymInference';

describe('inferAcronymFromSelection — the acronym selected', () => {
  it('"Long form (TERM)" keeps only the words the letters come from, not the whole sentence', () => {
    const out = inferAcronymFromSelection('ASX', 'Trading occurs on the Australian Stock Exchange (ASX) daily.');
    expect(out).toEqual({ term: 'ASX', expansion: 'Australian Stock Exchange' });
  });

  it('a letter can come from inside a word (the X of eXchange); the first must start a word', () => {
    expect(inferAcronymFromSelection('ASX', 'ASX - Australian Stock Exchange').expansion).toBe('Australian Stock Exchange');
    expect(inferAcronymFromSelection('XML', 'We store it as eXtensible Markup Language (XML).').expansion).toBe('eXtensible Markup Language');
  });

  it('works in lower case, with brackets selected too (the user\'s ABC example)', () => {
    const context = 'I watched the australian broadcasting corporation (ABC) last night.';
    expect(inferAcronymFromSelection('ABC', context)).toEqual({ term: 'ABC', expansion: 'australian broadcasting corporation' });
    expect(inferAcronymFromSelection('(ABC)', context)).toEqual({ term: 'ABC', expansion: 'australian broadcasting corporation' });
  });

  it('"TERM (long form)"', () => {
    const out = inferAcronymFromSelection('ASX', 'The ASX (Australian Stock Exchange) opens at 10am.');
    expect(out).toEqual({ term: 'ASX', expansion: 'Australian Stock Exchange' });
  });

  it('"TERM: long form", "TERM - long form", "TERM stands for …" stop where the long form ends', () => {
    expect(inferAcronymFromSelection('API', 'API: Application Programming Interface is used here.').expansion).toBe('Application Programming Interface');
    expect(inferAcronymFromSelection('API', 'API - Application Programming Interface, used here.').expansion).toBe('Application Programming Interface');
    expect(inferAcronymFromSelection('API', 'API stands for Application Programming Interface.').expansion).toBe('Application Programming Interface');
  });

  it('"Long form - TERM"', () => {
    expect(inferAcronymFromSelection('API', 'Application Programming Interface - API is used here.').expansion).toBe('Application Programming Interface');
  });

  it('small words, digits, and mixed-case acronyms', () => {
    expect(inferAcronymFromSelection('DoD', 'The Department of Defence (DoD) said so.').expansion).toBe('Department of Defence');
    expect(inferAcronymFromSelection('COVID-19', 'coronavirus disease 2019 (COVID-19) spread.').expansion).toBe('coronavirus disease 2019');
  });

  it('prefers the pair in brackets over a loose colon elsewhere that doesn\'t spell the acronym', () => {
    const out = inferAcronymFromSelection('ASX', 'Notes: ASX: some other definition. The Australian Stock Exchange (ASX) is the real one.');
    expect(out.expansion).toBe('Australian Stock Exchange');
  });

  it('never guesses: nothing whose letters spell the acronym means no expansion', () => {
    expect(inferAcronymFromSelection('ASX', 'No expansion here at all.')).toEqual({ term: 'ASX', expansion: null });
    expect(inferAcronymFromSelection('ASX', 'The ASX (it opens at ten) is busy.').expansion).toBeNull();
  });

  it('an empty selection gives nothing', () => {
    expect(inferAcronymFromSelection('', 'some context')).toEqual({ term: '', expansion: null });
  });
});

describe('inferAcronymFromSelection — a whole phrase selected', () => {
  it('the phrase and its acronym, either order, brackets or not', () => {
    expect(inferAcronymFromSelection('australian broadcasting corporation (ABC)', 'x'))
      .toEqual({ term: 'ABC', expansion: 'australian broadcasting corporation' });
    expect(inferAcronymFromSelection('ASX Australian Stock Exchange', 'x')).toEqual({ term: 'ASX', expansion: 'Australian Stock Exchange' });
    expect(inferAcronymFromSelection('Australian Stock Exchange ASX', 'x')).toEqual({ term: 'ASX', expansion: 'Australian Stock Exchange' });
    expect(inferAcronymFromSelection('ASX - Australian Stock Exchange', 'x')).toEqual({ term: 'ASX', expansion: 'Australian Stock Exchange' });
  });

  it('only the long form selected: its acronym is found in brackets after it', () => {
    const out = inferAcronymFromSelection('australian broadcasting corporation', 'I watched the australian broadcasting corporation (ABC) today.');
    expect(out).toEqual({ term: 'ABC', expansion: 'australian broadcasting corporation' });
  });

  it('an acronym with unrelated words: the acronym, and no made-up expansion', () => {
    expect(inferAcronymFromSelection('ASX totally unrelated words here', 'no clue')).toEqual({ term: 'ASX', expansion: null });
  });

  it('no acronym anywhere: the acronym is made from the first letters of the words', () => {
    expect(inferAcronymFromSelection('apple banana carrot', 'I bought apple banana carrot today.')).toEqual({ term: 'ABC', expansion: 'apple banana carrot' });
    expect(inferAcronymFromSelection('Department of Defence', 'x')).toEqual({ term: 'DD', expansion: 'Department of Defence' });
  });

  it('a found acronym beats a made-up one', () => {
    expect(inferAcronymFromSelection('Department of Defence', 'The Department of Defence (DoD) said.').term).toBe('DoD');
  });
});

describe('the matching rules', () => {
  it('prefers letters that begin words: API is not "Application" alone', () => {
    expect(longFormAfter('API', 'Application Programming Interface')).toBe('Application Programming Interface');
    expect(longFormAfter('API', 'Application')).toBeNull();
  });

  it('caps the long form at min(letters + 5, letters × 2) words', () => {
    expect(longFormBefore('AB', 'alpha one two three bravo')).toBeNull();
    expect(longFormBefore('AB', 'alpha two bravo')).toBe('alpha two bravo');
  });

  it('making an acronym: first letters, small words left out unless too few remain', () => {
    expect(deduceAcronym('apple banana carrot')).toBe('ABC');
    expect(deduceAcronym('out of the box')).toBe('OB');
    expect(deduceAcronym('of the')).toBe('OT');
    expect(deduceAcronym('single')).toBeNull();
  });

  it('which letters spell the acronym, for the card to highlight', () => {
    expect(acronymLetterPositions('ASX', 'Australian Stock Exchange')).toEqual([0, 11, 18]);
    expect(acronymLetterPositions('ABC', 'apple banana carrot')).toEqual([0, 6, 13]);
    expect(acronymLetterPositions('ASX', 'nothing like it')).toBeNull();
  });

  it('a pair just closed with a bracket, for the as-you-type offer', () => {
    expect(acronymPairAtEnd('We watched the Australian Broadcasting Corporation (ABC)')).toEqual({ term: 'ABC', expansion: 'Australian Broadcasting Corporation', termFrom: 52 });
    expect(acronymPairAtEnd('Some words (ABC)')).toBeNull();
    expect(acronymPairAtEnd('apple banana carrot (abc)')).toBeNull();
  });

  it('what looks like an acronym', () => {
    for (const w of ['ASX', 'DoD', 'COVID-19', '(ABC)', 'U.S.']) expect(looksLikeAcronym(w)).toBe(true);
    for (const w of ['McDonald', 'Hello', 'A', 'the']) expect(looksLikeAcronym(w)).toBe(false);
  });
});
