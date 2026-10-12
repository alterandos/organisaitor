import { describe, expect, it } from 'vitest';
import { collectHubs, hubsInContent, linkInsertIndex } from './noteHubs';
import type { Note } from '@/types/notes';

const doc = (hub: object) => JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [hub] }] });
const hub = (id: string, title: string, links: object[] = []) => ({
  type: 'hub', attrs: { hubId: id },
  content: [{ type: 'hubTitle', content: [{ type: 'text', text: title }] }, { type: 'hubTake', content: [{ type: 'text', text: 'my take' }] }, ...links],
});
const link = (id: string, relation: string, attrs: object = {}) => ({ type: 'hubLink', attrs: { linkId: id, relation, kind: 'passage', label: id, ...attrs } });

describe('noteHubs', () => {
  it('reads hubs and their links from stored content; an unknown relation reads as Related', () => {
    const [h] = hubsInContent(doc(hub('H1', 'Inflation', [link('a', 'causes', { noteId: 'n1' }), link('b', 'nonsense', { kind: 'glossary', entryId: 'e1' })])));
    expect(h).toMatchObject({ hubId: 'H1', title: 'Inflation', take: 'my take' });
    expect(h.links.map((l) => [l.linkId, l.relation, l.kind, l.noteId, l.entryId])).toEqual([['a', 'causes', 'passage', 'n1', null], ['b', 'related', 'glossary', null, 'e1']]);
    expect(hubsInContent('')).toEqual([]);
  });

  it('collects across notes and tabs, skipping archived notes', () => {
    const mk = (id: string, content: string, extra: Partial<Note> = {}) => ({ id, title: id, content, tabs: [], archivedAt: null, ...extra }) as unknown as Note;
    const a = mk('n1', doc(hub('H1', 'A')), { tabs: [{ id: 't1', name: 'T', content: doc(hub('H2', 'B')) }] as Note['tabs'] });
    const gone = mk('n2', doc(hub('H3', 'C')), { archivedAt: '2026-10-01' });
    expect(collectHubs([a, gone]).map((h) => [h.noteId, h.tabId, h.hubId])).toEqual([['n1', null, 'H1'], ['n1', 't1', 'H2']]);
  });

  it('puts a new link at the end of its relation’s group, groups in their set order', () => {
    const links = [{ relation: 'causes' as const }, { relation: 'supports' as const }, { relation: 'related' as const }];
    expect(linkInsertIndex(links, 'causes')).toBe(1);
    expect(linkInsertIndex(links, 'contradicts')).toBe(2);
    expect(linkInsertIndex(links, 'related')).toBe(3);
    expect(linkInsertIndex([], 'partOf')).toBe(0);
  });
});
