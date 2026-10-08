import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { collectImportantPassages, type ImportantPassage } from './extensions/Importance';
import { importanceLevel } from './extensions/importanceLevels';
import { computeHeadingFolds, foldsHiding, headingPosAt, toggleHeadingFold, type HeadingFoldInfo } from './extensions/HeadingFold';
import { headingTrail, scrollHostOf, watchReadingPosition } from './headingTrail';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import styles from './NoteTOC.module.css';
import { DisclosureIcon } from '@/components/Icons';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';

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
  // Inside the phone's note panel (MobileNoteSidePanel): full width, no close button of its own,
  // and choosing an entry doesn't focus the editor (that would raise the keyboard); onClose then
  // closes the panel after the jump.
  embedded?: boolean;
}

export function NoteTOC({ editor, onClose, embedded }: Props) {
  const paneResize = usePaneWidth('note-contents', { edge: 'left', min: 160, max: 480 });
  const [items, setItems]         = useState<TocItem[]>([]);
  const [points, setPoints]       = useState<ImportantPassage[]>([]);
  // Collapsing here is collapsing in the note (decided with the user 2026-10-09): one state, the
  // headings' own (extensions/HeadingFold.ts), so the outline and the text never disagree.
  const [folds, setFolds]         = useState<HeadingFoldInfo[]>([]);
  // The heading the reader is in (the innermost one of the sticky trail), highlighted here.
  const [activePos, setActivePos] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      setItems(extractItems(editor));
      setPoints(collectImportantPassages(editor.state.doc));
      setFolds(computeHeadingFolds(editor.state.doc));
    };
    editor.on('update', update);
    update();
    return () => { editor.off('update', update); };
  }, [editor]);

  useEffect(() => {
    const host = scrollHostOf(editor.view.dom);
    if (!host) return;
    return watchReadingPosition(host, editor, () => {
      const current = headingTrail(editor.view.dom as HTMLElement, host).at(-1);
      setActivePos(current ? headingPosAt(editor.view, current.el) : null);
    });
  }, [editor]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="location"]')?.scrollIntoView({ block: 'nearest' });
  }, [activePos]);

  const foldAt = (item: TocItem) => folds.find((f) => f.pos === item.pos);
  const isHidden = (item: TocItem) => foldsHiding(folds, item.pos).length > 0;

  const hasChildren = (item: TocItem): boolean =>
    items.some((other) => other.number.startsWith(item.number + '.'));

  const scrollTo = (item: TocItem) => {
    // Set cursor inside the heading then scroll into view
    if (embedded) editor.commands.setTextSelection(item.pos + 1);
    else editor.chain().focus().setTextSelection(item.pos + 1).run();
    try {
      const { node } = editor.view.domAtPos(item.pos + 1);
      const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
      const heading = el?.closest('h1, h2, h3, h4, h5');
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { /* ignore */ }
    if (embedded) onClose();
  };

  // Key points: the note's Important passages, most important first, then in order.
  const keyPoints = [...points].sort((a, b) => b.level - a.level || a.from - b.from);
  const goToPoint = (p: ImportantPassage) => {
    if (embedded) editor.commands.setTextSelection({ from: p.from, to: p.to });
    else editor.chain().focus().setTextSelection({ from: p.from, to: p.to }).run();
    try {
      const { node } = editor.view.domAtPos(p.from);
      (node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch { /* not laid out */ }
    if (embedded) onClose();
  };

  return (
    <div style={paneResize.style} className={`${styles.panel} ${embedded ? styles.embedded : ''}`}>
      {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
      <div className={styles.header}>
        <span className={styles.title}>Contents</span>
        {!embedded && <button className={styles.closeBtn} onClick={onClose} title="Close navigation">◀</button>}
      </div>

      <div ref={listRef} className={`${styles.list} ${styles.headingsList}`}>
        {items.length === 0 ? (
          <div className={styles.empty}>Add headings to see the outline</div>
        ) : (
          items.map((item) => {
            if (isHidden(item)) return null;
            const isCollapsed = !!foldAt(item)?.collapsed;
            const children = hasChildren(item) || isCollapsed;

            return (
              <div
                key={`${item.number}-${item.pos}`}
                className={`${styles.item} ${styles[`level${item.level}`]} ${item.pos === activePos ? styles.itemActive : ''}`}
              >
                <button
                  className={styles.toggleBtn}
                  onClick={() => toggleHeadingFold(editor.view, item.pos)}
                  style={{ visibility: children ? 'visible' : 'hidden' }}
                  aria-label={isCollapsed ? LABELS.noteHeadings.expand : LABELS.noteHeadings.collapse}
                  aria-expanded={!isCollapsed}
                >
                  <DisclosureIcon open={!isCollapsed} />
                </button>

                <button className={styles.label} onClick={() => scrollTo(item)} aria-current={item.pos === activePos ? 'location' : undefined}>
                  <span className={styles.number}>{item.number}</span>
                  <span className={styles.text}>{item.text}</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.header}>
        <span className={styles.title}>{LABELS.importance.keyPoints}</span>
      </div>
      <div className={`${styles.list} ${styles.pointsList}`}>
        {keyPoints.length === 0 ? (
          <div className={styles.empty}>{LABELS.importance.noKeyPoints}</div>
        ) : keyPoints.map((p) => {
          const lv = importanceLevel(p.level);
          return (
            <button key={`${p.passageId ?? ''}-${p.from}`} className={styles.point} onClick={() => goToPoint(p)} style={{ ['--level-color' as string]: lv.color }} title={lv.label}>
              <span className={styles.pointIcon} aria-hidden="true">{lv.icon}</span>
              <span className={styles.pointText}>{p.text}</span>
              {p.reviewDue && <span className={styles.pointReview}>🔁 {LABELS.importance.due(formatDate(p.reviewDue))}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
