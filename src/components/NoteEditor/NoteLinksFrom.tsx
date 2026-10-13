import { useMemo, useState } from 'react';
import type { Schema } from '@tiptap/pm/model';
import { useNoteViews } from '@/store/noteViews';
import { openNotePassage } from '@/services/notePassage';
import { editNoteText } from '@/services/noteContentEdit';
import { openNoteLink } from '@/services/noteLinkTargets';
import { linksToNote, mentionRange, unlinkedMentions } from '@/utils/noteLinks';
import { LABELS } from '@/config/labels';
import { DisclosureIcon } from '@/components/Icons';
import type { Note } from '@/types/notes';
import styles from './NoteLinksFrom.module.css';

interface Props {
  note:   Note;
  schema: Schema;
}

// At the foot of a note: the notes that link to it, each with the sentence the link is in (click to
// go there), and the notes that name it without linking, each with a Link button that makes the
// mention a link. Both start folded, so they never crowd the note. Agreed with the user 2026-10-13.
export function NoteLinksFrom({ note, schema }: Props) {
  const views = useNoteViews();
  const [open, setOpen] = useState<{ links: boolean; mentions: boolean }>({ links: false, mentions: false });
  const L = LABELS.noteLinks;

  const { links, mentions } = useMemo(() => {
    const others = Object.values(views).filter((n) => n.id !== note.id);
    return { links: linksToNote(others, note.id), mentions: unlinkedMentions(others, note.id, note.title) };
  }, [views, note.id, note.title]);

  if (links.length === 0 && mentions.length === 0) return null;

  const goTo = (fromNoteId: string) => openNotePassage(fromNoteId, { mark: 'noteLink', attr: 'noteId', value: note.id });

  const linkMention = (noteId: string, tabId: string | null) => {
    editNoteText(noteId, tabId, schema, (tr) => {
      const r = mentionRange(tr.doc, note.title);
      const type = schema.marks.noteLink;
      if (!r || !type) return false;
      tr.addMark(r.from, r.to, type.create({ noteId: note.id }));
      return true;
    });
  };

  const section = (key: 'links' | 'mentions', label: string, count: number, body: React.ReactNode, title?: string) => count > 0 && (
    <section className={styles.section}>
      <button type="button" className={styles.heading} aria-expanded={open[key]} onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} title={title}>
        <DisclosureIcon open={open[key]} />
        <span>{label}</span>
        <span className={styles.count}>{count}</span>
      </button>
      {open[key] && <ul className={styles.list}>{body}</ul>}
    </section>
  );

  return (
    <div className={styles.foot}>
      {section('links', L.fromNotes, links.length, links.map((l, i) => (
        <li key={`${l.fromNoteId}:${l.tabId}:${i}`} className={styles.item}>
          <button type="button" className={styles.itemMain} onClick={() => goTo(l.fromNoteId)}>
            <span className={styles.itemTitle}>{l.fromTitle || LABELS.mobileNotes.untitled}</span>
            <span className={styles.context}>{highlightIn(l.context, l.text)}</span>
          </button>
        </li>
      )))}
      {section('mentions', L.mentions, mentions.length, mentions.map((m) => (
        <li key={`${m.noteId}:${m.tabId}`} className={styles.item}>
          <button type="button" className={styles.itemMain} onClick={() => openNoteLink(m.noteId, m.tabId, null)}>
            <span className={styles.itemTitle}>{m.title || LABELS.mobileNotes.untitled}</span>
            <span className={styles.context}>{highlightIn(m.context, note.title)}</span>
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => linkMention(m.noteId, m.tabId)} title={L.linkMentionTitle}>{L.linkMention}</button>
        </li>
      )), L.mentionsTitle)}
    </div>
  );
}

// The sentence with the linked or mentioned words picked out.
function highlightIn(context: string, words: string) {
  const i = context.toLowerCase().indexOf(words.toLowerCase());
  if (!words || i < 0) return context;
  return <>{context.slice(0, i)}<mark className={styles.mark}>{context.slice(i, i + words.length)}</mark>{context.slice(i + words.length)}</>;
}
