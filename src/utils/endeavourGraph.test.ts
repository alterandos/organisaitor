import { describe, expect, it } from 'vitest';
import { canAddEndeavourLink, childrenOf, endeavourAncestors, endeavourSubtree, inEndeavourScope, parentsOf } from './endeavourGraph';
import type { Collection, CollectionId, EndeavourLink } from '@/types';

const link = (kind: EndeavourLink['kind'], targetId: string): EndeavourLink => ({ kind, targetId: targetId as CollectionId, createdAt: '2026-10-28T00:00:00Z' });
const col = (id: string, o: Partial<Collection> = {}): Collection => ({
  id: id as CollectionId, kind: 'project', name: id, description: null, color: null, purposeIds: [], tagIds: [], deadline: null,
  fieldSchema: [], routineTasks: [], repeatConfig: null, collectionId: null, archivedAt: null,
  createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z', ...o,
});

// Degree → Semester → GEOS201, GEOS215, Internship; the Internship is also part of Career. A tracker
// is filed under GEOS215 the old way (collectionId); GEOS201 is "related" to Career (no roll-up).
const graph = () => Object.fromEntries([
  col('degree'),
  col('semester', { links: [link('partOf', 'degree')] }),
  col('geos201', { links: [link('partOf', 'semester'), link('related', 'career')] }),
  col('geos215', { links: [link('partOf', 'semester')] }),
  col('internship', { links: [link('partOf', 'semester'), link('partOf', 'career')] }),
  col('career'),
  col('tracker', { kind: 'tracker', collectionId: 'geos215' as CollectionId }),
].map((c) => [c.id, c]));

describe('the Endeavour graph', () => {
  it('everything part of an Endeavour, at any depth, through links and the old "filed under" field', () => {
    expect([...endeavourSubtree('semester', graph())].sort()).toEqual(['geos201', 'geos215', 'internship', 'semester', 'tracker']);
    expect([...endeavourSubtree('degree', graph())]).toContain('tracker');
    expect([...endeavourSubtree('career', graph())].sort()).toEqual(['career', 'internship']);   // "related" doesn't roll up
  });

  it('several parents; ancestors; children', () => {
    const g = graph();
    expect(parentsOf(g.internship, g).sort()).toEqual(['career', 'semester']);
    expect([...endeavourAncestors('tracker', g)].sort()).toEqual(['degree', 'geos215', 'semester']);
    expect(childrenOf('semester', g).sort()).toEqual(['geos201', 'geos215', 'internship']);
  });

  it('a link to an Endeavour that no longer exists is ignored', () => {
    const g = graph();
    delete g.semester;
    expect(parentsOf(g.geos215, g)).toEqual([]);
    expect([...endeavourSubtree('degree', g)]).toEqual(['degree']);
  });

  it('refuses a link to itself, a repeat, and one that would make an Endeavour part of itself', () => {
    const g = graph();
    expect(canAddEndeavourLink(g, 'geos215', 'partOf', 'geos215')).toBe('self');
    expect(canAddEndeavourLink(g, 'geos215', 'partOf', 'semester')).toBe('duplicate');
    expect(canAddEndeavourLink(g, 'degree', 'partOf', 'geos215')).toBe('loop');
    expect(canAddEndeavourLink(g, 'career', 'related', 'geos201')).toBe('duplicate');   // symmetric: already linked from the other end
    expect(canAddEndeavourLink(g, 'geos215', 'partOf', 'career')).toBeNull();
    expect(canAddEndeavourLink(g, 'degree', 'related', 'geos215')).toBeNull();          // related can't loop
  });

  it('survives a loop that slipped in from elsewhere', () => {
    const g = { a: col('a', { links: [link('partOf', 'b')] }), b: col('b', { links: [link('partOf', 'a')] }) };
    expect([...endeavourSubtree('a', g)].sort()).toEqual(['a', 'b']);
  });

  it('inEndeavourScope: no scope takes everything; a scope takes only what is in it', () => {
    const scope = endeavourSubtree('semester', graph());
    expect(inEndeavourScope(null, null)).toBe(true);
    expect(inEndeavourScope(scope, 'geos215')).toBe(true);
    expect(inEndeavourScope(scope, 'career')).toBe(false);
    expect(inEndeavourScope(scope, null)).toBe(false);
  });
});
