import { itemSource, itemSourceTitle, openItemSource } from '@/services/sendToList';
import { OpenIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { ListItem } from '@/types/lists';
import styles from './ListsSection.module.css';

// Where an item sent from a note came from (services/sendToList.ts): a small link that opens the
// passage. Nothing for an item made in the list, or once that note is gone.
export function ListItemSource({ item }: { item: Pick<ListItem, 'data'> }) {
  const title = itemSource(item) ? itemSourceTitle(item) : null;
  if (!title) return null;
  return (
    <button type="button" className={styles.itemSource} title={LABELS.sendToList.fromHint}
      onClick={(e) => { e.stopPropagation(); openItemSource(item); }}>
      <OpenIcon aria-hidden="true" /> {LABELS.sendToList.from(title)}
    </button>
  );
}
