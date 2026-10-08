import { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { answerReview, dueReviews, reviewItems, type ReviewItem } from '@/services/noteReview';
import { openNotePassage } from '@/services/notePassage';
import { nextReview, REVIEW_INTERVALS, type ReviewAnswer } from '../NoteEditor/extensions/Importance';
import { importanceLevel } from '../NoteEditor/extensions/importanceLevels';
import { formatDate, todayIso } from '@/utils/date';
import { LABELS } from '@/config/labels';
import styles from './ReviewView.module.css';

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

// Review later, one passage at a time: the passages marked "Review later" that are due today
// (services/noteReview.ts). "Got it" pushes the next review further out each time (1, 3, 7, 16,
// 35, 90 days); "Again" brings it back tomorrow; "Stop reviewing" takes it off the list. The
// list is taken when the view opens, so answering never reshuffles what's left.
export function ReviewView() {
  const close = useUIStore((s) => s.closeNotesReview);
  useEscapeClose(close);
  const today = todayIso();
  const [queue] = useState<ReviewItem[]>(() => dueReviews(today));
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Record<number, ReviewAnswer>>({});
  const L = LABELS.review;

  const item = queue[index];
  const answer = (a: ReviewAnswer) => {
    if (!item) return;
    answerReview(item, a, today);
    setDone((d) => ({ ...d, [index]: a }));
    setIndex((i) => i + 1);
  };

  const upcoming = item ? [] : reviewItems().filter((r) => r.reviewDue > today);
  const level = item ? importanceLevel(item.level) : null;
  const goodDays = item ? daysBetween(today, nextReview(item.reviewStep, 'good', today).due!) : REVIEW_INTERVALS[0];

  // The passage within its paragraph, the passage itself picked out.
  const context = item ? (() => {
    const at = item.context.indexOf(item.text);
    if (at < 0 || item.context === item.text) return null;
    return { before: item.context.slice(0, at), after: item.context.slice(at + item.text.length) };
  })() : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>🔁 {L.title}</span>
        {queue.length > 0 && <span className={styles.progress}>{L.progress(Math.min(index + 1, queue.length), queue.length)}</span>}
        <button type="button" className={styles.closeBtn} onClick={close} title={LABELS.glossary.back}>×</button>
      </div>
      {queue.length > 0 && (
        <div className={styles.bar} aria-hidden="true">
          {queue.map((_, i) => <span key={i} className={styles.barStep} data-state={done[i] ?? (i === index ? 'current' : 'todo')} />)}
        </div>
      )}

      <div className={styles.body}>
        {item && level ? (
          <div className={styles.card} key={index} style={{ ['--level-color' as string]: level.color }}>
            <div className={styles.cardKicker}>
              <span>{level.icon} {level.label}</span>
              <button type="button" className={styles.source} onClick={() => openNotePassage(item.noteId, { mark: 'noteTag', attr: 'passageId', value: item.passageId })}>
                {L.from(item.noteTitle || LABELS.glossary.untitledNote)} ↗
              </button>
            </div>
            <blockquote className={styles.passage}>{item.text}</blockquote>
            {context && (
              <p className={styles.context}>
                {context.before}<mark className={styles.contextMark}>{item.text}</mark>{context.after}
              </p>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.again} onClick={() => answer('again')} title={L.againHint}>
                {L.again}<small>{L.againHint}</small>
              </button>
              <button type="button" className={styles.good} onClick={() => answer('good')} autoFocus>
                {L.good}<small>{L.goodHint(goodDays)}</small>
              </button>
            </div>
            <button type="button" className={styles.stop} onClick={() => answer('stop')}>{L.stop}</button>
          </div>
        ) : (
          <div className={styles.doneCard}>
            <div className={styles.doneIcon} aria-hidden="true">✓</div>
            <div className={styles.doneTitle}>{L.allDone}</div>
            <div className={styles.doneHint}>
              {upcoming.length > 0 ? L.upcoming(upcoming.length, formatDate(upcoming[0].reviewDue)) : L.allDoneHint}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
