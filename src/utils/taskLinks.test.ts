import { describe, expect, it } from 'vitest';
import { createTask } from '@/services/taskService';
import type { ItemLinkKind, Task } from '@/types';
import {
  canAddLink, hierarchyIds, isBlocked, makeItemLink, openBlockers, openBlockersDeep, taskRelations, unlockedBy,
} from './taskLinks';

function tasksOf(...list: Task[]): Record<string, Task> {
  return Object.fromEntries(list.map((t) => [t.id, t]));
}
function task(title: string, extra: Partial<Task> = {}): Task {
  return { ...createTask({ title }, 0), ...extra };
}
const link = (kind: ItemLinkKind, target: Task, reason: string | null = null) => makeItemLink(kind, target.id, reason, '2026-10-01T00:00:00.000Z');

describe('blocking', () => {
  it('a task waiting on an open task is blocked; resolving the blocker (complete or archive) unblocks it', () => {
    const referral = task('Get referral');
    const specialist = task('Book specialist', { itemLinks: [link('dependsOn', referral)] });
    expect(isBlocked(specialist, tasksOf(referral, specialist))).toBe(true);
    expect(isBlocked(specialist, tasksOf({ ...referral, completed: true }, specialist))).toBe(false);
    expect(isBlocked(specialist, tasksOf({ ...referral, archived: true }, specialist))).toBe(false);
  });

  it('a follow-up waits for the task it came from; a related link never blocks', () => {
    const seminar = task('Attend seminar');
    const followUp = task('Email lecturer', { itemLinks: [link('followUpOf', seminar)] });
    const related = task('Read paper', { itemLinks: [link('related', seminar)] });
    const all = tasksOf(seminar, followUp, related);
    expect(isBlocked(followUp, all)).toBe(true);
    expect(isBlocked(related, all)).toBe(false);
  });

  it('a link to a task that no longer exists is ignored (not blocking, not listed)', () => {
    const ghost = task('Deleted');
    const t = task('Survivor', { itemLinks: [link('dependsOn', ghost)] });
    expect(isBlocked(t, tasksOf(t))).toBe(false);
    expect(taskRelations(t, tasksOf(t))).toEqual([]);
  });

  it('openBlockersDeep walks every open task upstream, skipping resolved ones', () => {
    const a = task('A');
    const b = task('B', { itemLinks: [link('dependsOn', a)] });
    const done = task('Done', { completed: true });
    const c = task('C', { itemLinks: [link('dependsOn', b), link('dependsOn', done)] });
    expect(openBlockersDeep(c, tasksOf(a, b, done, c)).map((t) => t.title)).toEqual(['B', 'A']);
    expect(openBlockers(c, tasksOf(a, b, done, c)).map((t) => t.title)).toEqual(['B']);
  });

  it('unlockedBy lists only tasks with nothing else left to wait on', () => {
    const a = task('A', { completed: true });
    const b = task('B');
    const onlyA = task('Only A', { itemLinks: [link('dependsOn', a)] });
    const aAndB = task('A and B', { itemLinks: [link('dependsOn', a), link('dependsOn', b)] });
    expect(unlockedBy(a.id, tasksOf(a, b, onlyA, aAndB)).map((t) => t.title)).toEqual(['Only A']);
  });
});

describe('canAddLink', () => {
  it('refuses self, missing, duplicate and (for symmetric kinds) the reverse duplicate', () => {
    const a = task('A');
    const b = task('B', { itemLinks: [link('related', a)] });
    const all = tasksOf(a, b);
    expect(canAddLink(a.id, 'dependsOn', a.id, all)).toBe('self');
    expect(canAddLink(a.id, 'dependsOn', 'nope', all)).toBe('missing');
    expect(canAddLink(b.id, 'related', a.id, all)).toBe('duplicate');
    expect(canAddLink(a.id, 'related', b.id, all)).toBe('duplicate');
    expect(canAddLink(a.id, 'dependsOn', b.id, all)).toBe('ok');
  });

  it('refuses a blocking link that would make a loop, directly or through a chain, and through follow-ups too', () => {
    const a = task('A');
    const b = task('B', { itemLinks: [link('dependsOn', a)] });
    const c = task('C', { itemLinks: [link('followUpOf', b)] });
    const all = tasksOf(a, b, c);
    expect(canAddLink(a.id, 'dependsOn', b.id, all)).toBe('cycle');
    expect(canAddLink(a.id, 'dependsOn', c.id, all)).toBe('cycle');
    expect(canAddLink(a.id, 'related', c.id, all)).toBe('ok');
  });
});

describe('parent/sub-task hierarchy', () => {
  it('a task’s ancestors and whole sub-task tree are refused (and listed by hierarchyIds); siblings are fine', () => {
    const grand = task('Grand');
    const parent = task('Parent', { parentId: grand.id });
    const me = task('Me', { parentId: parent.id });
    const child = task('Child', { parentId: me.id });
    const grandchild = task('Grandchild', { parentId: child.id });
    const sibling = task('Sibling', { parentId: parent.id });
    grand.subtaskIds = [parent.id]; parent.subtaskIds = [me.id, sibling.id]; me.subtaskIds = [child.id]; child.subtaskIds = [grandchild.id];
    const all = tasksOf(grand, parent, me, child, grandchild, sibling);
    expect([...hierarchyIds(me, all)].sort()).toEqual([grand.id, parent.id, child.id, grandchild.id].sort());
    expect(canAddLink(me.id, 'related', parent.id, all)).toBe('hierarchy');
    expect(canAddLink(me.id, 'dependsOn', grandchild.id, all)).toBe('hierarchy');
    expect(canAddLink(me.id, 'dependsOn', sibling.id, all)).toBe('ok');
  });
});

describe('taskRelations', () => {
  it('lists both directions, in registry order, with reasons and who owns each link', () => {
    const a = task('A');
    const b = task('B', { itemLinks: [link('dependsOn', a, 'needs A first')] });
    const c = task('C', { itemLinks: [link('related', b, 'same topic')] });
    const rel = taskRelations(b, tasksOf(a, b, c));
    expect(rel.map((r) => [r.kind, r.direction, r.other.title, r.reason, r.ownerId === b.id])).toEqual([
      ['dependsOn', 'out', 'A', 'needs A first', true],
      ['related', 'in', 'C', 'same topic', false],
    ]);
  });
});
