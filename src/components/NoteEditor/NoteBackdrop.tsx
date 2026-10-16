import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '@/store/settingsStore';
import { useNoteStore } from '@/store/noteStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { ImageIcon } from '@/components/Icons';
import { alertDialog, choiceDialog, confirmDelete, confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';
import { NOTE_BACKDROP_PRESETS, noteBackdropLabel, type NoteBackdrop as AppBackdrop } from '@/config/noteBackdrops';
import type { Note, NoteBackdropChoice, NoteTag } from '@/types/notes';
import type { Picture } from '@/types/pictures';
import {
  addPicture, deletePictureEverywhere, pictureUses, samePicture, setBackdrop, usePictureLibrary, usePictureSrc,
  type BackdropTarget,
} from '@/services/pictures';
import {
  backdropPictureId, noteNotebookId, resolveNoteBackdrop, resolveNotebookFallback, type ShownBackdrop,
} from '@/utils/noteBackdrop';
import { errorMessage } from '@/utils/log';
import { useFloatingPlacement } from '@/utils/floatingPlacement';
import styles from './NoteBackdrop.module.css';

// The room below the end of a note (80% of the visible height, so the last lines can be brought
// up to mid-screen): the note's own backdrop, else its notebook's, else the app-wide one
// (utils/noteBackdrop.ts). Hovering it shows a button in its middle that opens the picker; on
// touch the button is always shown. Pictures come from the picture library (services/pictures.ts).

// The fill for one backdrop: a preset's CSS, or a picture.
function useFill(b: ShownBackdrop | null): { preset?: string; src?: string } {
  const picSrc = usePictureSrc(backdropPictureId(b));
  if (!b) return {};
  if (b.kind === 'preset') return { preset: b.id };
  if (b.kind === 'image') return { src: b.src };
  if (b.kind === 'picture') return picSrc ? { src: picSrc } : {};
  return {};
}

export function NoteBackdrop({ note }: { note: Note | null }) {
  const noteTags = useNoteStore((s) => s.noteTags);
  const appWide = useSettingsStore((s) => s.noteBackdrop);
  const { backdrop } = resolveNoteBackdrop(note, noteTags, appWide);
  const fill = useFill(backdrop);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  return (
    <div
      className={styles.area}
      data-backdrop={fill.preset}
      style={fill.src ? { backgroundImage: `url("${fill.src}")` } : undefined}
    >
      <button
        type="button"
        className={`${styles.change} ${anchor ? styles.changeOpen : ''}`}
        title={LABELS.noteBackdrop.change}
        aria-label={LABELS.noteBackdrop.change}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
      >
        <ImageIcon className={styles.changeIcon} />
      </button>
      {anchor && <BackdropPicker anchor={anchor} note={note} onClose={() => setAnchor(null)} />}
    </div>
  );
}

// "Background below the note" in a note's Edit details or a notebook's edit modal: what it is now,
// and a button that opens the same picker for just that note or notebook. Applies at once.
export function BackdropField({ note, notebook }: { note?: Note; notebook?: NoteTag }) {
  const noteTags = useNoteStore((s) => s.noteTags);
  const appWide = useSettingsStore((s) => s.noteBackdrop);
  const live = useNoteStore((s) => (note ? s.notes[note.id] : undefined));
  const liveTag = notebook ? noteTags[notebook.id] : undefined;
  const shown = liveTag
    ? (liveTag.backdrop ?? resolveNotebookFallback(liveTag, noteTags, appWide))
    : resolveNoteBackdrop(live ?? null, noteTags, appWide).backdrop;
  const fill = useFill(shown);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const label = notebook ? LABELS.noteBackdrop.fieldNotebook : LABELS.noteBackdrop.field;

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <button
        type="button"
        className={styles.fieldButton}
        aria-label={label}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
      >
        <span className={styles.fieldFill} data-backdrop={fill.preset} style={fill.src ? { backgroundImage: `url("${fill.src}")` } : undefined} />
        <ImageIcon className={styles.actionIcon} />
      </button>
      <span className={styles.fieldHint}>{LABELS.noteBackdrop.fieldHint}</span>
      {anchor && (
        <BackdropPicker
          anchor={anchor}
          note={live ?? null}
          notebook={liveTag}
          only
          onClose={() => setAnchor(null)}
        />
      )}
    </div>
  );
}

interface Scope { target: BackdropTarget; label: string; where: string }

function BackdropPicker({ anchor, note, notebook, only, onClose }: {
  anchor: DOMRect; note: Note | null; notebook?: NoteTag; only?: boolean; onClose: () => void;
}) {
  const noteTags = useNoteStore((s) => s.noteTags);
  const rawNote = useNoteStore((s) => (note ? s.notes[note.id] : undefined));
  const appWide = useSettingsStore((s) => s.noteBackdrop);
  const { ref: panelRef, style: place } = useFloatingPlacement<HTMLDivElement>(anchor, { align: 'center' });
  const fileRef = useRef<HTMLInputElement>(null);
  useEscapeClose(onClose);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [onClose, panelRef]);

  const L = LABELS.noteBackdrop;
  const noteBookId = rawNote ? noteNotebookId(rawNote, noteTags) : null;
  const noteBook = noteBookId ? noteTags[noteBookId] : undefined;
  const scopes: Scope[] = [];
  if (notebook) scopes.push({ target: { kind: 'notebook', id: notebook.id }, label: L.notebook(notebook.name), where: L.whereNotebook(notebook.name) });
  else {
    if (rawNote) scopes.push({ target: { kind: 'note', id: rawNote.id }, label: L.thisNote, where: L.whereNote });
    if (!only && noteBook) scopes.push({ target: { kind: 'notebook', id: noteBook.id }, label: L.notebook(noteBook.name), where: L.whereNotebook(noteBook.name) });
    if (!only || !rawNote) scopes.push({ target: { kind: 'app' }, label: L.allNotes, where: L.whereAll });
  }
  const [scopeIndex, setScopeIndex] = useState(0);
  const scope = scopes[Math.min(scopeIndex, scopes.length - 1)];
  const target = scope.target;

  // What the chosen scope has now (null: takes it from further up), and what "further up" is.
  const scopeTag = target.kind === 'notebook' ? noteTags[target.id] : undefined;
  const current: NoteBackdropChoice | AppBackdrop | null =
    target.kind === 'note' ? (rawNote?.backdrop ?? null)
    : target.kind === 'notebook' ? (scopeTag?.backdrop ?? null)
    : (appWide ?? { kind: 'plain' });
  const fallback: ShownBackdrop | null =
    target.kind === 'note' && rawNote ? resolveNoteBackdrop({ tagIds: rawNote.tagIds }, noteTags, appWide).backdrop
    : scopeTag ? resolveNotebookFallback(scopeTag, noteTags, appWide)
    : null;
  const inheritLabel = target.kind === 'note'
    ? (noteBook ? L.sameAsNotebook : L.sameAsAll)
    : (scopeTag?.parentTagId ? L.sameAsParent : L.sameAsAll);

  const encrypted = target.kind === 'note' && !!rawNote?.isEncrypted;
  const library = usePictureLibrary(encrypted);
  const isCurrentPicture = (p: Picture) => current?.kind === 'picture' && samePicture(current.pictureId, p.id);

  const choose = (c: NoteBackdropChoice | null) => {
    setBackdrop(target, c).catch((err) => void alertDialog(errorMessage(err)));
  };

  async function upload(file: File) {
    try {
      const id = await addPicture(file, { encrypted, origin: 'backdrop' });
      await setBackdrop(target, { kind: 'picture', pictureId: id });
    } catch (err) {
      void alertDialog(/locked/i.test(errorMessage(err)) ? L.locked : L.unusable);
    }
  }

  async function remove(p: Picture) {
    const uses = pictureUses(p.id);
    if (uses.length === 0) {
      if (await confirmDelete('picture', '', L.usedNowhere)) deletePictureEverywhere(p.id);
      return;
    }
    const here = isCurrentPicture(p);
    if (here) {
      const r = await choiceDialog({
        title: L.deleteTitle, message: L.usedIn(uses.length),
        confirmLabel: L.justFrom(scope.where), alternateLabel: L.everywhere,
      });
      if (r === 'confirm') choose(null);
      else if (r === 'alternate') deletePictureEverywhere(p.id);
      return;
    }
    if (await confirmDialog({ title: L.deleteTitle, message: L.usedIn(uses.length), confirmLabel: L.everywhere, destructive: true, irreversible: true })) {
      deletePictureEverywhere(p.id);
    }
  }

  return createPortal(
    <div ref={panelRef} className={styles.panel} style={place} role="dialog" aria-label={L.title}>
      <div className={styles.heading}>{L.title}</div>
      {scopes.length > 1 && (
        <div className={styles.scopes} role="radiogroup" aria-label={L.applyTo}>
          {scopes.map((s, i) => (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={s === scope}
              className={`${styles.scope} ${s === scope ? styles.scopeSel : ''}`}
              onClick={() => setScopeIndex(i)}
            >{s.label}</button>
          ))}
        </div>
      )}
      <div className={styles.grid}>
        {fallback && <Swatch backdrop={fallback} label={inheritLabel} selected={current === null} onPick={() => choose(null)} />}
        <Swatch label={L.plain} selected={current?.kind === 'plain'} onPick={() => choose({ kind: 'plain' })} />
        {NOTE_BACKDROP_PRESETS.map((id) => (
          <Swatch
            key={id}
            backdrop={{ kind: 'preset', id }}
            label={noteBackdropLabel(id)}
            selected={current?.kind === 'preset' && current.id === id}
            onPick={() => choose({ kind: 'preset', id })}
          />
        ))}
      </div>
      {library.length > 0 && (
        <>
          <div className={`${styles.heading} ${styles.subheading}`}>{L.pictures}</div>
          <div className={styles.grid}>
            {library.map((p) => (
              <div key={p.id} className={styles.pictureCell}>
                <Swatch
                  backdrop={{ kind: 'picture', pictureId: p.id }}
                  label=""
                  selected={isCurrentPicture(p)}
                  onPick={() => choose({ kind: 'picture', pictureId: p.id })}
                />
                <button
                  type="button"
                  className={styles.deletePicture}
                  title={L.deletePicture}
                  aria-label={L.deletePicture}
                  onClick={() => void remove(p)}
                >×</button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => fileRef.current?.click()}>
          <ImageIcon className={styles.actionIcon} /> {L.upload}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }}
      />
    </div>,
    document.body,
  );
}

function Swatch({ backdrop, label, selected, onPick }: { backdrop?: ShownBackdrop; label: string; selected: boolean; onPick: () => void }) {
  const fill = useFill(backdrop ?? null);
  return (
    <button
      type="button"
      className={`${styles.swatch} ${selected ? styles.swatchSel : ''}`}
      onClick={onPick}
      title={label || undefined}
      aria-label={label || LABELS.noteBackdrop.pictures}
      aria-pressed={selected}
    >
      <span
        className={styles.swatchFill}
        data-backdrop={fill.preset}
        style={fill.src ? { backgroundImage: `url("${fill.src}")` } : undefined}
      />
      {label && <span className={styles.swatchLabel}>{label}</span>}
    </button>
  );
}
