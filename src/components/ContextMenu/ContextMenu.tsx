import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import type { ContextMenuItem, ContextMenuSection } from '@/contextMenu/types';
import styles from './ContextMenu.module.css';

// The right-click menu itself: renders whatever sections it is given (see contextMenu/types.ts),
// knowing nothing about where they came from. Submenus stack as further panels.
//
// It never takes keyboard focus: pressing on it is preventDefault-ed, so the note editor keeps
// its focus and selection (Cut/Copy act on that selection). The keys it answers (arrows, Enter,
// Home/End) are caught on the document in the capture phase while it is open; Escape goes through
// useEscapeClose, one registration per panel, so it closes the innermost submenu first.

interface Level {
  sections: ContextMenuSection[];
  // Root: the click point. Submenu: the parent item's box (opens beside it).
  x: number;
  y: number;
  anchor: DOMRect | null;
  active: number;         // index into the level's flat item list, -1 = none
}

const flat = (sections: ContextMenuSection[]) => sections.flat();
const SUBMENU_DELAY_MS = 150;

export function ContextMenu({ x, y, sections, onClose }: { x: number; y: number; sections: ContextMenuSection[]; onClose: () => void }) {
  const [stack, setStack] = useState<Level[]>([{ sections, x, y, anchor: null, active: -1 }]);
  const stackRef = useRef(stack);
  useEffect(() => { stackRef.current = stack; });
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const choose = (item: ContextMenuItem) => {
    if (item.disabled || item.submenu) return;
    onCloseRef.current();
    void item.run?.();
  };

  const openSubmenu = (level: number, index: number, el: HTMLElement | null) => {
    const item = flat(stackRef.current[level].sections)[index];
    if (!item?.submenu || item.disabled || !el) return;
    const rect = el.getBoundingClientRect();
    setStack((s) => [...s.slice(0, level + 1), { sections: item.submenu!, x: rect.right, y: rect.top, anchor: rect, active: 0 }]);
  };

  // Keyboard, while open. Capture phase + stopPropagation: the editor underneath mustn't also
  // move its cursor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stackRef.current;
      const depth = s.length - 1;
      const top = s[depth];
      const items = flat(top.sections);
      const step = (dir: 1 | -1) => {
        if (items.every((i) => i.disabled)) return top.active;
        let i = top.active;
        do { i = (i + dir + items.length) % items.length; } while (items[i].disabled);
        return i;
      };
      const setActive = (i: number) => setStack((st) => st.map((l, d) => (d === depth ? { ...l, active: i } : l)));
      const consume = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === 'ArrowDown') { consume(); setActive(step(1)); }
      else if (e.key === 'ArrowUp') { consume(); setActive(step(-1)); }
      else if (e.key === 'Home') { consume(); setActive(items.findIndex((i) => !i.disabled)); }
      else if (e.key === 'End') { consume(); setActive(items.length - 1 - [...items].reverse().findIndex((i) => !i.disabled)); }
      else if (e.key === 'ArrowLeft') { consume(); if (depth > 0) setStack((st) => st.slice(0, -1)); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        const item = items[top.active];
        if (!item) { if (e.key !== 'ArrowRight') consume(); return; }
        consume();
        if (item.submenu) openSubmenu(depth, top.active, document.querySelector<HTMLElement>(`[data-context-menu-level="${depth}"] [data-index="${top.active}"]`));
        else if (e.key !== 'ArrowRight') choose(item);
      }
    };
    // Anything else ends the menu: a press outside it, a scroll, the window losing focus or resizing.
    const outside = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-context-menu]')) return;
      onCloseRef.current();
    };
    const close = () => onCloseRef.current();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('scroll', outside, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('scroll', outside, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      if (subTimer.current) clearTimeout(subTimer.current);
    };
  }, []); // reads everything through refs: installed once per open menu

  return createPortal(
    <>
      {stack.map((level, depth) => (
        <MenuPanel
          key={depth}
          level={level}
          depth={depth}
          onEscape={() => (depth === 0 ? onCloseRef.current() : setStack((s) => s.slice(0, depth)))}
          onHover={(index, el) => {
            if (subTimer.current) clearTimeout(subTimer.current);
            setStack((s) => s.slice(0, depth + 1).map((l, d) => (d === depth ? { ...l, active: index } : l)));
            const item = flat(level.sections)[index];
            if (item?.submenu && !item.disabled) subTimer.current = setTimeout(() => openSubmenu(depth, index, el), SUBMENU_DELAY_MS);
          }}
          onChoose={(index, el) => {
            const item = flat(level.sections)[index];
            if (item?.submenu) openSubmenu(depth, index, el);
            else if (item) choose(item);
          }}
        />
      ))}
    </>,
    document.body,
  );
}

function MenuPanel({ level, depth, onEscape, onHover, onChoose }: {
  level: Level;
  depth: number;
  onEscape: () => void;
  onHover: (index: number, el: HTMLElement) => void;
  onChoose: (index: number, el: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscapeClose(onEscape);

  // Fit the panel on screen once its size is known: flip left of the click (or of the parent
  // item, for a submenu) when it would run off the right, up when it would run off the bottom.
  // Written straight to the element's style — a DOM measurement, not React state.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 4;
    let left = level.anchor ? level.anchor.right - 2 : level.x;
    let top = level.anchor ? level.anchor.top - 4 : level.y;
    if (left + width > window.innerWidth - margin) left = level.anchor ? level.anchor.left - width + 2 : level.x - width;
    if (top + height > window.innerHeight - margin) top = level.anchor ? window.innerHeight - margin - height : level.y - height;
    el.style.left = `${Math.max(margin, left)}px`;
    el.style.top = `${Math.max(margin, top)}px`;
    el.style.visibility = 'visible';
  }, [level.anchor, level.x, level.y]);

  // Each section's first item's index in the level's flat list (keyboard state counts flat).
  const offsets = level.sections.map((_, si) => level.sections.slice(0, si).reduce((n, sec) => n + sec.length, 0));
  return (
    <div
      ref={ref}
      className={styles.menu}
      role="menu"
      data-context-menu=""
      data-context-menu-level={depth}
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {level.sections.map((section, si) => (
        <div key={si} className={styles.section} role="group">
          {section.map((item, ii) => {
            const i = offsets[si] + ii;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                data-index={i}
                aria-disabled={item.disabled || undefined}
                aria-haspopup={item.submenu ? 'menu' : undefined}
                className={[
                  styles.item,
                  i === level.active ? styles.itemActive : '',
                  item.disabled ? styles.itemDisabled : '',
                  item.destructive ? styles.itemDestructive : '',
                ].filter(Boolean).join(' ')}
                tabIndex={-1}
                onMouseEnter={(e) => onHover(i, e.currentTarget)}
                onClick={(e) => onChoose(i, e.currentTarget)}
              >
                <span className={styles.icon} aria-hidden="true">{item.icon}</span>
                <span className={styles.label}>{item.label}</span>
                {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
                {item.submenu && <span className={styles.chevron} aria-hidden="true">▸</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
