import { compareSize, pictureFills } from '@/utils/sizeComparison';
import { useHoverOpen } from '@/hooks/useHoverOpen';
import { LABELS } from '@/config/labels';
import styles from './SizeLike.module.css';

const L = LABELS.converters.like;

// "≈ like…" under a conversion (asked for by the user 2026-11-02): the amount pictured by something
// of a known size (utils/sizeComparison.ts). Hidden until the conversion is hovered (always there
// on touch); hovering "≈ like…" previews the comparison, a click keeps it shown (`open`, kept by
// the host: the note block's `like`, the Converters pane's setting), and a click on it hides it.
// The pictures: one per whole reference, the last filled only as far as the part (a half-filled
// elephant for 2,500 kg); past ten, one picture and "× N".
export function SizeLike({ categoryId, base, open, editable, onOpen }: {
  categoryId: string; base: number; open: boolean; editable: boolean; onOpen: (open: boolean) => void;
}) {
  const hover = useHoverOpen(!open);
  const c = compareSize(categoryId, base);
  if (!c) return null;
  const shown = open || hover.open;
  return (
    <div className={styles.like} {...hover.handlers}>
      {!open && (
        <button type="button" className={styles.chip} data-like-chip="" aria-expanded={shown} title={L.showTitle}
          onClick={() => { if (editable) { hover.close(); onOpen(true); } }}>{L.show}</button>
      )}
      {shown && (
        <div className={styles.body}>
          <Pictures c={c} />
          <div className={styles.words}>
            <button type="button" className={styles.phrase} disabled={!open || !editable} title={open ? L.hideTitle : undefined} onClick={() => onOpen(false)}>
              ≈ {c.phrase}
            </button>
            {(c.kind === 'ratio' ? [c.ref] : c.refs).map((r) => <div key={r.name} className={styles.note}>{r.note}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function Pictures({ c }: { c: NonNullable<ReturnType<typeof compareSize>> }) {
  if (c.kind === 'between') {
    return <div className={styles.pictures} aria-hidden="true">{c.refs.map((r) => <span key={r.name} className={styles.pic}>{r.emoji}</span>)}</div>;
  }
  const fills = pictureFills(c.ratio);
  return (
    <div className={styles.pictures} role="img" aria-label={L.picture(c.phrase)}>
      {(fills ?? [1]).map((f, i) => (
        <span key={i} className={styles.pic}>
          <span className={styles.ghost} aria-hidden="true">{c.ref.emoji}</span>
          <span className={styles.fill} aria-hidden="true" style={{ clipPath: `inset(0 ${Math.round((1 - f) * 100)}% 0 0)` }}>{c.ref.emoji}</span>
        </span>
      ))}
      {!fills && <span className={styles.times}>× {Math.round(c.ratio).toLocaleString()}</span>}
    </div>
  );
}
