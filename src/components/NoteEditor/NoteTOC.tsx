import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import styles from './NoteTOC.module.css';

interface TocItem {
  level: number;
  text: string;
  pos: number;
  number: string;
}

function extractItems(editor: Editor): TocItem[] {
  const items: TocItem[] = [];
  const counters = [0, 0, 0, 0, 0];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = (node.attrs.level as number) ?? 1;
      const idx = level - 1;
      counters[idx]++;
      for (let i = idx + 1; i < counters.length; i++) counters[i] = 0;
      items.push({
        level,
        text: node.textContent || '(Untitled)',
        pos,
        number: counters.slice(0, level).join('.'),
      });
    }
  });

  return items;
}

interface Props {
  editor: Editor;
  onClose: () => void;
}

export function NoteTOC({ editor, onClose }: Props) {
  const [items, setItems]         = useState<TocItem[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const update = () => setItems(extractItems(editor));
    editor.on('update', update);
    update();
    return () => { editor.off('update', update); };
  }, [editor]);

  const toggleCollapse = (number: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const isHidden = (item: TocItem): boolean => {
    // Hide if any ancestor number is in the collapsed set
    const parts = item.number.split('.');
    for (let i = 1; i < parts.length; i++) {
      if (collapsed.has(parts.slice(0, i).join('.'))) return true;
    }
    return false;
  };

  const hasChildren = (item: TocItem): boolean =>
    items.some((other) => other.number.startsWith(item.number + '.'));

  const scrollTo = (item: TocItem) => {
    // Set cursor inside the heading then scroll into view
    editor.chain().focus().setTextSelection(item.pos + 1).run();
    try {
      const { node } = editor.view.domAtPos(item.pos + 1);
      const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
      const heading = el?.closest('h1, h2, h3, h4, h5');
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { /* ignore */ }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Contents</span>
        <button className={styles.closeBtn} onClick={onClose} title="Close navigation">◀</button>
      </div>

      <div className={styles.list}>
        {items.length === 0 ? (
          <div className={styles.empty}>Add headings to see the outline</div>
        ) : (
          items.map((item) => {
            if (isHidden(item)) return null;
            const children = hasChildren(item);
            const isCollapsed = collapsed.has(item.number);

            return (
              <div
                key={`${item.number}-${item.pos}`}
                className={`${styles.item} ${styles[`level${item.level}`]}`}
              >
                <button
                  className={styles.toggleBtn}
                  onClick={() => toggleCollapse(item.number)}
                  style={{ visibility: children ? 'visible' : 'hidden' }}
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>

                <button className={styles.label} onClick={() => scrollTo(item)}>
                  <span className={styles.number}>{item.number}</span>
                  <span className={styles.text}>{item.text}</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
