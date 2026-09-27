import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import styles from './MarkdownLinkPrompt.module.css';

interface Props {
  anchorRect: DOMRect;
  initialText: string;
  onConfirm: (url: string, text: string) => void;
  onCancel: () => void;
}

// The Ctrl+L "insert a link" prompt for plain-<textarea> notes fields (Task/Calendar — see
// hooks/useMarkdownHotkeys.ts and "Light rich text" in Implemented features). Mirrors the Notes
// editor's own "New link" pane (NoteEditor.tsx) visually and by keyboard (Enter in either field
// confirms, Escape cancels), but text+URL are always both editable here — a plain textarea has
// no rich selection to anchor a Notes-style "insert at caret" flow to, so both fields are
// always shown rather than only when there's no selection.
export function MarkdownLinkPrompt({ anchorRect, initialText, onConfirm, onCancel }: Props) {
  const [text, setText] = useState(initialText);
  const [url,  setUrl]   = useState('');

  useEscapeClose(onCancel);

  const confirm = () => { if (url.trim()) onConfirm(url.trim(), text.trim() || url.trim()); };

  return createPortal(
    <div
      className={styles.pane}
      style={{ top: anchorRect.bottom + 4, left: anchorRect.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus={!initialText}
        className={styles.field}
        placeholder="Text to display"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }}
      />
      <input
        autoFocus={!!initialText}
        className={styles.field}
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }}
      />
      <button type="button" className={styles.insertBtn} disabled={!url.trim()} onClick={confirm}>
        Insert link
      </button>
    </div>,
    document.body,
  );
}
