import { useMemo } from 'react';
import { LinkedItemsField } from '@/components/LinkedItemsField/LinkedItemsField';
import { useLinksTo } from '@/services/linksTo';
import { LINK_TARGETS } from '@/services/linkTargets';
import { LABELS } from '@/config/labels';
import type { List } from '@/types/lists';
import styles from './ListsSection.module.css';

// Under a list's name: what links to it (tasks and calendar items: services/linksTo.ts, the one
// "what links here", worked out on each change and never stored, like a note's "Linked from" bar),
// and the list's own links to notes (List.crossAppRefs, through the one Linked items field; the
// note shows them in its "Linked from" bar in turn).
export function ListLinksBar({ list }: { list: List }) {
  const incoming = useLinksTo('list', list.id);
  const backlinks = useMemo(() => {
    const seen = new Set<string>();
    return incoming.filter((l) => {
      const key = `${l.type}:${l.id}`;
      if (l.via !== 'reference' || l.archived || l.type === 'list' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [incoming]);

  return (
    <div className={styles.linksBar}>
      {backlinks.length > 0 && (
        <div className={styles.linksRow}>
          <span className={styles.linksLabel}>{LABELS.listLinks.linkedFrom}</span>
          {backlinks.map((b) => (
            <button
              key={`${b.type}:${b.id}`}
              type="button"
              className={`${styles.backlinkChip} ${b.done ? styles.backlinkChipDone : ''}`}
              onClick={() => LINK_TARGETS[b.type].open(b.id)}
            >
              {LINK_TARGETS[b.type].icon} {b.title}
            </button>
          ))}
        </div>
      )}
      <div className={styles.linksRow}>
        <span className={styles.linksLabel}>{LABELS.listLinks.notesLabel}</span>
        <LinkedItemsField owner={{ type: 'list', id: list.id }} refs={list.crossAppRefs ?? []} suggestFrom={list.name} offers={['note']} />
      </div>
    </div>
  );
}
