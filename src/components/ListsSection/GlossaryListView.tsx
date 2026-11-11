import { useMemo, useState } from 'react';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { glossaryKindOf, glossaryListRows, newRecordInList, removeEntryFromList } from '@/services/glossaryLists';
import { fieldList, fieldText } from '@/config/structuredTagTypes';
import { GlossaryOrigin } from '@/components/NotesSection/GlossaryOrigin';
import { kindColor } from '@/components/NoteEditor/builtinTags';
import { CloseIcon, PlusIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { List } from '@/types/lists';
import styles from './GlossaryListView.module.css';

const L = LABELS.glossaryLists;

// A Glossary list in Lists (services/glossaryLists.ts, 2026-11-03): its rows are Glossary records,
// shown as cards in their kind's colour: the headline, the fact (or meaning), its source and where
// it came from, why it was kept (its reasons, as chips). A card opens its record (the one copy) to
// edit (a quote kept from a `\quote` block read-only, with Edit in its note: GlossaryRecordModal); × takes it out of the list, the record staying in the Glossary; + makes a new record in the
// list. The reasons used in the list filter it (any of those picked; none picked is all).
const fieldsOf = (raw: unknown) => ((raw as { fields?: Record<string, unknown> } | undefined)?.fields ?? {});
export function GlossaryListView({ list }: { list: List }) {
  const items = useListStore((s) => s.listItems);
  const entries = useNoteStore((s) => s.structuredTagEntries);
  const notes = useNoteStore((s) => s.notes);
  const secrets = useSecretsVersion((s) => s.version);
  const rows = useMemo(() => {
    void items; void entries; void notes; void secrets;
    return glossaryListRows(list.id);
  }, [list.id, items, entries, notes, secrets]);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const reasonsOf = (id: string, locked: boolean) => (locked ? [] : fieldList(fieldsOf(entries[id as never]), 'reasons'));
  const allReasons = [...new Set(rows.flatMap((r) => reasonsOf(r.entry.id, r.entry.locked)))].sort((a, b) => a.localeCompare(b));
  const shown = picked.size ? rows.filter((r) => reasonsOf(r.entry.id, r.entry.locked).some((x) => picked.has(x))) : rows;
  const toggle = (r: string) => setPicked((p) => { const n = new Set(p); if (n.has(r)) n.delete(r); else n.add(r); return n; });

  return (
    <>
    {allReasons.length > 0 && (
      <div className={styles.reasons} role="group" aria-label={L.reasonFilter}>
        <button type="button" className={`${styles.reason} ${picked.size === 0 ? styles.reasonOn : ''}`} aria-pressed={picked.size === 0} onClick={() => setPicked(new Set())}>{LABELS.glossary.all}</button>
        {allReasons.map((r) => (
          <button key={r} type="button" className={`${styles.reason} ${picked.has(r) ? styles.reasonOn : ''}`} aria-pressed={picked.has(r)} onClick={() => toggle(r)}>{r}</button>
        ))}
      </div>
    )}
    <div className={styles.grid}>
      {rows.length === 0 && <p className={styles.empty}>{glossaryKindOf(list) === 'quote' ? L.emptyQuotes : L.empty}</p>}
      {shown.map(({ itemId, entry }) => {
        const fields = entry.locked ? {} : fieldsOf(entries[entry.id as never]);
        const source = fieldText(fields, 'source');
        const who = fieldText(fields, 'who');
        const reasons = reasonsOf(entry.id, entry.locked);
        return (
          <article key={itemId} className={styles.card} style={{ ['--gc-accent' as string]: kindColor(entry.typeKey, entry.color) }}>
            <button type="button" className={styles.open} onClick={() => useUIStore.getState().openGlossaryRecord(entry.id)} aria-label={L.open(entry.term || LABELS.glossary.untitled)}>
              <span className={styles.headline}>{entry.locked ? '🔒' : entry.icon} {entry.term || LABELS.glossary.untitled}</span>
              <span className={styles.text}>{entry.locked ? LABELS.glossary.locked : entry.meaning || <span className={styles.muted}>{LABELS.glossary.noMeaning}</span>}</span>
            </button>
            {reasons.length > 0 && <div className={styles.cardReasons}>{reasons.map((r) => <span key={r} className={styles.cardReason}>{r}</span>)}</div>}
            <footer className={styles.foot}>
              {who && <span className={styles.who}>— {who}</span>}
              {source && <span className={styles.source}>{source}</span>}
              <GlossaryOrigin entry={entry} />
            </footer>
            <button type="button" className={styles.remove} onClick={() => removeEntryFromList(itemId)} title={L.remove} aria-label={L.remove}>
              <CloseIcon />
            </button>
          </article>
        );
      })}
      <button type="button" className={styles.add} onClick={() => newRecordInList(list.id)}>
        <PlusIcon aria-hidden="true" /> {L.add}
      </button>
    </div>
    </>
  );
}
