import { useRef } from 'react';
import { ImageIcon, PasteIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import { pictureFromClipboard } from './pictureInput';
import styles from './PictureInput.module.css';

// The two ways to give a picture by button, side by side (as Word's Insert › Pictures offers "This
// device" beside the others): a file, or the clipboard. Paste and drop are usePictureTarget.
export function PictureAddButtons({ onFile, multiple, uploadLabel = LABELS.pictureInput.upload, blocked, className }: {
  onFile: (file: File) => void;
  multiple?: boolean;   // several files chosen at once (a field of pictures), each given to onFile
  uploadLabel?: string;
  blocked?: string;     // the place's wording for a clipboard the browser won't let be read
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`${styles.buttons} ${className ?? ''}`}>
      <button type="button" className={styles.button} onClick={() => fileRef.current?.click()}>
        <ImageIcon className={styles.icon} /> {uploadLabel}
      </button>
      <button type="button" className={styles.button} onClick={() => void pictureFromClipboard(blocked).then((f) => { if (f) onFile(f); })}>
        <PasteIcon className={styles.icon} /> {LABELS.pictureInput.fromClipboard}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; files.forEach(onFile); }}
      />
    </div>
  );
}
