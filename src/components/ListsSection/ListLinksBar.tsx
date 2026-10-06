import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListStore } from '@/store/listStore';
import { useUIStore } from '@/store/uiStore';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import { linkedListIds } from '@/services/taskListLinks';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import type { CrossAppRef } from '@/types';
import type { List, ListId } from '@/types/lists';
import styles from './ListsSection.module.css';

interface Backlink { type: 'task' | 'event' | 'reminder' | 'deadline'; id: string; title: string; done: boolean }
const ICON: Record<Backlink['type'], string> = ITEM_TYPE_ICON;

// Under a list's name: what links to it (tasks and calendar items — worked out from their
// crossAppRefs on each change, never stored, like a note's "Linked from" bar), and the list's own
// links to notes (List.crossAppRefs — the note shows them in its "Linked from" bar in turn).
export function ListLinksBar({ list }: { list: List }) {
  const tasks     = useTaskStore((s) => s.tasks);
  const events    = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const updateListLinks = useListStore((s) => s.updateListLinks);

  const backlinks = useMemo(() => {
    const links = (refs: CrossAppRef[] | undefined) => linkedListIds(refs).includes(list.id as ListId);
    const out: Backlink[] = [];
    for (const t of Object.values(tasks)) if (!t.archived && links(t.crossAppRefs)) out.push({ type: 'task', id: t.id, title: t.title, done: t.completed });
    for (const e of Object.values(events)) if (!e.archivedAt && links(e.crossAppRefs)) out.push({ type: 'event', id: e.id, title: e.title, done: false });
    for (const r of Object.values(reminders)) if (!r.archivedAt && links(r.crossAppRefs)) out.push({ type: 'reminder', id: r.id, title: r.title, done: false });
    for (const d of Object.values(deadlines)) if (!d.archivedAt && links(d.crossAppRefs)) out.push({ type: 'deadline', id: d.id, title: d.title, done: false });
    return out;
  }, [list.id, tasks, events, reminders, deadlines]);

  function handleNotesChange(next: CrossAppRef[]) {
    const current = list.crossAppRefs ?? [];
    const removed = current.filter((r) => !next.some((n) => n.type === r.type && n.id === r.id));
    removed.forEach((ref) => unlinkCrossAppRef('list', list.id, ref));
    updateListLinks(list.id as ListId, { crossAppRefs: next });
  }

  function openNote(ref: CrossAppRef) {
    if (ref.type !== 'note') return;
    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().openNote(ref.id, ref.tabId);
  }

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
              onClick={() => openArtifactTarget(b.type, b.id)}
            >
              {ICON[b.type]} {b.title}
            </button>
          ))}
        </div>
      )}
      <div className={styles.linksRow}>
        <span className={styles.linksLabel}>{LABELS.listLinks.notesLabel}</span>
        <CrossAppRefPicker value={list.crossAppRefs ?? []} onChange={handleNotesChange} onNavigate={openNote} suggestFrom={list.name} types={['note']} />
      </div>
    </div>
  );
}
