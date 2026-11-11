import { useMemo, useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { LABELS } from '@/config/labels';
import { INBOX_ICON } from '@/config/itemIcons';
import { ItemPickerModal } from '@/components/ItemPickerModal/ItemPickerModal';
import { rankPicker } from '@/components/ItemPickerModal/rankPicker';
import { listInboxes, type SendTarget } from '@/services/noteInbox';
import type { RankField } from '@/utils/suggestRank';
import type { InboxRef } from '@/utils/noteInboxes';
import own from './InboxPickerModal.module.css';

interface Props {
  suggestFrom: string;
  onSend:      (target: SendTarget, makeTask: boolean) => void;
  onClose:     () => void;
}

type Choice = { kind: 'inbox'; inbox: InboxRef } | { kind: 'new' };

const fieldsOf = (i: InboxRef): RankField[] => [
  { text: i.title, weight: 3 },
  { text: i.noteTitle, weight: 2 },
  { text: i.items.map((it) => it.fullText).join(' '), weight: 1, counted: true },
];
const recencyOf = (i: InboxRef) => Math.max(0, ...i.items.map((it) => Date.parse(it.sentAt ?? '') || 0));

// Send to inbox: every inbox in a readable note, in the picker dialog (components/ItemPickerModal),
// ordered like every picker (utils/suggestRank.ts): suggested from the selected words, then the
// most recently used. The last choice makes a new inbox at the end of this note.
export function InboxPickerModal({ suggestFrom, onSend, onClose }: Props) {
  const notes = useNoteStore((s) => s.notes);
  const [query, setQuery] = useState('');
  const [makeTask, setMakeTask] = useState(false);
  const L = LABELS.sendToInbox;

  const { choices, sections } = useMemo(() => {
    void notes;
    const ranked = rankPicker(listInboxes(), fieldsOf, recencyOf, query, suggestFrom);
    const list: Choice[] = ranked.rows.map((inbox) => ({ kind: 'inbox', inbox }));
    const kept = ranked.sections.filter((s) => s.at < list.length);
    list.push({ kind: 'new' });
    return { choices: list, sections: kept };
  }, [notes, query, suggestFrom]);

  const send = (c: Choice) => { onClose(); onSend(c.kind === 'new' ? { newHere: true } : c.inbox, makeTask); };

  return (
    <ItemPickerModal
      label={L.pickerTitle}
      heading={`${INBOX_ICON} ${L.pickerTitle}`}
      query={query}
      onQuery={setQuery}
      search={L.search}
      rows={choices}
      sections={sections}
      keyOf={(c) => (c.kind === 'new' ? 'new' : `${c.inbox.noteId}:${c.inbox.inboxId}`)}
      render={(c) => ({
        title: c.kind === 'new' ? `＋ ${L.newHere}` : `${INBOX_ICON} ${c.inbox.title || LABELS.noteBlocks.inbox.defaultTitle}`,
        meta: c.kind === 'new' ? undefined : `${c.inbox.noteTitle || 'Untitled'} · ${c.inbox.items.length}`,
      })}
      onPick={send}
      onClose={onClose}
      above={<>
        <label className={own.option}>
          <input type="checkbox" checked={makeTask} onChange={(e) => setMakeTask(e.target.checked)} />
          {L.alsoTask}
        </label>
        {choices.length === 1 && <p className={own.empty}>{L.empty}</p>}
      </>}
      footer={L.footer}
    />
  );
}
