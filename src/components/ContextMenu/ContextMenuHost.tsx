import { useEffect, useState } from 'react';
import { usePlatform } from '@/hooks/usePlatform';
import { useUIStore } from '@/store/uiStore';
import { resolveContextMenu, scopesAt } from '@/contextMenu/registry';
import type { ContextMenuSection } from '@/contextMenu/types';
import { ContextMenu } from './ContextMenu';

// THE one right-click listener (mounted once in App.tsx). Works out what was clicked (its scopes,
// see contextMenu/registry.ts) and, if anything there contributes items, shows our menu instead of
// the browser's. Otherwise the browser's own menu shows, as it does for:
//   - Shift+right-click, anywhere (the way back to spellcheck suggestions and the browser's items);
//   - text inputs and textareas;
//   - Android, where a long-press already opens the row's sheet or the system text menu.
export function ContextMenuHost() {
  const { isAndroid } = usePlatform();
  const [menu, setMenu] = useState<{ id: number; x: number; y: number; sections: ContextMenuSection[] } | null>(null);

  useEffect(() => {
    if (isAndroid) return;
    const onContextMenu = (e: MouseEvent) => {
      if (e.shiftKey || !(e.target instanceof Element)) return;
      const target = e.target;
      if (target.closest('[data-context-menu]')) { e.preventDefault(); return; }
      if (target.closest('input, textarea, select')) return;
      const section = useUIStore.getState().activeView;
      let { clientX: x, clientY: y } = e;
      // The keyboard's Menu key reports no pointer position: open under the focused element.
      if (x === 0 && y === 0) { const r = target.getBoundingClientRect(); x = r.left; y = r.bottom; }
      const sections = resolveContextMenu({
        section, target, x, y,
        scopes: scopesAt(target, section),
        selectionText: window.getSelection()?.toString() ?? '',
      });
      if (sections.length === 0) return;
      e.preventDefault();
      setMenu((m) => ({ id: (m?.id ?? 0) + 1, x, y, sections }));
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [isAndroid]);

  if (!menu) return null;
  return <ContextMenu key={menu.id} x={menu.x} y={menu.y} sections={menu.sections} onClose={() => setMenu(null)} />;
}
