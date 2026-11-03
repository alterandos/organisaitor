import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListStore } from '@/store/listStore';
import { useUIStore, type SendToListRequest } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { listView } from '@/services/listSecrets';
import { glossaryKindOf } from '@/services/glossaryLists';
import { sendDraftsToList } from '@/services/sendToList';
import { DICTIONARY_TYPE_ID } from '@/services/dictionary';
import { BOOKS_TYPE_ID } from '@/services/readingList';
import { draftsFromText, textLines, type ListItemDraft } from '@/utils/listDrafts';
import { ListPickerModal } from '@/components/ListPickerModal/ListPickerModal';
import { FieldInput } from '@/components/FieldInput/FieldInput';
import { CloseIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { FieldSchema } from '@/types';
import type { ListId } from '@/types/lists';
import styles from './SendToList.module.css';

const L = LABELS.sendToList;

// Send to ▸ A list… (services/sendToList.ts): which list (the list picker, suggested from the
// text), then the items it would make, filled in where the text says (utils/listDrafts.ts), for the
// person to check and fix before sending. Mounted in App.tsx while uiStore.sendToListRequest is set.
export function SendToListFlow({ request }: { request: SendToListRequest }) {
  const [listId, setListId] = useState<ListId | null>(null);
  const done = () => useUIStore.getState().requestSendToList(null);
  if (!listId) {
    return <ListPickerModal excludeIds={new Set()} suggestFrom={request.text.slice(0, 200)} onPick={(id) => setListId(id as ListId)} onClose={done} />;
  }
  return <SendToListModal key={listId} listId={listId} request={request} onClose={done} />;
}

function SendToListModal({ listId, request, onClose }: { listId: ListId; request: SendToListRequest; onClose: () => void }) {
  const raw = useListStore((s) => s.lists[listId]);
  const list = raw ? listView(raw) : null;
  const glossaryKind = glossaryKindOf(list);
  const fields = (glossaryKind || list?.typeId === DICTIONARY_TYPE_ID ? [] : list?.fieldSchema ?? []) as unknown as FieldSchema[];
  const lineCount = textLines(request.text).length;
  // Several short lines read as a list of things: one item each to start with.
  const [perLine, setPerLine] = useState(() => lineCount > 1 && lineCount <= 30 && textLines(request.text).every((l) => l.length <= 80));
  const [drafts, setDrafts] = useState<ListItemDraft[]>(() => draftsFromText(request.text, list?.fieldSchema ?? [], perLine));
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEscapeClose(onClose);
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  function regroup(next: boolean) {
    setPerLine(next);
    setDrafts(draftsFromText(request.text, list?.fieldSchema ?? [], next));
  }
  const change = (i: number, patch: Partial<ListItemDraft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    const sent = await sendDraftsToList(listId, drafts, request);
    setSending(false);
    if (sent) onClose();
  }

  if (!list) return null;
  const hint = glossaryKind ? L.glossary(glossaryKind) : list.typeId === DICTIONARY_TYPE_ID ? L.dictionary : list.typeId === BOOKS_TYPE_ID ? L.books : null;
  const count = drafts.filter((d) => d.title.trim()).length;

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form ref={formRef} className={styles.modal} onSubmit={(e) => void submit(e)} aria-label={L.title(list.name)}>
        <header className={styles.head}>
          <h2 className={styles.title}>{list.icon} {L.title(list.name)}</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={LABELS.dialogs.cancel}><CloseIcon /></button>
        </header>
        {lineCount > 1 && (
          <label className={styles.perLine}>
            <input type="checkbox" checked={perLine} onChange={(e) => regroup(e.target.checked)} /> {L.perLine(lineCount)}
          </label>
        )}
        {hint && <p className={styles.hint}>{hint}</p>}
        <ol className={styles.items}>
          {drafts.map((d, i) => (
            <li key={i} className={styles.item}>
              <div className={styles.itemHead}>
                <input className={styles.titleInput} value={d.title} aria-label={L.item} placeholder={L.item} onChange={(e) => change(i, { title: e.target.value })} />
                {drafts.length > 1 && (
                  <button type="button" className={styles.iconBtn} onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))} title={L.remove} aria-label={L.remove}><CloseIcon /></button>
                )}
              </div>
              {fields.length > 0 && (
                <div className={styles.fields}>
                  {fields.map((f) => (
                    <label key={f.id} className={styles.field}>
                      <span className={styles.fieldName}>{f.name}</span>
                      <FieldInput field={f} value={d.data[f.id]} onChange={(v) => change(i, { data: { ...d.data, [f.id]: v } })} />
                    </label>
                  ))}
                </div>
              )}
              {(d.notes || !glossaryKind) && list.typeId !== DICTIONARY_TYPE_ID && (
                <label className={styles.field}>
                  <span className={styles.fieldName}>{L.notes}</span>
                  <textarea className={styles.notes} value={d.notes} rows={Math.min(4, Math.max(1, d.notes.split('\n').length))} onChange={(e) => change(i, { notes: e.target.value })} />
                </label>
              )}
            </li>
          ))}
        </ol>
        <footer className={styles.foot}>
          <button type="button" className={styles.cancel} onClick={onClose}>{LABELS.dialogs.cancel}</button>
          <button type="submit" className={styles.send} disabled={!count || sending}>{L.send(count)} <span className={styles.kbd}>Ctrl+Enter</span></button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
