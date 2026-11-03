import { useMemo, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useNoteViews } from '@/store/noteViews';
import { useWikiToday } from '@/services/todayFacts';
import { addInterestingFact, hasFact } from '@/services/interestingFacts';
import { firstSentences, notesOnThisDay, pickForDay } from '@/utils/todayFacts';
import { noteName } from '@/utils/notes';
import { openExternalLink } from '@/utils/links';
import { formatDate, todayIso } from '@/utils/date';
import { CloseIcon, OpenIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types/notes';
import styles from './TodayCard.module.css';

const L = LABELS.todayCard;
const F = LABELS.interestingFacts;

// The Today card (asked for by the user 2026-11-02): at the top of Endeavours and Overview, a fact
// (Wikipedia's featured article), a moment from this day in history, and the person's notes from this
// day in other years; each kind can be turned off in Settings, and the card hidden until tomorrow.
// A fact or moment can be kept in Interesting facts (services/interestingFacts.ts).
export function TodayCard() {
  const settings = useSettingsStore((s) => s.todayCard);
  const hiddenOn = useSettingsStore((s) => s.todayCardHiddenOn);
  const today = todayIso();
  const shown = settings.show && hiddenOn !== today;
  const wiki = useWikiToday(today, shown && (settings.fact || settings.history));
  const notes = useNoteViews();
  const noteTags = useNoteStore((s) => s.noteTags);
  useListStore((s) => s.listItems);   // "Kept" follows the list
  const [step, setStep] = useState(0);

  const pastNote = useMemo(() => {
    if (!settings.notes) return null;
    const found = notesOnThisDay(Object.values(notes), today)[0];
    const note = found ? notes[found.id as NoteId] : undefined;
    return note && found ? { id: note.id, years: found.years, name: noteName(note, noteTags, { untitled: LABELS.notePicker.untitled }).full } : null;
  }, [settings.notes, notes, noteTags, today]);

  if (!shown) return null;
  const featured = settings.fact ? wiki?.featured ?? null : null;
  const events = settings.history ? wiki?.onThisDay ?? [] : [];
  const event = events.length ? events[pickForDay(events.length, today, step)] : null;
  const failed = wiki === null && (settings.fact || settings.history);
  if (!featured && !event && !pastNote && !failed) return null;

  const factText = featured ? firstSentences(featured.text, 2) : '';
  // Kept as a Fact in the Glossary, in the Interesting facts list (services/interestingFacts.ts).
  const keep = (statement: string, url: string | null, title: string | null) => (
    hasFact(statement)
      ? <span className={styles.kept}>✓ {L.saved}</span>
      : <button type="button" className={styles.action} onClick={() => addInterestingFact({ statement, url, title, source: F.wikipedia })}>✨ {L.save}</button>
  );
  const readMore = (url: string | null) => url && (
    <button type="button" className={styles.action} onClick={() => void openExternalLink(url)}><OpenIcon aria-hidden="true" /> {L.readMore}</button>
  );

  return (
    <section className={styles.card} aria-label={L.label}>
      <header className={styles.head}>
        <span className={styles.heading}>{L.heading}</span>
        <span className={styles.date}>{formatDate(`${today}T00:00:00`)}</span>
        <button type="button" className={styles.hide} onClick={() => useSettingsStore.getState().setTodayCardHiddenOn(today)} aria-label={L.hide} title={L.hide}>
          <CloseIcon aria-hidden="true" />
        </button>
      </header>
      <div className={styles.items}>
        {featured && (
          <article className={styles.item}>
            <span className={styles.kind}>{L.fact}</span>
            <p className={styles.text}><strong>{featured.title}</strong>: {factText}</p>
            <div className={styles.actions}>{readMore(featured.url)}{keep(factText, featured.url, featured.title)}</div>
          </article>
        )}
        {event && (
          <article className={styles.item}>
            <span className={styles.kind}>{L.history(event.year)}</span>
            <p className={styles.text}>{event.text}</p>
            <div className={styles.actions}>
              {readMore(event.url)}
              {events.length > 1 && <button type="button" className={styles.action} onClick={() => setStep((n) => n + 1)}>{L.another}</button>}
              {keep(`${event.year}: ${event.text}`, event.url, event.title)}
            </div>
          </article>
        )}
        {pastNote && (
          <article className={styles.item}>
            <span className={styles.kind}>{L.notes(pastNote.years)}</span>
            <p className={styles.text}>{pastNote.name}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.action} onClick={() => { const ui = useUIStore.getState(); ui.setActiveView('notes'); ui.openNote(pastNote.id); }}>
                <OpenIcon aria-hidden="true" /> {L.openNote}
              </button>
            </div>
          </article>
        )}
        {failed && !featured && !event && <p className={styles.offline}>{L.offline}</p>}
      </div>
    </section>
  );
}
