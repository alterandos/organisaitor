import { useMemo, useState } from 'react';
import { selectActiveCollectionId, useUIStore } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { useEndeavourScope } from '@/hooks/useEndeavourScope';
import { inEndeavourScope } from '@/utils/endeavourGraph';
import { getOrderedEndeavours } from '@/utils/collections';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { noteName } from '@/utils/notes';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { clarifyItems, clearClarifyItem, openClarifyItem, type ClarifyItem, type ClarifyList } from '@/services/noteClarify';
import { noteSchema } from '@/services/lookUp';
import { LABELS } from '@/config/labels';
import { CheckCircleIcon, ClarifyIcon, CloseIcon, EditIcon, OpenIcon, UnsureIcon } from '@/components/Icons';
import styles from './ClarifyView.module.css';

const L = LABELS.clarify;
const LISTS: ClarifyList[] = ['learn', 'check', 'learned'];
const EMPTY: Record<ClarifyList, string> = { learn: L.emptyLearn, check: L.emptyCheck, learned: L.emptyLearned };
const TAB_ICON = { learn: ClarifyIcon, check: UnsureIcon, learned: CheckCircleIcon };
const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Clarify (2026-11-05, in Review's style): what you marked "Clarify later" (To learn) and what
// you're not sure of (To check), from text, whole blocks and Glossary cards, grouped by note; and
// what was learned, with the date (Learned). Each opens where it is (a card can also be edited here,
// in GlossaryRecordModal), or moves on with Learned it / Resolved / Learn again
// (services/noteClarify.ts).
export function ClarifyView() {
  const closeNotesView = useUIStore((s) => s.closeNotesView);
  const close = () => closeNotesView('clarify');
  useEscapeClose(close);
  const notes = useNoteStore((s) => s.notes);
  const entries = useNoteStore((s) => s.structuredTagEntries);
  const noteTags = useNoteStore((s) => s.noteTags);
  const views = useNoteViews();
  const [list, setList] = useState<ClarifyList>('learn');
  const schema = useMemo(() => noteSchema(), []);
  // Recomputed when a note or record changes (Learned it changes one).
  const { items, locked } = useMemo(() => clarifyItems(schema), [schema, notes, entries]); // eslint-disable-line react-hooks/exhaustive-deps -- the stores are the trigger; clarifyItems reads them
  // The Notes section's Endeavour filter (the header's), which the picker here also sets: the chosen
  // Endeavour and everything part of it.
  const endeavourId = useUIStore(selectActiveCollectionId);
  const setEndeavour = useUIStore((s) => s.setActiveCollection);
  const collections = useTaskStore((s) => s.collections);
  const scope = useEndeavourScope(endeavourId);
  const inScope = items.filter((i) => inEndeavourScope(scope, i.collectionId));
  // Learned: the latest first.
  const shown = inScope.filter((i) => i.list === list)
    .sort((a, b) => (list === 'learned' ? (b.learnedAt ?? '').localeCompare(a.learnedAt ?? '') : 0));
  const openRecord = useUIStore((s) => s.openGlossaryRecord);
  const count = (l: ClarifyList) => inScope.filter((i) => i.list === l).length;
  const endeavours = getOrderedEndeavours(collections);

  const whereOf = (noteId: string | null) => {
    const v = noteId ? views[noteId as never] : undefined;
    return v ? noteName(v, noteTags, { untitled: LABELS.glossary.untitledNote }).full : LABELS.glossary.untitledNote;
  };
  const groups = new Map<string, ClarifyItem[]>();
  for (const item of shown) {
    const k = item.where === 'card' ? `card:${item.noteId ?? ''}` : item.noteId ?? '';
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}><ClarifyIcon className={styles.titleIcon} />{L.title}</span>
        {endeavours.length > 0 && (
          <select className={styles.endeavour} value={endeavourId ?? ''} onChange={(e) => setEndeavour(e.target.value || null)} aria-label={L.filterEndeavour}>
            <option value="">{L.allEndeavours}</option>
            {endeavours.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button type="button" className={styles.closeBtn} onClick={close} title={LABELS.glossary.back} aria-label={LABELS.glossary.back}><CloseIcon /></button>
      </div>
      <div className={styles.tabs} role="tablist" aria-label={L.title}>
        {LISTS.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={list === l} title={L.tabHints[l]}
            className={`${styles.tab} ${list === l ? styles.tabOn : ''}`} onClick={() => setList(l)}>
            {(() => { const Icon = TAB_ICON[l]; return <Icon className={styles.tabIcon} />; })()}
            {L.tabs[l]}<span className={styles.count}>{count(l)}</span>
          </button>
        ))}
      </div>

      <div className={styles.body} role="tabpanel">
        {shown.length === 0 ? (
          <div className={styles.empty}>{EMPTY[list]}</div>
        ) : (
          [...groups.entries()].map(([k, group]) => (
            <section key={k} className={styles.group}>
              <h3 className={styles.groupTitle}>{whereOf(group[0].noteId)}</h3>
              {group.map((item) => (
                <article key={item.key} className={styles.card} data-list={list}>
                  {item.where === 'card' && <div className={styles.kicker}>{item.kindLabel}</div>}
                  <blockquote className={styles.passage}>{item.text || '…'}</blockquote>
                  {item.context && <p className={styles.context}>{item.context}</p>}
                  {item.note && <p className={styles.note}>{item.note}</p>}
                  {item.learnedAt && <p className={styles.learnedOn}>{L.learnedOn(dateOf(item.learnedAt))}</p>}
                  <div className={styles.actions}>
                    {item.entryId && (
                      <button type="button" className={styles.open} title={L.editCardHint} onClick={() => openRecord(item.entryId!)}><EditIcon /> {L.editCard}</button>
                    )}
                    <button type="button" className={styles.open} onClick={() => openClarifyItem(item)}>{L.openIt} <OpenIcon /></button>
                    <button type="button" className={styles.done} onClick={() => clearClarifyItem(item, schema)}>{L.done[list]}</button>
                  </div>
                </article>
              ))}
            </section>
          ))
        )}
        {locked > 0 && <p className={styles.locked}>{L.locked(locked)}</p>}
      </div>
    </div>
  );
}
