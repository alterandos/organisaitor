import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TrashIcon, CloseIcon } from '@/components/Icons';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { addPicture, usePictureSrc } from '@/services/pictures';
import { LABELS } from '@/config/labels';
import { errorMessage, log } from '@/utils/log';
import { PictureAddButtons } from './PictureAddButtons';
import { usePictureTarget } from './pictureInput';
import styles from './PictureInput.module.css';

const L = LABELS.pictureInput;

// The pictures put on an item (a calendar event's today; any item later): small squares in order,
// each opening larger; added by a button, from the clipboard, by Ctrl+V with the field focused, or
// dropped on it. Each is stored once in the picture library (origin 'item'); taking one off leaves
// it in the library, as taking a picture out of a note does.
export function PicturesField({ value, onChange, encrypted = false }: {
  value: string[];
  onChange: (ids: string[]) => void;
  encrypted?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  // The latest list, so several files added at once each go on the end.
  const latest = useRef(value);
  useEffect(() => { latest.current = value; }, [value]);
  async function add(file: File) {
    try {
      const id = await addPicture(file, { encrypted, origin: 'item' });
      if (!latest.current.includes(id)) { latest.current = [...latest.current, id]; onChange(latest.current); }
    } catch (e) {
      log.warn('pictureInput', 'could not add the picture', errorMessage(e));
      void alertDialog(L.unusable);
    }
  }
  const target = usePictureTarget((f) => void add(f));
  return (
    <div
      className={`${styles.field} ${target.dragging ? styles.dragging : ''}`}
      tabIndex={0}
      role="group"
      aria-label={`${L.field}: ${L.fieldHint}`}
      {...target.props}
    >
      {value.length > 0 && (
        <div className={styles.thumbs}>
          {value.map((id, i) => (
            <Thumb key={id} id={id} n={i + 1} onOpen={() => setOpen(i)} onRemove={() => onChange(value.filter((x) => x !== id))} />
          ))}
        </div>
      )}
      <PictureAddButtons onFile={(f) => void add(f)} multiple />
      {target.dragging && <div className={styles.dropHint}>{L.dropHere}</div>}
      {open !== null && value[open] && (
        <PictureViewer ids={value} at={open} onMove={setOpen} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function Thumb({ id, n, onOpen, onRemove }: { id: string; n: number; onOpen: () => void; onRemove: () => void }) {
  const src = usePictureSrc(id);
  return (
    <div className={styles.thumb}>
      <button type="button" className={styles.thumbOpen} onClick={onOpen} aria-label={L.open(n)} title={L.open(n)}>
        {src ? <img src={src} alt="" /> : <span className={styles.thumbMissing}>🔒</span>}
      </button>
      <button type="button" className={styles.thumbRemove} onClick={onRemove} aria-label={L.remove(n)} title={L.remove(n)}>
        <TrashIcon width="1em" height="1em" />
      </button>
    </div>
  );
}

// One picture, as large as the window allows; ← / → step through the item's others.
function PictureViewer({ ids, at, onMove, onClose }: { ids: string[]; at: number; onMove: (i: number) => void; onClose: () => void }) {
  const src = usePictureSrc(ids[at]);
  useEscapeClose(onClose);
  const step = (d: number) => onMove((at + d + ids.length) % ids.length);
  return createPortal(
    <div
      className={styles.viewer}
      role="dialog"
      aria-label={L.viewer}
      tabIndex={-1}
      ref={(el) => el?.focus()}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        if (ids.length < 2) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      }}
    >
      {src && <img className={styles.viewerImg} src={src} alt="" />}
      <button type="button" className={styles.viewerClose} onClick={onClose} aria-label={L.close}><CloseIcon /></button>
      {ids.length > 1 && (
        <>
          <button type="button" className={`${styles.viewerStep} ${styles.viewerPrev}`} onClick={() => step(-1)} aria-label={L.previous}>‹</button>
          <button type="button" className={`${styles.viewerStep} ${styles.viewerNext}`} onClick={() => step(1)} aria-label={L.next}>›</button>
        </>
      )}
    </div>,
    document.body,
  );
}
