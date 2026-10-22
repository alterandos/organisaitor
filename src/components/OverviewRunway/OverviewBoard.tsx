import { useMemo } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { SOURCE_BY_KEY } from '@/overview/sources';
import { BUCKETS, boardBuckets } from '@/overview/timeline';
import { formatDeadline } from '@/utils/date';
import { LABELS } from '@/config/labels';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import type { OverviewRow } from '@/types/overview';
import styles from './OverviewBoard.module.css';

const L = LABELS.overview.runway;

// The Board (agreed with the user 2026-10-22): an Overview in columns of when things are:
// Overdue, Today, This week, Next week, This month, Later, No date; important things first in
// each. What's coming when, at a glance; the Runway shows how much time is left. On a phone it's
// the timeline layout (the columns stack). Reads only the rows it's given, as the Runway does.
export function OverviewBoard({ rows, today, onOpen }: { rows: OverviewRow[]; today: string; onOpen: (row: OverviewRow) => void }) {
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const buckets = useMemo(() => boardBuckets(rows, today), [rows, today]);
  return (
    <div className={styles.board}>
      {BUCKETS.filter((b) => buckets[b].length > 0 || (b !== 'overdue' && b !== 'none')).map((b) => (
        <section key={b} className={`${styles.column} ${b === 'overdue' ? styles.overdue : ''}`} aria-label={L.buckets[b]}>
          <h3 className={styles.columnTitle}>{L.buckets[b]} <span className={styles.count}>{buckets[b].length}</span></h3>
          <div className={styles.cards}>
            {buckets[b].map((r) => (
              <button key={r.key} type="button" className={`${styles.card} ${r.status !== 'open' ? styles.cardDone : ''}`} onClick={() => onOpen(r)}>
                <span className={styles.cardHead}>
                  <span aria-hidden="true">{SOURCE_BY_KEY[r.source].icon}</span>
                  <span className={styles.cardTitle}>{r.title}</span>
                  {r.plan?.important && <span className={styles.flag} title={L.important}>{ITEM_FLAG_ICON.important}</span>}
                </span>
                {(r.when || r.context) && (
                  <span className={styles.cardMeta}>
                    {r.when && b !== 'none' && formatDeadline(r.when, r.time, clockFormat)}
                    {r.when && b !== 'none' && r.context && ' · '}
                    {r.context}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
