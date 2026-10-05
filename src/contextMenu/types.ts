import type { ReactNode } from 'react';
import type { AppView } from '@/store/uiStore';

// The suite's right-click menus (CLAUDE.md "Right-click menus"). What a menu holds is decided
// entirely by WHERE the click lands: the section, then every scope between the clicked element
// and the page (innermost first). Everything here is plain data, so a new feature, constraint or
// kind of item is a new field or a new provider, never a change to the menu component.

export interface ContextMenuItem {
  // Stable within its section: React key, and how tests and future customisation find an item.
  id:           string;
  label:        string;
  icon?:        ReactNode;
  // Shown right-aligned, e.g. 'Ctrl+X'. Display only: the hotkey itself lives in hotkeys.ts.
  shortcut?:    string;
  disabled?:    boolean;
  destructive?: boolean;
  // Runs after the menu has closed. Ignored when `submenu` is set.
  run?:         () => void | Promise<void>;
  submenu?:     ContextMenuSection[];
}

// Items shown together; the menu draws a divider between sections.
export type ContextMenuSection = ContextMenuItem[];

// Something an element declares about itself with useContextMenuScope: "I'm a row", "I'm the
// note editor". `kind` is what providers attach to; `data` is whatever they need (an id, an API
// object); `items` are the element's own entries. Called at right-click time, so it's always
// current.
export interface ContextMenuScope {
  kind:       string;
  data?:      unknown;
  items?:     (ctx: ContextMenuContext) => ContextMenuItem[];
  // false (default): once this scope contributes anything, outer scopes add nothing (right-click
  // a row → that row's menu, not the section's too). true: outer scopes' sections follow below.
  propagate?: boolean;
}

export interface ContextMenuContext {
  section: AppView;
  // The element right-clicked, and where (viewport coordinates).
  target:  Element;
  x:       number;
  y:       number;
  // Innermost first, ending with the two implicit scopes every click has: { kind: 'section' }
  // (data: the AppView) and { kind: 'app' }.
  scopes:  ContextMenuScope[];
  // The text selected when the menu opened ('' if none).
  selectionText: string;
}

// Adds a section to every scope of one kind, from anywhere: a feature extends an existing place
// without touching it. One provider = one section of the menu.
export interface ContextMenuProvider {
  id:     string;
  kind:   string;
  // Lower first. A scope's own `items` are order 0; providers default to 100.
  order?: number;
  when?:  (ctx: ContextMenuContext, scope: ContextMenuScope) => boolean;
  items:  (ctx: ContextMenuContext, scope: ContextMenuScope) => ContextMenuItem[];
}
