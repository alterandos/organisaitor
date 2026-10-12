import { describe, expect, it } from 'vitest';
import { collectInboxes, inboxesInContent, insertIndex, localDay } from './noteInboxes';
import type { Note } from '@/types/notes';

const doc = (inbox: object) => JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [inbox] }] });
const inbox = (id: string, title: string, items: object[] = []) => ({
  type: 'inbox', attrs: { inboxId: id },
  content: [{ type: 'inboxTitle', content: title ? [{ type: 'text', text: title }] : [] }, ...items],
});
const item = (id: string, lines: string[], attrs: object = {}) => ({
  type: 'inboxItem', attrs: { itemId: id, status: 'idea', sentAt: '2026-10-01T09:00:00.000Z', ...attrs },
  content: lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});

describe('noteInboxes', () => {
  it('reads inboxes and their items from stored content', () => {
    const [ib] = inboxesInContent(doc(inbox('I1', 'Ideas', [item('a', ['First line', 'more']), item('b', ['Other'], { status: 'nonsense', taskId: 't1' })])));
    expect(ib.title).toBe('Ideas');
    expect(ib.items.map((i) => [i.itemId, i.text, i.status, i.taskId])).toEqual([['a', 'First line', 'idea', null], ['b', 'Other', 'idea', 't1']]);
    expect(ib.items[0].fullText).toBe('First line more');
    expect(inboxesInContent('')).toEqual([]);
    expect(inboxesInContent('{not json "inbox"')).toEqual([]);
  });

  it('collects across notes and tabs, skipping archived notes', () => {
    const mk = (id: string, content: string, extra: Partial<Note> = {}) => ({ id, title: id, content, tabs: [], archivedAt: null, ...extra }) as unknown as Note;
    const a = mk('n1', doc(inbox('I1', 'A')), { tabs: [{ id: 't1', name: 'Tab', content: doc(inbox('I2', 'B')) }] as Note['tabs'] });
    const gone = mk('n2', doc(inbox('I3', 'C')), { archivedAt: '2026-10-01' });
    expect(collectInboxes([a, gone]).map((i) => [i.noteId, i.tabId, i.inboxId])).toEqual([['n1', null, 'I1'], ['n1', 't1', 'I2']]);
  });

  it('places a new item by the inbox’s order', () => {
    const items = [{ text: 'apple' }, { text: 'Cherry' }];
    expect(insertIndex('newest', items, 'x')).toBe(0);
    expect(insertIndex('oldest', items, 'x')).toBe(2);
    expect(insertIndex('az', items, 'banana')).toBe(1);
    expect(insertIndex('az', items, 'zebra')).toBe(2);
  });

  it('gives the local day of an instant', () => {
    const d = new Date(2026, 9, 5, 23, 30);
    expect(localDay(d.toISOString())).toBe('2026-10-05');
  });
});
