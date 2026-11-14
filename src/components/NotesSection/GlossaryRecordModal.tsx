import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { entryView, isEntryLocked } from '@/services/noteSecrets';
import { glossaryEntry, glossaryKindLine } from '@/services/glossary';
import { deleteGlossaryEntryAsked } from '@/services/glossaryDelete';
import { deleteForever, trashedBy } from '@/services/trash';
import { noteSchema } from '@/services/lookUp';
import { forgetEntryInLists } from '@/services/glossaryLists';
import { isKeptFromBlock, openKeptBlock } from '@/services/keptQuotes';
import { GlossaryCardBody } from '@/components/NoteEditor/extensions/GlossaryCardBody';
import { GlossaryOrigin } from './GlossaryOrigin';
import { kindColor } from '@/components/NoteEditor/builtinTags';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { StructuredTagEntryId } from '@/types';
import styles from './GlossaryRecordModal.module.css';

const L = LABELS.glossary;

// Nothing written in it yet (a "+ New" record left as it was made): it goes for good on closing.
function isBlank(id: string): boolean {
  const raw = useNoteStore.getState().structuredTagEntries[id as StructuredTagEntryId];
  if (!raw || isEntryLocked(raw)) return false;
  const e = entryView(raw);
  const filled = Object.values(e.fields).some((v) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v != null));
  return !e.term.trim() && !filled;
}

// A Glossary record opened on its own (2026-11-03: a record lives in the Glossary, so it can be made
// and edited there, from a Glossary list, or from a link to it, not only in a note). Mounted once
// in App.tsx while uiStore.glossaryRecordId is set. The record is shown as its real card, full size: the same
// card a note shows, so it's written in exactly as it will look. Where it came from below it; Esc,
// Ctrl+Enter or Done closes it. A quote kept from a `\quote` block is read-only here, with Edit in its note. A new record (from "+ New") left empty goes for good on closing.
export function GlossaryRecordModal({ entryId, fresh }: { entryId: string; fresh: boolean }) {
  const close = () => {
    if (fresh && isBlank(entryId)) {
      for (const t of trashedBy(() => useNoteStore.getState().deleteStructuredTagEntry(entryId as StructuredTagEntryId))) deleteForever(t);
      forgetEntryInLists(entryId);
    }
    useUIStore.getState().openGlossaryRecord(null);
  };
  useEscapeClose(close);
  useCtrlEnterSubmit(close);
  const [shown, setShown] = useState<string[]>([]);
  const [waiting, setWaiting] = useState<{ id: string; name: string }[]>([]);
  useNoteStore((s) => s.structuredTagEntries[entryId as StructuredTagEntryId]);
  const entry = glossaryEntry(entryId);
  // A quote kept from a `\quote` block is written in its block (services/keptQuotes.ts): shown
  // read-only here, with a button to its block.
  const kept = isKeptFromBlock(entryId);
  const editInNote = () => { useUIStore.getState().openGlossaryRecord(null); openKeptBlock(entryId); };

  async function remove() {
    if (await deleteGlossaryEntryAsked(entryId, noteSchema())) useUIStore.getState().openGlossaryRecord(null);
  }

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.modal} role="dialog" aria-label={entry ? `${entry.kindLabel}: ${entry.term || L.untitled}` : L.title} style={entry ? { ['--gc-accent' as string]: kindColor(entry.typeKey, entry.color) } : undefined}>
        <header className={styles.head}>
          <span className={styles.kind}>{entry ? glossaryKindLine(entry) : ''}</span>
          <button type="button" className={styles.iconBtn} onClick={() => void remove()} title={L.deleteRecord} aria-label={L.deleteRecord}><TrashIcon width="1em" height="1em" /></button>
          <button type="button" className={styles.iconBtn} onClick={close} title={LABELS.dialogs.cancel} aria-label={L.back}><CloseIcon /></button>
        </header>
        <div className={styles.card} data-card-editing="">
          <GlossaryCardBody
            entryId={entryId}
            variant="card"
            editable={!kept}
            focusRequest={{ n: fresh ? 1 : 0, text: '' }}
            onEscape={close}
            onDone={close}
            shown={shown}
            onShow={(id) => setShown((s) => (s.includes(id) ? s : [...s, id]))}
            onHide={(id) => setShown((s) => s.filter((x) => x !== id))}
            onWaiting={setWaiting}
            fresh={false}
            onTouched={() => {}}
            onAddAnother={() => {}}
            onDiscard={close}
            onLeave={() => {}}
            onUndo={() => {}}
          />
        </div>
        {kept && (
          <div className={styles.kept}>
            <span>{LABELS.keptQuotes.readOnly}</span>
            <button type="button" className={styles.editInNote} onClick={editInNote}>{LABELS.keptQuotes.editInNote}</button>
          </div>
        )}
        {!kept && waiting.length > 0 && (
          <div className={styles.more} role="group" aria-label={L.addField}>
            {waiting.map((f) => (
              <button key={f.id} type="button" className={styles.morePill} onClick={() => setShown((s) => [...s, f.id])}>+ {f.name}</button>
            ))}
          </div>
        )}
        <footer className={styles.foot}>
          {entry && <GlossaryOrigin entry={entry} />}
          <button type="button" className={styles.done} onClick={close}>{L.done} <span className={styles.kbd}>Ctrl+Enter</span></button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
