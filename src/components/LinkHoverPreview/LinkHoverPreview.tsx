import { useEffect, useState } from 'react';
import styles from './LinkHoverPreview.module.css';

// App-wide: shows the URL of whatever link is currently hovered, bottom-left, like a browser's
// native status-bar link preview — which Tauri's bare webview has no equivalent of, and which
// SPA-rendered pills/spans never trigger even in the browser build. One delegated listener here
// covers every real `<a href>` in the app automatically; see CLAUDE.md's "Link hover preview"
// section for why this is a global mechanism rather than a per-component pattern like hotkeys.
export function LinkHoverPreview() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const linkFor = (el: Element | null): { el: Element; url: string } | null => {
      const withPreview = el?.closest('[data-link-preview]');
      if (withPreview) {
        const url = withPreview.getAttribute('data-link-preview');
        if (url) return { el: withPreview, url };
      }
      const anchor = el?.closest('a[href]') as HTMLAnchorElement | null;
      if (anchor) return { el: anchor, url: anchor.getAttribute('href') || anchor.href };
      return null;
    };

    const onOver = (e: MouseEvent) => {
      const found = linkFor(e.target as Element);
      if (found) setHref(found.url);
    };

    const onOut = (e: MouseEvent) => {
      const found = linkFor(e.target as Element);
      if (found && !found.el.contains(e.relatedTarget as Node | null)) setHref(null);
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
  }, []);

  if (!href) return null;

  return (
    <div className={styles.box} aria-hidden="true">
      {href}
    </div>
  );
}
