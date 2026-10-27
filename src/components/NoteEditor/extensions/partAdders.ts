import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { createGlyph } from '@/components/Icons';
import styles from './BlockDesigns.module.css';

// "+" buttons beside a block's part, to add another part next to it without the keyboard (the
// hierarchy's nodes first, 2026-10-22). Shown while the part is hovered, or on a touch screen for
// the part holding the cursor. Each button sits on one side of the part's box, so the direction it
// adds in reads from where it is (a child below a tree node, a sibling to its right). A part that
// can be deleted the same way gets a trash button on its top-right corner (`remove`, 2026-10-26),
// so taking a part away is as easy as adding one.
//
// Drawn once per editor, portaled to <body> and placed from the part's box; hidden on scroll.

export type AdderSide = 'below' | 'right' | 'below-left' | 'below-indent' | 'corner';
export interface PartAdder { side: AdderSide; label: string; run: () => void; disabled?: boolean; remove?: boolean }

const HIDE_DELAY = 220;
const touchOnly = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;

export function partAddersPlugin(
  name: string,
  partSelector: string,
  adders: (view: EditorView, part: HTMLElement) => PartAdder[] | null,
  boxSelector?: string,
): Plugin {
  return new Plugin({
    key: new PluginKey(`${name}Adders`),
    view(view) {
      const box = document.createElement('div');
      box.className = styles.adders;
      box.hidden = true;
      document.body.appendChild(box);
      let shownFor: HTMLElement | null = null;
      let hideTimer: ReturnType<typeof setTimeout> | null = null;

      const cancelHide = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };
      const hide = () => { cancelHide(); box.hidden = true; box.replaceChildren(); shownFor = null; };
      const hideSoon = () => { cancelHide(); hideTimer = setTimeout(hide, HIDE_DELAY); };

      const show = (part: HTMLElement) => {
        cancelHide();
        if (shownFor === part && !box.hidden) return;
        const list = adders(view, part);
        if (!list?.length || !view.editable) { hide(); return; }
        const r = (boxSelector ? part.querySelector<HTMLElement>(boxSelector) ?? part : part).getBoundingClientRect();
        box.replaceChildren(...list.map((a) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = a.remove ? `${styles.adder} ${styles.adderRemove}` : styles.adder;
          if (a.remove) b.appendChild(createGlyph('trash')); else b.textContent = '+';
          b.title = a.label;
          b.setAttribute('aria-label', a.label);
          b.disabled = !!a.disabled;
          const S = 20;
          const [left, top] = a.side === 'below' ? [r.left + r.width / 2 - S / 2, r.bottom + 4]
            : a.side === 'right' ? [r.right + 4, r.top + r.height / 2 - S / 2]
            : a.side === 'below-indent' ? [r.left + 24, r.bottom + 2]
            : a.side === 'corner' ? [r.right - S / 2 - 2, r.top - S / 2 + 2]
            : [r.left, r.bottom + 2];
          b.style.left = `${left}px`;
          b.style.top = `${top}px`;
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', (e) => { e.preventDefault(); hide(); a.run(); });
          return b;
        }));
        box.hidden = false;
        shownFor = part;
      };

      const partOf = (t: EventTarget | null) => {
        const el = t instanceof Element ? t.closest<HTMLElement>(partSelector) : null;
        return el && view.dom.contains(el) ? el : null;
      };

      const onMove = (e: MouseEvent) => {
        if (touchOnly()) return;
        const part = partOf(e.target);
        if (part) show(part); else if (!box.hidden) hideSoon();
      };
      const onLeave = () => { if (!touchOnly()) hideSoon(); };
      const onScroll = () => { if (!touchOnly()) hide(); };
      box.addEventListener('mouseenter', cancelHide);
      box.addEventListener('mouseleave', hideSoon);
      view.dom.addEventListener('mousemove', onMove);
      view.dom.addEventListener('mouseleave', onLeave);
      window.addEventListener('scroll', onScroll, true);

      const followCursor = () => {
        if (!touchOnly()) return;
        const { node } = view.domAtPos(view.state.selection.from);
        const part = partOf(node instanceof Element ? node : node.parentElement);
        if (part) { shownFor = null; show(part); } else hide();
      };

      return {
        update: followCursor,
        destroy() {
          cancelHide();
          view.dom.removeEventListener('mousemove', onMove);
          view.dom.removeEventListener('mouseleave', onLeave);
          window.removeEventListener('scroll', onScroll, true);
          box.remove();
        },
      };
    },
  });
}
