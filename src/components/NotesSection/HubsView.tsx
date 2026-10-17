import { useMemo, useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { useUIStore } from '@/store/uiStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { listHubs, openHub, openHubLink } from '@/services/noteHubs';
import { rankSearch } from '@/utils/suggestRank';
import { noteName } from '@/utils/notes';
import { RELATIONS, type HubRef } from '@/utils/noteHubs';
import { LABELS } from '@/config/labels';
import { HubIcon } from '@/components/Icons';
import styles from './HubsView.module.css';

// Every idea hub across Notes (services/noteHubs.ts), newest-edited notes first: each hub's idea,
// your take, and its links under how they relate. Click a hub's name to go to it in its note, a
// link to follow it. Opened from the # button or Quick Access (a Place); Esc goes back.
export function HubsView() {
  const closeNotesView = useUIStore((s) => s.closeNotesView);
  const close = () => closeNotesView('hubs');
  useEscapeClose(close);
  const notes = useNoteStore((s) => s.notes);
  const views = useNoteViews();
  const noteTags = useNoteStore((s) => s.noteTags);
  const entries = useNoteStore((s) => s.structuredTagEntries);
  const secrets = useSecretsVersion((s) => s.version);
  const [query, setQuery] = useState('');
  const L = LABELS.hubs;

  const all = useMemo(() => {
    void entries; void secrets;
    const updated = (h: HubRef) => Date.parse(notes[h.noteId as never]?.updatedAt ?? '') || 0;
    return listHubs().sort((a, b) => updated(b) - updated(a));
  }, [notes, entries, secrets]);

  const shown = useMemo(() => (query.trim()
    ? rankSearch(all, (h: HubRef) => [
      { text: h.title, weight: 3 }, { text: h.take, weight: 2 }, { text: h.noteTitle, weight: 1 },
      { text: h.links.map((l) => l.label).join(' '), weight: 1, counted: true },
    ], () => 0, query)
    : all), [all, query]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.title}><HubIcon className={styles.titleIcon} />{L.title}</span>
          <span className={styles.count}>{all.length}</span>
          <button type="button" className={styles.closeBtn} onClick={close} title={L.back} aria-label={L.back}>×</button>
        </div>
        <input
          className={styles.search}
          value={query}
          placeholder={L.viewSearch}
          aria-label={L.viewSearch}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.list}>
        {all.length === 0 && <p className={styles.empty}>{L.viewEmpty}</p>}
        {shown.map((h) => (
          <section key={`${h.noteId}:${h.hubId}`} className={styles.hub}>
            <button type="button" className={styles.hubName} onClick={() => openHub(h.noteId, h.hubId)}>
              {h.title || L.untitled}
            </button>
            <div className={styles.where}>{views[h.noteId as never] ? noteName(views[h.noteId as never], noteTags, { untitled: LABELS.mobileNotes.untitled }).full : h.noteTitle || LABELS.mobileNotes.untitled} · {L.linkCount(h.links.length)}</div>
            {h.take && <p className={styles.take}>{h.take}</p>}
            {RELATIONS.filter((r) => h.links.some((l) => l.relation === r)).map((r) => (
              <div key={r} className={styles.group}>
                <div className={styles.groupHeading}>{L.relations[r].heading}</div>
                <ul className={styles.links}>
                  {h.links.filter((l) => l.relation === r).map((l) => (
                    <li key={l.linkId}>
                      <button type="button" className={styles.link} onClick={() => openHubLink({ kind: l.kind, noteId: l.noteId, entryId: l.entryId, linkId: l.linkId })}>
                        {l.label || L.kinds[l.kind]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
