import type { AppView } from '@/store/uiStore';
import type { ContextMenuContext, ContextMenuProvider, ContextMenuScope, ContextMenuSection } from './types';

// ── Providers ────────────────────────────────────────────────────────────────────────────────
// Keyed by id, so re-registering (a module reloaded by HMR) replaces rather than duplicates.
const providers = new Map<string, ContextMenuProvider>();

export function registerContextMenuProvider(provider: ContextMenuProvider): () => void {
  providers.set(provider.id, provider);
  return () => { if (providers.get(provider.id) === provider) providers.delete(provider.id); };
}

// ── Scopes ───────────────────────────────────────────────────────────────────────────────────
// Element → its scope description. A WeakMap, so an element that leaves the DOM is forgotten
// without anyone unregistering it (useContextMenuScope still does, on unmount).
const scopes = new WeakMap<Element, () => ContextMenuScope>();

export function setElementScope(el: Element, describe: () => ContextMenuScope): void {
  scopes.set(el, describe);
}

export function clearElementScope(el: Element, describe: () => ContextMenuScope): void {
  if (scopes.get(el) === describe) scopes.delete(el);
}

// Every declared scope from `target` up to the document, innermost first, then the implicit
// section and app scopes.
export function scopesAt(target: Element, section: AppView): ContextMenuScope[] {
  const found: ContextMenuScope[] = [];
  for (let el: Element | null = target; el; el = el.parentElement) {
    const describe = scopes.get(el);
    if (describe) found.push(describe());
  }
  found.push({ kind: 'section', data: section }, { kind: 'app' });
  return found;
}

// ── Resolution ───────────────────────────────────────────────────────────────────────────────
// What the menu shows for this click. Each scope, innermost first, contributes its own items
// (order 0) and its providers' items as sections; the first scope that contributes anything ends
// the walk unless it says `propagate: true`. Empty result = no custom menu: the browser's own shows.
export function resolveContextMenu(ctx: ContextMenuContext): ContextMenuSection[] {
  const out: ContextMenuSection[] = [];
  for (const scope of ctx.scopes) {
    const sections: { order: number; items: ContextMenuSection }[] = [];
    if (scope.items) sections.push({ order: 0, items: scope.items(ctx) });
    for (const p of providers.values()) {
      if (p.kind !== scope.kind || (p.when && !p.when(ctx, scope))) continue;
      sections.push({ order: p.order ?? 100, items: p.items(ctx, scope) });
    }
    const nonEmpty = sections.filter((s) => s.items.length > 0).sort((a, b) => a.order - b.order);
    out.push(...nonEmpty.map((s) => s.items));
    if (nonEmpty.length > 0 && !scope.propagate) break;
  }
  return out;
}
