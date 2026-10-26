import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import { addIconPicture, useIconPictures } from '@/services/pictures';
import { EMOJI_GROUPS, EMOJI_SET, searchEmoji, type EmojiGroup } from '@/config/emojiSet';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { errorMessage, log } from '@/utils/log';
import { LABELS } from '@/config/labels';
import { ItemIcon } from './ItemIcon';
import { firstGrapheme, iconOfPicture } from './iconValue';
import styles from './IconPicker.module.css';

const L = LABELS.iconPicker;

// THE icon field (adopted 2026-10-26): a button showing the icon, opening the picker. Every place a
// person gives something an icon uses it (notebooks and tags, lists, Overviews, activity types,
// converters). The picker: emoji by group or by search, any emoji typed or pasted, "Your icons"
// (pictures made into icons before, to reuse), and a picture chosen, pasted or dropped, made into
// a 96 px icon in the picture library (services/pictures.ts addIconPicture). The value is a string
// (iconValue.ts); null takes the icon away.
export function IconField({ value, onChange, fallback = '🙂', label = L.label }: {
  value: string | null; onChange: (icon: string | null) => void; fallback?: string; label?: string;
}) {
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = anchor !== null;
  const toggle = () => {
    if (open) { setAnchor(null); return; }
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };
  return (
    <>
      <button ref={buttonRef} type="button" className={styles.field} onClick={toggle} aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={label}>
        <ItemIcon icon={value} fallback={fallback} className={value ? styles.fieldIcon : `${styles.fieldIcon} ${styles.fieldEmpty}`} />
      </button>
      {open && (
        <IconPicker anchor={anchor} toggleRef={buttonRef} current={value}
          onPick={(icon) => { onChange(icon); setAnchor(null); buttonRef.current?.focus(); }}
          onClose={() => setAnchor(null)} />
      )}
    </>
  );
}

function IconPicker({ anchor, toggleRef, current, onPick, onClose }: {
  anchor: AnchorBox; toggleRef: React.RefObject<HTMLButtonElement | null>; current: string | null;
  onPick: (icon: string | null) => void; onClose: () => void;
}) {
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, { gap: 4 });
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<EmojiGroup>(EMOJI_GROUPS[0]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const icons = useIconPictures();

  useEscapeClose(onClose);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || toggleRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, toggleRef, onClose]);

  async function takePicture(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      onPick(iconOfPicture(await addIconPicture(file)));
    } catch (e) {
      log.error('iconPicker', 'could not make the icon', e);
      await alertDialog(L.failed(errorMessage(e)));
    } finally {
      setBusy(false);
    }
  }

  // The search box: a typed or pasted emoji is the icon; words search the emoji's names.
  const typed = firstGrapheme(query);
  const isEmoji = !!typed && /\p{Extended_Pictographic}/u.test(typed);
  const found = query.trim() && !isEmoji ? searchEmoji(query) : null;
  const shown = found ?? EMOJI_SET[group];

  return createPortal(
    <div
      ref={ref} className={styles.panel} style={style} role="dialog" aria-label={L.title}
      onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void takePicture(f); } }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); void takePicture(e.dataTransfer.files[0]); }}
    >
      <input
        className={styles.search} value={query} autoFocus placeholder={L.search} aria-label={L.search}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (isEmoji && typed) onPick(typed);
          else if (found?.[0]) onPick(found[0].emoji);
        }}
      />
      {isEmoji && typed && <button type="button" className={styles.useTyped} onClick={() => onPick(typed)}>{L.pickTyped(typed)}</button>}
      {!found && (
        <div className={styles.groups} role="tablist" aria-label={L.title}>
          {EMOJI_GROUPS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={group === k} className={`${styles.groupTab} ${group === k ? styles.groupOn : ''}`} onClick={() => setGroup(k)} title={L.groups[k]}>
              {EMOJI_SET[k][0].emoji}
            </button>
          ))}
        </div>
      )}
      <div className={styles.grid}>
        {shown.map((e) => (
          <button key={e.emoji} type="button" className={`${styles.emoji} ${current === e.emoji ? styles.emojiOn : ''}`} onClick={() => onPick(e.emoji)} title={e.words} aria-label={e.words.split(' ')[0]}>
            {e.emoji}
          </button>
        ))}
        {found && !found.length && <p className={styles.none}>{L.noMatch}</p>}
      </div>
      {icons.length > 0 && (
        <>
          <h4 className={styles.heading}>{L.yours}</h4>
          <div className={styles.grid}>
            {icons.map((p) => (
              <button key={p.id} type="button" className={`${styles.emoji} ${current === iconOfPicture(p.id) ? styles.emojiOn : ''}`} onClick={() => onPick(iconOfPicture(p.id))} aria-label={L.yourIcon}>
                <ItemIcon icon={iconOfPicture(p.id)} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className={styles.foot}>
        <button type="button" className={styles.link} onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? L.making : L.upload}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void takePicture(e.target.files?.[0])} />
        {current && <button type="button" className={`${styles.link} ${styles.danger}`} onClick={() => onPick(null)}>{L.remove}</button>}
      </div>
    </div>,
    document.body,
  );
}
