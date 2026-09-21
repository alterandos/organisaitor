import { useState } from 'react';
import styles from './LinksField.module.css';

interface Props {
  links:    string[];
  onChange: (next: string[]) => void;
}

// The links list every item pane shows (Task, Calendar event, Calendar reminder): each link is
// clickable, editable and removable, and a new one is added from the input below. Rendered inside
// the pane's own labelled `.field` wrapper. Links typed into an item's notes reach this list via
// `mergeNewLinks` (utils/links.ts) in the store's update action, not here.
export function LinksField({ links, onChange }: Props) {
  const [linkInput,      setLinkInput]      = useState('');
  const [editingLinkIdx, setEditingLinkIdx] = useState<number | null>(null);
  const [editingLinkVal, setEditingLinkVal] = useState('');

  const addLink = () => {
    const url = linkInput.trim();
    if (!url) return;
    onChange([...links, url]);
    setLinkInput('');
  };

  const deleteLink = (idx: number) => onChange(links.filter((_, i) => i !== idx));

  const startEditLink = (idx: number) => {
    setEditingLinkIdx(idx);
    setEditingLinkVal(links[idx]);
  };

  const commitEditLink = (idx: number) => {
    const url = editingLinkVal.trim();
    if (url) {
      const next = [...links];
      next[idx] = url;
      onChange(next);
    }
    setEditingLinkIdx(null);
  };

  return (
    <>
      {links.map((url, idx) => (
        <div key={idx} className={styles.linkRow}>
          {editingLinkIdx === idx ? (
            <input
              className={styles.linkEditInput}
              value={editingLinkVal}
              autoFocus
              onChange={(e) => setEditingLinkVal(e.target.value)}
              onBlur={() => commitEditLink(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEditLink(idx); }
                if (e.key === 'Escape') { e.stopPropagation(); setEditingLinkIdx(null); }
              }}
            />
          ) : (
            <a
              href={url.startsWith('http') ? url : `https://${url}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkAnchor}
              onClick={(e) => e.stopPropagation()}
            >
              {url}
            </a>
          )}
          <button
            className={styles.linkIconBtn}
            onClick={() => startEditLink(idx)}
            aria-label="Edit link"
            title="Edit"
          >✎</button>
          <button
            className={`${styles.linkIconBtn} ${styles.linkDeleteBtn}`}
            onClick={() => deleteLink(idx)}
            aria-label="Delete link"
            title="Delete"
          >×</button>
        </div>
      ))}
      <div className={styles.linkAdd}>
        <input
          className={styles.linkInput}
          placeholder="https://…"
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
          onBlur={addLink}
        />
        <button
          type="button"
          className={styles.linkAddBtn}
          onClick={addLink}
          disabled={!linkInput.trim()}
        >+</button>
      </div>
    </>
  );
}
