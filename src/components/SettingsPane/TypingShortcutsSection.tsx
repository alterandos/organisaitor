import { useState } from 'react';
import { LABELS } from '@/config/labels';
import { useSettingsStore } from '@/store/settingsStore';
import { textShortcutProblem, SHORTCUT_TEXT_MAX, SHORTCUT_TYPED_MAX, type TextShortcut } from '@/specialChars/charSets';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { TrashIcon } from '@/components/Icons';
import styles from './SettingsPane.module.css';

// Settings → Typing shortcuts: the person's own (`govt` → government), used in every text field
// and the note editor (specialChars/charSets.ts findUserShortcut). The whole section is
// `data-no-shortcuts`, so writing a shortcut here never sets one off.
export function TypingShortcutsSection() {
  const L = LABELS.typingShortcuts;
  const shortcuts = useSettingsStore((s) => s.textShortcuts);
  const add = useSettingsStore((s) => s.addTextShortcut);
  const [typed, setTyped] = useState('');
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = typed.trim();
    const p = textShortcutProblem(t, text, shortcuts);
    if (p) { setProblem(L.problems[p]); return; }
    add(t, text.trim());
    setTyped('');
    setText('');
    setProblem(null);
  }

  return (
    <section className={styles.section} data-no-shortcuts>
      <h3 className={styles.sectionLabel}>{L.section}</h3>
      <p className={styles.settingDesc}>{L.desc}</p>
      <ul className={styles.shortcutList}>
        {shortcuts.length === 0 && <li className={styles.settingDesc}>{L.none}</li>}
        {shortcuts.map((s) => <ShortcutRow key={s.id} shortcut={s} all={shortcuts} />)}
      </ul>
      <form className={styles.shortcutRow} onSubmit={submit}>
        <input
          className={styles.shortcutTyped}
          value={typed}
          maxLength={SHORTCUT_TYPED_MAX}
          placeholder={L.typedHint}
          aria-label={L.typed}
          onChange={(e) => { setTyped(e.target.value); setProblem(null); }}
        />
        <span className={styles.shortcutArrow} aria-hidden="true">→</span>
        <input
          className={styles.shortcutText}
          value={text}
          maxLength={SHORTCUT_TEXT_MAX}
          placeholder={L.textHint}
          aria-label={L.text}
          onChange={(e) => { setText(e.target.value); setProblem(null); }}
        />
        <button type="submit" className={styles.shortcutAdd}>{L.add}</button>
      </form>
      {problem && <p className={styles.shortcutProblem} role="alert">{problem}</p>}
    </section>
  );
}

// One shortcut, edited in place: a change is saved when the field is left (or on Enter); one that
// can't be saved goes back to what it was, saying why.
function ShortcutRow({ shortcut, all }: { shortcut: TextShortcut; all: TextShortcut[] }) {
  const L = LABELS.typingShortcuts;
  const update = useSettingsStore((s) => s.updateTextShortcut);
  const remove = useSettingsStore((s) => s.removeTextShortcut);
  const [typed, setTyped] = useState(shortcut.typed);
  const [text, setText] = useState(shortcut.text);
  const [problem, setProblem] = useState<string | null>(null);

  function commit() {
    const t = typed.trim();
    if (t === shortcut.typed && text === shortcut.text) return;
    const p = textShortcutProblem(t, text, all, shortcut.id);
    if (p) {
      setProblem(L.problems[p]);
      setTyped(shortcut.typed);
      setText(shortcut.text);
      return;
    }
    setProblem(null);
    update(shortcut.id, { typed: t, text: text.trim() });
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
  };

  return (
    <li>
      <div className={styles.shortcutRow}>
        <input
          className={styles.shortcutTyped}
          value={typed}
          maxLength={SHORTCUT_TYPED_MAX}
          aria-label={L.typed}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <span className={styles.shortcutArrow} aria-hidden="true">→</span>
        <input
          className={styles.shortcutText}
          value={text}
          maxLength={SHORTCUT_TEXT_MAX}
          aria-label={L.text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={styles.shortcutRemove}
          title={L.remove}
          aria-label={L.remove}
          onClick={async () => { if (await confirmDelete(L.noun, shortcut.typed)) remove(shortcut.id); }}
        ><TrashIcon /></button>
      </div>
      {problem && <p className={styles.shortcutProblem} role="alert">{problem}</p>}
    </li>
  );
}
