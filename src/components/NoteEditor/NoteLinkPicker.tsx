import { useMemo, useRef, useState } from 'react';
import type { Schema } from '@tiptap/pm/model';
import { NotePickerModal } from '@/components/NotePickerModal/NotePickerModal';
import { useNoteStore } from '@/store/noteStore';
import { noteView } from '@/services/noteSecrets';
import { ensureBlockId, noteDocFor } from '@/services/noteLinkTargets';
import { passagesOf, type Passage } from '@/utils/noteLinks';
import { MAIN_TAB_ID } from '@/utils/noteTabs';
import { LABELS } from '@/config/labels';
import { EMBED_ICON, NOTE_LINK_ICON } from '@/config/itemIcons';
import type { NoteId } from '@/types';
import { ItemPickerModal } from '@/components/ItemPickerModal/ItemPickerModal';
import own from './NoteLinkPicker.module.css';

export interface PickedLink {
  noteId:  string;
  tabId:   string | null;
  blockId: string | null;
  // What the link reads as when it's put in with no text selected: the heading, else the note's title.
  name:    string;
}

interface Props {
  purpose:     'link' | 'embed';
  schema:      Schema;
  suggestFrom: string;
  onPick:      (picked: PickedLink) => void;
  onClose:     () => void;
}

// Linking or embedding (`[[`, `\ref`, `\embed`, Link to a note…): the note picker, then which part
// of that note (the whole note, a heading and its section, or a paragraph). Choosing a passage gives
// it a lasting id in its note (ensureBlockId) so the link holds as the note changes.
export function NoteLinkPicker({ purpose, schema, suggestFrom, onPick, onClose }: Props) {
  const [note, setNote] = useState<{ id: string; tabId: string | null } | null>(null);
  // The note picker closes itself after a pick; that close moves on to the passage step instead.
  const picked = useRef(false);
  if (!note) {
    return (
      <NotePickerModal
        excludeIds={NO_EXCLUSIONS}
        suggestFrom={suggestFrom}
        onPick={(id, tabId) => { picked.current = true; setNote({ id, tabId: !tabId || tabId === MAIN_TAB_ID ? null : tabId }); }}
        onClose={() => { if (picked.current) picked.current = false; else onClose(); }}
      />
    );
  }
  return <PassageStep key={`${note.id}:${note.tabId}`} purpose={purpose} schema={schema} noteId={note.id} tabId={note.tabId} onPick={onPick} onBack={() => { picked.current = false; setNote(null); }} onClose={onClose} />;
}

type Choice = { kind: 'whole' } | { kind: 'passage'; passage: Passage };

interface StepProps {
  purpose: 'link' | 'embed';
  schema:  Schema;
  noteId:  string;
  tabId:   string | null;
  onPick:  (picked: PickedLink) => void;
  onBack:  () => void;
  onClose: () => void;
}

const SNIPPET = 120;
const NO_EXCLUSIONS: ReadonlySet<string> = new Set();

function PassageStep({ purpose, schema, noteId, tabId, onPick, onBack, onClose }: StepProps) {
  const L = LABELS.noteLinks;
  const raw = useNoteStore((s) => s.notes[noteId as NoteId]);
  const title = raw ? noteView(raw).title || LABELS.mobileNotes.untitled : '';
  const [query, setQuery] = useState('');

  const passages = useMemo(() => {
    void raw;
    const doc = noteDocFor(noteId, tabId, schema);
    return doc ? passagesOf(doc) : [];
  }, [raw, noteId, tabId, schema]);

  const choices = useMemo<Choice[]>(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = passages.filter((p) => words.every((w) => p.text.toLowerCase().includes(w)));
    return [...(words.length ? [] : [{ kind: 'whole' } as Choice]), ...hits.map((passage) => ({ kind: 'passage', passage }) as Choice)];
  }, [passages, query]);

  const pick = (c: Choice) => {
    if (c.kind === 'whole') { onClose(); onPick({ noteId, tabId, blockId: null, name: title }); return; }
    const blockId = c.passage.blockId ?? ensureBlockId(noteId, tabId, c.passage.pos, schema);
    onClose();
    onPick({ noteId, tabId, blockId, name: c.passage.kind === 'paragraph' ? title : c.passage.kind === 'block' ? (c.passage.text || c.passage.label || title) : c.passage.text });
  };

  const heading = purpose === 'embed' ? L.pickEmbed : L.pickPassage;
  return (
    <ItemPickerModal
      label={heading}
      heading={<>{purpose === 'embed' ? EMBED_ICON : NOTE_LINK_ICON} {heading} <span className={own.noteName}>{title}</span></>}
      onBack={onBack}
      query={query}
      onQuery={setQuery}
      search={L.searchPassages}
      rows={choices}
      keyOf={(c) => (c.kind === 'whole' ? 'whole' : String(c.passage.pos))}
      render={(c) => {
        const text = c.kind === 'whole' ? L.wholeNote : c.passage.text.length > SNIPPET ? `${c.passage.text.slice(0, SNIPPET)}…` : c.passage.text;
        const level = c.kind === 'passage' && (c.passage.kind === 'heading' || c.passage.kind === 'part') ? c.passage.level : 0;
        const kind = c.kind === 'passage' ? c.passage.kind : null;
        return {
          title: (
            <span
              className={c.kind === 'whole' ? own.whole : kind === 'heading' ? own.heading : kind === 'block' ? own.block : kind === 'part' ? own.part : own.paragraph}
              style={kind === 'heading' ? { paddingLeft: `${(level - 1) * 0.75}rem` } : undefined}
            >
              {kind === 'block' && c.kind === 'passage' && <span className={own.blockKind}>{c.passage.label}</span>}
              {text}
            </span>
          ),
        };
      }}
      onPick={pick}
      onClose={onClose}
      empty={L.noPassages}
      footer={L.passageFooter}
    />
  );
}
