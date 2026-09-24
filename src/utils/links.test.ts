import { describe, expect, it } from 'vitest';
import { extractUrls, mergeNewLinks, normalizeLinkUrl } from '@/utils/links';

describe('normalizeLinkUrl', () => {
  it('prefixes a bare domain with https://', () => {
    expect(normalizeLinkUrl('example.com')).toBe('https://example.com');
  });

  it('leaves an already-schemed URL alone', () => {
    expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeLinkUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
  });

  it('trims whitespace and returns empty for blank input', () => {
    expect(normalizeLinkUrl('  example.com  ')).toBe('https://example.com');
    expect(normalizeLinkUrl('   ')).toBe('');
  });
});

describe('extractUrls', () => {
  it('finds http(s) and bare www. URLs', () => {
    expect(extractUrls('see https://a.example and www.b.example')).toEqual(['https://a.example', 'https://www.b.example']);
  });

  it('trims trailing sentence punctuation', () => {
    expect(extractUrls('Visit https://a.example.')).toEqual(['https://a.example']);
    expect(extractUrls('(see https://a.example)')).toEqual(['https://a.example']);
  });

  it('de-duplicates', () => {
    expect(extractUrls('https://a.example and https://a.example again')).toEqual(['https://a.example']);
  });

  it('returns [] for null/undefined/empty', () => {
    expect(extractUrls(null)).toEqual([]);
    expect(extractUrls(undefined)).toEqual([]);
    expect(extractUrls('')).toEqual([]);
  });
});

describe('mergeNewLinks', () => {
  it('adds a link newly typed into notes', () => {
    expect(mergeNewLinks([], 'see https://a.example', '')).toEqual(['https://a.example']);
  });

  it('does not resurrect a link the user deliberately removed from the links list', () => {
    // The link was in previousNotes (so it's not "new"), and it's no longer in `existing`
    // (the user removed it) — must not be re-added just because notes still mentions it.
    const out = mergeNewLinks([], 'see https://a.example', 'see https://a.example');
    expect(out).toEqual([]);
  });

  it('does not add a link already present in existing', () => {
    const existing = ['https://a.example'];
    const out = mergeNewLinks(existing, 'see https://a.example', '');
    expect(out).toBe(existing); // same reference — no-op
  });

  it('comparison ignores protocol, www., case and trailing slash', () => {
    const existing = ['https://Example.com/'];
    const out = mergeNewLinks(existing, 'see http://example.com', '');
    expect(out).toBe(existing);

    const existing2 = ['https://example.com'];
    const out2 = mergeNewLinks(existing2, 'see https://www.example.com/', '');
    expect(out2).toBe(existing2);
  });

  it('adds only the genuinely new link when notes has both an old and a new one', () => {
    const out = mergeNewLinks(['https://old.example'], 'https://old.example and https://new.example', 'https://old.example');
    expect(out).toEqual(['https://old.example', 'https://new.example']);
  });
});
