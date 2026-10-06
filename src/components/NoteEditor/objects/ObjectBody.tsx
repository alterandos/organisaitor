import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { getOrderedEndeavours } from '@/utils/collections';
import { normalizeLinkUrl, openExternalLink } from '@/utils/links';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import type { ArtifactFlag } from './flags';
import { usePaneState } from './paneState';
import styles from './ObjectBody.module.css';

interface Props {
  // The start of the second heading line (WhenLine: date, time, options that are on, state).
  heading?:     ReactNode;
  // A click on the second heading line's empty space collapses the pane, as on the top bar.
  onToggle?:    () => void;
  notes:        string | null;
  links:        string[];
  collectionId: CollectionId | null;
  onNotes:      (notes: string | null) => void;
  onLinks:      (links: string[]) => void;
  onCollection: (id: CollectionId | null) => void;
  // A place (events): in the second heading line; a link opens from its ↗.
  place?:       { value: string | null; onChange: (value: string | null) => void };
  // The item's options; the ones that are off are offered greyed in the bottom bar.
  flags?:       ArtifactFlag[];
  // Kind-specific active things for the second heading line (a notification setting)…
  extra?:       ReactNode;
  // …and kind-specific things that are off, for the bottom bar ("Notify me").
  offExtra?:    ReactNode;
}

const looksLikeUrl = (s: string) => /^(https?:\/\/|www\.)\S+$/i.test(s.trim());

const hostOf = (url: string) => {
  try { return new URL(normalizeLinkUrl(url)).hostname.replace(/^www\./, ''); } catch { return url; }
};

type Menu = { kind: 'endeavour' } | { kind: 'flag'; flag: ArtifactFlag };

// The expanded pane under its top bar, in three bands (the user's layout, 2026-10-06):
//   second heading line — what's ON and about the item: when, options, place, Endeavour,
//                         notification, state; each a click away from being changed or removed
//   content             — the notes as text and the links as chips
//   bottom bar          — what's OFF or missing, greyed: a click adds it or turns it on
// Nothing is labelled (what each is should be obvious). Shared by every item kind; a kind's Body
// maps its own fields onto it (CalendarItemBody, EventBody).
export function ObjectBody({ heading, onToggle, notes, links, collectionId, onNotes, onLinks, onCollection, place, flags = [], extra, offExtra }: Props) {
  const L = LABELS.noteObjects.body;
  // Kept outside the component (paneState.ts), so a body ProseMirror builds again keeps them.
  const [notesDraft, setNotesDraft] = usePaneState<string | null>('notesDraft', null);   // null = not editing
  const [linkDraft, setLinkDraft] = usePaneState<string | null>('linkDraft', null);
  const [placeDraft, setPlaceDraft] = usePaneState<string | null>('placeDraft', null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const collections = useTaskStore((s) => s.collections);
  const endeavour = collectionId ? collections[collectionId] : undefined;
  const choices = getOrderedEndeavours(collections);

  useEscapeClose(() => setMenu(null), !!menu);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const saveNotes = () => {
    if (notesDraft === null) return;
    const next = notesDraft.trim() ? notesDraft : null;
    if (next !== notes) onNotes(next);
    setNotesDraft(null);
  };
  const addLink = () => {
    const url = linkDraft?.trim();
    if (url && !links.includes(normalizeLinkUrl(url))) onLinks([...links, normalizeLinkUrl(url)]);
    setLinkDraft(null);
  };
  const savePlace = () => {
    if (placeDraft === null || !place) return;
    const next = placeDraft.trim() || null;
    if (next !== place.value) place.onChange(next);
    setPlaceDraft(null);
  };
  // Enter saves, Esc puts it back — and neither reaches the pane or the editor around it.
  const inputKeys = (save: () => void, cancel: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); save(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  };
  const toggleMenu = (next: Menu) => setMenu((m) => (m && m.kind === next.kind ? null : next));
  const turnOn = (flag: ArtifactFlag) => (flag.choices ? toggleMenu({ kind: 'flag', flag }) : flag.toggle());

  const hasContent = notes !== null || notesDraft !== null || links.length > 0 || linkDraft !== null;

  return (
    <div className={styles.body}>
      <div className={styles.subheading} onClick={(e) => { if (e.target === e.currentTarget) onToggle?.(); }}>
        {heading}
        {place && (placeDraft !== null ? (
          <input
            className={styles.chipInput}
            value={placeDraft}
            autoFocus
            placeholder={L.placePlaceholder}
            onChange={(e) => setPlaceDraft(e.target.value)}
            onBlur={savePlace}
            onKeyDown={inputKeys(savePlace, () => setPlaceDraft(null))}
          />
        ) : place.value && (
          <span className={styles.place}>
            <button type="button" className={styles.placeText} title={L.editPlace} onClick={() => setPlaceDraft(place.value ?? '')}>
              📍 {looksLikeUrl(place.value) ? hostOf(place.value) : place.value}
            </button>
            {looksLikeUrl(place.value) && (
              <button type="button" className={styles.placeOpen} title={L.openPlace} onClick={() => { void openExternalLink(normalizeLinkUrl(place.value!)); }}>↗</button>
            )}
          </span>
        ))}
        {endeavour && (
          <button
            type="button"
            className={styles.endeavour}
            style={endeavour.color ? { '--chip-color': endeavour.color } as React.CSSProperties : undefined}
            title={L.changeEndeavour}
            onClick={() => toggleMenu({ kind: 'endeavour' })}
          >{endeavour.name}</button>
        )}
        {extra}
      </div>

      {hasContent && (
        <div className={styles.content}>
          {notesDraft !== null ? (
            <textarea
              className={styles.notesInput}
              value={notesDraft}
              autoFocus
              rows={Math.min(8, Math.max(2, notesDraft.split('\n').length))}
              placeholder={L.notesPlaceholder}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setNotesDraft(null); }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); saveNotes(); }
              }}
            />
          ) : notes ? (
            <div className={styles.notes} title={L.editNotes} onClick={() => setNotesDraft(notes)}>{notes}</div>
          ) : null}
          {(links.length > 0 || linkDraft !== null) && (
            <div className={styles.things}>
              {links.map((url) => (
                <span key={url} className={styles.link}>
                  <button type="button" className={styles.linkOpen} title={url} onClick={() => { void openExternalLink(normalizeLinkUrl(url)); }}>🔗 {hostOf(url)}</button>
                  <button type="button" className={styles.linkRemove} title={L.removeLink} onClick={() => onLinks(links.filter((l) => l !== url))}>×</button>
                </span>
              ))}
              {linkDraft !== null && (
                <input
                  className={styles.chipInput}
                  value={linkDraft}
                  autoFocus
                  placeholder={L.linkPlaceholder}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onBlur={addLink}
                  onKeyDown={inputKeys(addLink, () => setLinkDraft(null))}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className={styles.bottom}>
        {!notes && notesDraft === null && <button type="button" className={styles.ghost} onClick={() => setNotesDraft('')}>{L.addNotes}</button>}
        {linkDraft === null && <button type="button" className={styles.ghost} onClick={() => setLinkDraft('')}>{L.addLink}</button>}
        {place && !place.value && placeDraft === null && <button type="button" className={styles.ghost} onClick={() => setPlaceDraft('')}>{L.addPlace}</button>}
        {!endeavour && choices.length > 0 && (
          <button type="button" className={styles.ghost} onClick={() => toggleMenu({ kind: 'endeavour' })}>{L.addEndeavour}</button>
        )}
        {flags.filter((f) => !f.on).map((f) => (
          <button key={f.id} type="button" className={`${styles.ghost} ${styles.offOption}`} title={L.turnOn(f.label)} onClick={() => turnOn(f)}>
            <span className={styles.offIcon}>{f.icon}</span> {f.label}
          </button>
        ))}
        {offExtra}
      </div>

      {menu && (
        <div ref={menuRef} className={styles.menu} role="listbox">
          {menu.kind === 'flag' ? (
            <>
              <div className={styles.menuTitle}>{L.repeatHow}</div>
              {menu.flag.choices!.map((c) => (
                <button key={c.id} type="button" role="option" aria-selected={c.on} className={styles.menuItem} onClick={() => { c.run(); setMenu(null); }}>{c.label}</button>
              ))}
            </>
          ) : (
            <>
              {choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={c.id === collectionId}
                  className={`${styles.menuItem} ${c.id === collectionId ? styles.menuItemOn : ''}`}
                  onClick={() => { onCollection(c.id); setMenu(null); }}
                >
                  <span className={styles.menuDot} style={c.color ? { background: c.color } : undefined} />
                  {c.name}
                </button>
              ))}
              {endeavour && (
                <button type="button" className={styles.menuItem} onClick={() => { onCollection(null); setMenu(null); }}>{LABELS.noCollection}</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
