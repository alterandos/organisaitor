// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { registerContextMenuProvider, resolveContextMenu, scopesAt, setElementScope } from './registry';
import type { ContextMenuContext, ContextMenuScope } from './types';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach((f) => f()); document.body.innerHTML = ''; });
const provide = (...args: Parameters<typeof registerContextMenuProvider>) => cleanups.push(registerContextMenuProvider(...args));

// <div outer><div inner><span target/></div></div>
function tree(outer: ContextMenuScope | null, inner: ContextMenuScope | null) {
  const o = document.createElement('div');
  const i = document.createElement('div');
  const t = document.createElement('span');
  o.appendChild(i); i.appendChild(t); document.body.appendChild(o);
  if (outer) setElementScope(o, () => outer);
  if (inner) setElementScope(i, () => inner);
  return t;
}
const ctxFor = (target: Element): ContextMenuContext => ({ section: 'notes', target, x: 0, y: 0, scopes: scopesAt(target, 'notes'), selectionText: '' });
const ids = (ctx: ContextMenuContext) => resolveContextMenu(ctx).map((s) => s.map((i) => i.id));

describe('context menu resolution', () => {
  it('collects scopes innermost first, then the implicit section and app scopes', () => {
    const t = tree({ kind: 'outer' }, { kind: 'inner' });
    expect(scopesAt(t, 'notes').map((s) => s.kind)).toEqual(['inner', 'outer', 'section', 'app']);
    expect(scopesAt(t, 'notes')[2].data).toBe('notes');
  });

  it('nothing contributes → empty, so the browser keeps its own menu', () => {
    expect(resolveContextMenu(ctxFor(tree({ kind: 'outer' }, null)))).toEqual([]);
  });

  it('the innermost scope that contributes wins; outer scopes add nothing', () => {
    const t = tree(
      { kind: 'outer', items: () => [{ id: 'outer-item', label: 'O' }] },
      { kind: 'inner', items: () => [{ id: 'inner-item', label: 'I' }] },
    );
    expect(ids(ctxFor(t))).toEqual([['inner-item']]);
  });

  it('a scope that contributes nothing is skipped (the next one out answers)', () => {
    const t = tree({ kind: 'outer', items: () => [{ id: 'outer-item', label: 'O' }] }, { kind: 'inner', items: () => [] });
    expect(ids(ctxFor(t))).toEqual([['outer-item']]);
  });

  it('propagate: true lets outer scopes add their sections below', () => {
    const t = tree(
      { kind: 'outer', items: () => [{ id: 'outer-item', label: 'O' }] },
      { kind: 'inner', propagate: true, items: () => [{ id: 'inner-item', label: 'I' }] },
    );
    expect(ids(ctxFor(t))).toEqual([['inner-item'], ['outer-item']]);
  });

  it('providers add a section per provider to scopes of their kind, ordered, after the scope\'s own items', () => {
    provide({ id: 't.b', kind: 'inner', order: 50, items: () => [{ id: 'b', label: 'B' }] });
    provide({ id: 't.a', kind: 'inner', order: 10, items: () => [{ id: 'a', label: 'A' }] });
    provide({ id: 't.other', kind: 'elsewhere', items: () => [{ id: 'x', label: 'X' }] });
    const t = tree(null, { kind: 'inner', items: () => [{ id: 'own', label: 'Own' }] });
    expect(ids(ctxFor(t))).toEqual([['own'], ['a'], ['b']]);
  });

  it('a provider gets the scope (its data) and can opt out with when()', () => {
    provide({
      id: 't.data', kind: 'row',
      when: (_c, scope) => (scope.data as { ok: boolean }).ok,
      items: (_c, scope) => [{ id: `row-${(scope.data as { id: string }).id}`, label: 'R' }],
    });
    expect(ids(ctxFor(tree(null, { kind: 'row', data: { ok: true, id: '7' } })))).toEqual([['row-7']]);
    expect(ids(ctxFor(tree(null, { kind: 'row', data: { ok: false, id: '8' } })))).toEqual([]);
  });

  it('section- and app-wide menus come from providers on the implicit scopes', () => {
    provide({ id: 't.section', kind: 'section', when: (ctx) => ctx.section === 'notes', items: () => [{ id: 'new-notebook', label: 'N' }] });
    expect(ids(ctxFor(tree(null, null)))).toEqual([['new-notebook']]);
  });

  it('re-registering an id replaces the provider (HMR), and unregistering removes it', () => {
    const t = tree(null, { kind: 'inner' });
    provide({ id: 't.same', kind: 'inner', items: () => [{ id: 'v1', label: '1' }] });
    const off = registerContextMenuProvider({ id: 't.same', kind: 'inner', items: () => [{ id: 'v2', label: '2' }] });
    expect(ids(ctxFor(t))).toEqual([['v2']]);
    off();
    expect(ids(ctxFor(t))).toEqual([]);
  });
});
