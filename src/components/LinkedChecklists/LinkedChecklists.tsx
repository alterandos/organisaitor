import { useListItemViews, useListViews } from '@/store/listViews';
import { toggleChecklistItemWithTasks } from '@/services/taskListLinks';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { LABELS } from '@/config/labels';
import type { ListId, ListItemId } from '@/types/lists';
import styles from './LinkedChecklists.module.css';

// A task's linked checklists, shown inside the task as tickable steps. Nothing is copied: each row
// IS the list item, so ticking here ticks it in Lists too, and ticking the last one goes through
// toggleChecklistItemWithTasks (which offers to complete the task). Non-checklist lists stay plain
// links in CrossAppRefPicker's chips.
export function LinkedChecklists({ listIds }: { listIds: ListId[] }) {
  const lists = useListViews();
  const items = useListItemViews();

  const checklists = listIds.map((id) => lists[id]).filter((l) => l?.kind === 'checklist');
  if (checklists.length === 0) return null;

  return (
    <div className={styles.root}>
      {checklists.map((list) => {
        const own = Object.values(items).filter((i) => i.listId === list.id).sort((a, b) => a.order - b.order);
        const ordered = [...own.filter((i) => i.status !== 'done'), ...own.filter((i) => i.status === 'done')];
        const done = own.length - own.filter((i) => i.status !== 'done').length;
        const complete = own.length > 0 && done === own.length;
        return (
          <div key={list.id} className={styles.list}>
            <button type="button" className={styles.header} onClick={() => openArtifactTarget('list', list.id)} title="Open list">
              <span>{list.isEncrypted ? '🔒' : (list.icon ?? '📋')}</span>
              <span className={styles.name}>{list.name}</span>
              {list.resetOnTaskComplete && <span className={styles.reusable} title={LABELS.checklist.reusableHint}>↻ {LABELS.checklist.reusable}</span>}
              <span className={`${styles.progress} ${complete ? styles.progressDone : ''}`}>{done}/{own.length}</span>
            </button>
            {ordered.length === 0 ? (
              <p className={styles.empty}>{LABELS.checklist.empty}</p>
            ) : (
              <ul className={styles.items}>
                {ordered.map((item) => {
                  const itemDone = item.status === 'done';
                  return (
                    <li key={item.id} className={`${styles.item} ${itemDone ? styles.itemDone : ''}`}>
                      <button
                        type="button"
                        className={`${styles.check} ${itemDone ? styles.checkDone : ''}`}
                        onClick={() => void toggleChecklistItemWithTasks(item.id as ListItemId)}
                        role="checkbox"
                        aria-checked={itemDone}
                        aria-label={itemDone ? `Untick ${item.title}` : `Tick ${item.title}`}
                      >
                        {itemDone && '✓'}
                      </button>
                      <span className={styles.title}>{item.title}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
