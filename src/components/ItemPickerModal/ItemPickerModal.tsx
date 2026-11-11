import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import { CloseIcon } from '@/components/Icons';
import styles from './ItemPickerModal.module.css';

// THE picker dialog (adopted 2026-11-10, docs/agent-tasks/08-linking-consolidation.md Task 2):
// every "link a …" and "choose a …" search dialog is this shell plus its kind's configuration
// (LinkPickerModal for the linkable kinds of services/linkTargets.ts, NotePickerModal for notes
// with its tab-aware ranking, HubPickerModal, InboxPickerModal, NoteLinkPicker's passages). It
// holds what used to be copied six times: the portal (it opens from forms and panes that scroll,
// and an in-place dropdown there changed the scroll height under the pointer), the overlay closed
// by a press on it, the search box, the list with its section labels ("Suggested from …",
// "Recent"), ↑ / ↓, Enter, Ctrl+Enter in the capture phase (the pane or form underneath binds
// Ctrl+Enter to its own action and must not also answer while this is on top), Escape through
// useEscapeClose, and keys kept from App's single-key hotkeys behind it.
//
// The caller holds the search text and ranks the rows (utils/suggestRank.ts, through rankPicker
// below, or its own), so the ranking is memoised where its data is. Slots: `above` (a row of
// choices, an option), `step` (a second step in place of the list: a series' dates), `afterList`.
// Picking doesn't close it: the caller does (most close; a dates step stays open).

export interface PickerSection { at: number; label: string }

export interface PickerRow {
  title:  ReactNode;
  meta?:  ReactNode;
  // Top right, small: a date.
  aside?: ReactNode;
  // Below, two lines at most: a preview.
  extra?: ReactNode;
  // Beside the row, outside its button (a note's tabs).
  after?: ReactNode;
}

interface Props<T> {
  label:    string;
  heading:  ReactNode;
  // A back arrow before the heading (a second step); Escape goes back too.
  onBack?:  () => void;
  query:    string;
  onQuery:  (q: string) => void;
  search:   string;
  rows:     readonly T[];
  sections?: readonly PickerSection[];
  keyOf:    (row: T) => string;
  render:   (row: T, active: boolean) => PickerRow;
  onPick:   (row: T) => void;
  onClose:  () => void;
  empty?:   ReactNode;
  above?:   ReactNode;
  // In place of the list; Enter and Ctrl+Enter call `onStepSubmit` while it shows.
  step?:    ReactNode;
  onStepSubmit?: () => void;
  afterList?: ReactNode;
  footer:   ReactNode;
  // A key in the search box the kind handles itself (the note picker's Tab between tabs): true if it did.
  onSearchKey?: (e: React.KeyboardEvent<HTMLInputElement>, highlighted: T | undefined) => boolean;
}

export function ItemPickerModal<T>({
  label, heading, onBack, query, onQuery, search, rows, sections = [], keyOf, render, onPick, onClose,
  empty, above, step, onStepSubmit, afterList, footer, onSearchKey,
}: Props<T>) {
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEscapeClose(onBack ?? onClose);

  const last = Math.max(0, rows.length - 1);
  if (highlight > last) setHighlight(last);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlight, rows]);

  const submit = () => {
    if (step) { onStepSubmit?.(); return; }
    const row = rows[highlight];
    if (row !== undefined) onPick(row);
  };
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        submitRef.current();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onSearchKey?.(e, rows[highlight])) return;
    if (e.key === 'ArrowDown' && !step) { e.preventDefault(); setHighlight((i) => Math.min(i + 1, last)); }
    else if (e.key === 'ArrowUp' && !step) { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); submitRef.current(); }
  };

  const labelAt = new Map(sections.map((s) => [s.at, s.label]));

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      // Keeps App's global single-key hotkeys from firing behind the picker when a result has focus.
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      <div className={styles.modal} role="dialog" aria-label={label}>
        <div className={styles.header}>
          <span className={styles.headingText}>
            {onBack && <button type="button" className={styles.back} onClick={onBack} aria-label={LABELS.pickers.back}>‹</button>}
            <span className={styles.title}>{heading}</span>
          </span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={LABELS.pickers.close}><CloseIcon /></button>
        </div>

        <input
          autoFocus
          className={styles.search}
          placeholder={search}
          aria-label={search}
          value={query}
          onChange={(e) => { onQuery(e.target.value); setHighlight(0); }}
          onKeyDown={onKeyDown}
        />

        {above}

        {step ?? (
          <div className={styles.results} ref={listRef} role="listbox" aria-label={label}>
            {rows.length === 0 && empty && <div className={styles.empty}>{empty}</div>}
            {rows.map((row, i) => {
              const active = i === highlight;
              const r = render(row, active);
              const section = labelAt.get(i);
              return (
                <Fragment key={keyOf(row)}>
                  {section && <div className={styles.sectionLabel}>{section}</div>}
                  <div
                    data-active={active || undefined}
                    className={`${styles.result} ${active ? styles.resultActive : ''}`}
                    onMouseEnter={() => setHighlight(i)}
                    role="option"
                    aria-selected={active}
                  >
                    <button type="button" className={styles.resultMain} onClick={() => onPick(row)}>
                      <span className={styles.resultTop}>
                        <span className={styles.resultTitle}>{r.title}</span>
                        {r.aside && <span className={styles.resultDate}>{r.aside}</span>}
                      </span>
                      {r.meta && <span className={styles.resultPath}>{r.meta}</span>}
                      {r.extra && <span className={styles.resultSnippet}>{r.extra}</span>}
                    </button>
                    {r.after}
                  </div>
                </Fragment>
              );
            })}
            {afterList}
          </div>
        )}

        <div className={styles.footer}>{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

// A row of choices above the list, as pills (how a link relates; a hub's relation).
export function PickerChoices<V extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: V; label: string; hint?: string }[]; value: V; onChange: (v: V) => void;
}) {
  return (
    <div className={styles.choices} role="radiogroup" aria-label={label}>
      <span className={styles.choicesLabel} aria-hidden="true">{label}</span>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.hint}
          className={`${styles.choice} ${value === o.value ? styles.choiceOn : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
