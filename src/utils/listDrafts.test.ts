import { describe, expect, it } from 'vitest';
import { draftsFromText, textLines } from './listDrafts';
import type { ListFieldSchema } from '@/types/lists';

const FIELDS: ListFieldSchema[] = [
  { id: 'author', name: 'Author', type: 'text' },
  { id: 'year', name: 'Year', type: 'number' },
  { id: 'url', name: 'Link', type: 'url' },
  { id: 'when', name: 'When', type: 'date' },
];
const now = new Date(2026, 10, 3);

describe('text sent to a list (2026-11-03)', () => {
  it('lines lose their bullets and numbering', () => {
    expect(textLines('- milk\n2. eggs\n\n• bread')).toEqual(['milk', 'eggs', 'bread']);
  });

  it('one item: the first line is its title; "Name: value" fills a field the list has; the rest is notes', () => {
    const [d] = draftsFromText('Dune\nAuthor: Frank Herbert\nYear: 1965\nGenre: SF\nA classic.', FIELDS, false, now);
    expect(d).toEqual({ title: 'Dune', data: { author: 'Frank Herbert', year: 1965 }, notes: 'Genre: SF\nA classic.' });
  });

  it('a web address and a date fill the list\'s link and date fields', () => {
    const [d] = draftsFromText('Conference on 12 March 2027 https://example.com/conf', FIELDS, false, now);
    expect(d.data.url).toBe('https://example.com/conf');
    expect(d.data.when).toBe('2027-03-12');
  });

  it('one per line when asked, else one item', () => {
    expect(draftsFromText('- milk\n- eggs', [], true, now).map((d) => d.title)).toEqual(['milk', 'eggs']);
    expect(draftsFromText('- milk\n- eggs', [], false, now)).toEqual([{ title: 'milk', data: {}, notes: 'eggs' }]);
  });

  it('a long first line is cut at a sentence end, the rest kept in the notes', () => {
    const long = `${'Word '.repeat(20)}ends here. And then a second sentence that goes on for a while longer than that.`;
    const [d] = draftsFromText(long, [], false, now);
    expect(d.title.endsWith('ends here.')).toBe(true);
    expect(d.notes.startsWith('And then')).toBe(true);
  });
});
