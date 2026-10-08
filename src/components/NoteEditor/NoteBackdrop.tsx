import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '@/store/settingsStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { ImageIcon } from '@/components/Icons';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { compressImageBlob } from '@/utils/imageCompress';
import { LABELS } from '@/config/labels';
import { NOTE_BACKDROP_PRESETS, noteBackdropLabel } from '@/config/noteBackdrops';
import styles from './NoteBackdrop.module.css';

// The room below the end of a note (80% of the visible height, so the last lines can be brought
// up to mid-screen): plain grey by default, or a preset or the user's own picture
// (settingsStore.noteBackdrop, one choice for every note). Hovering it shows a button in its
// middle that opens the picker; on touch the button is always shown.

export function NoteBackdrop() {
  const backdrop = useSettingsStore((s) => s.noteBackdrop);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  return (
    <div
      className={styles.area}
      data-backdrop={backdrop?.kind === 'preset' ? backdrop.id : undefined}
      style={backdrop?.kind === 'image' ? { backgroundImage: `url("${backdrop.src}")` } : undefined}
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
      {anchor && <BackdropPicker anchor={anchor} onClose={() => setAnchor(null)} />}
    </div>
  );
}

function BackdropPicker({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const backdrop = useSettingsStore((s) => s.noteBackdrop);
  const setBackdrop = useSettingsStore((s) => s.setNoteBackdrop);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEscapeClose(onClose);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  async function upload(file: File) {
    try {
      setBackdrop({ kind: 'image', src: await compressImageBlob(file) });
      onClose();
    } catch {
      void alertDialog(LABELS.noteBackdrop.unusable);
    }
  }

  const PANEL_W = 300;
  const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - PANEL_W / 2, window.innerWidth - PANEL_W - 8));
  const bottom = Math.max(8, window.innerHeight - anchor.top + 8);

  return createPortal(
    <div ref={panelRef} className={styles.panel} style={{ left, bottom }} role="dialog" aria-label={LABELS.noteBackdrop.title}>
      <div className={styles.heading}>{LABELS.noteBackdrop.title}</div>
      <div className={styles.grid}>
        <Swatch label={LABELS.noteBackdrop.plain} selected={backdrop === null} onPick={() => setBackdrop(null)} />
        {NOTE_BACKDROP_PRESETS.map((id) => (
          <Swatch
            key={id}
            preset={id}
            label={noteBackdropLabel(id)}
            selected={backdrop?.kind === 'preset' && backdrop.id === id}
            onPick={() => setBackdrop({ kind: 'preset', id })}
          />
        ))}
        {backdrop?.kind === 'image' && (
          <Swatch image={backdrop.src} label={LABELS.noteBackdrop.yours} selected onPick={() => {}} />
        )}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => fileRef.current?.click()}>
          <ImageIcon className={styles.actionIcon} /> {LABELS.noteBackdrop.upload}
        </button>
        {backdrop?.kind === 'image' && (
          <button type="button" className={styles.action} onClick={() => setBackdrop(null)}>{LABELS.noteBackdrop.remove}</button>
        )}
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

function Swatch({ preset, image, label, selected, onPick }: { preset?: string; image?: string; label: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.swatch} ${selected ? styles.swatchSel : ''}`}
      onClick={onPick}
      title={label}
      aria-label={label}
      aria-pressed={selected}
    >
      <span
        className={styles.swatchFill}
        data-backdrop={preset}
        style={image ? { backgroundImage: `url("${image}")` } : undefined}
      />
      <span className={styles.swatchLabel}>{label}</span>
    </button>
  );
}
