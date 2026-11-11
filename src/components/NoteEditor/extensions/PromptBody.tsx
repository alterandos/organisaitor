import { useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { DisclosureIcon, TrashIcon } from '@/components/Icons';
import { FieldError } from '@/components/FieldError/FieldError';
import { useNoteViews } from '@/store/noteViews';
import { formatDate } from '@/utils/date';
import { assemblePrompt, collectPromptTemplates, fillUsed, fillsIn, freshRun, hiddenByFolds, pasteMarkdownPrompt, promptIsEmpty, readMarkdownPrompt, sectionLevel, withUsedFills, type PromptData, type PromptSection } from '@/utils/aiPrompt';
import { promptTargets, sendPrompt } from '@/services/aiPromptTargets';
import styles from './Prompt.module.css';

// The `\prompt` block's body (extensions/Prompt.ts). Folded, a small tile: its name, what it holds,
// the main send and New run. Open: the name, the fill-ins (a name / value table, each {name}
// written in a section listed there to fill in for this run), then the sections under their own
// headings, each Kept or Each run, moved with ↑ ↓. Everything is saved as it's typed.
//
// Keys as every block's (2026-11-11): Enter goes on to the next field (from the last, out of the
// block), Shift+Enter is a new line in a section, Ctrl+Enter leaves it as it is onto a new line
// below; Ctrl+Shift+Enter sends it (to the first place it can go). A section's heading has a level
// (1–6, sent as that many #s) and folds away with the sections under it. Markdown pasted in (with
// # headings) becomes sections (utils/aiPrompt.ts readMarkdownPrompt).

export const PROMPT_ICON = '🤖';

export interface PromptFocus {
  n:      number;                  // a new request moves the focus
  where?: 'title' | 'run';         // the title; the first each-run section
  text?:  string;                  // typed on the selected block: goes in where the cursor lands
}

const L = LABELS.noteBlocks.prompt;

export function PromptBody({ data, sentAt, open, canFold, editable, focus, onChange, onOpen, onEscape, onLeave, onNewRun }: {
  data:     PromptData;
  sentAt:   string | null;
  open:     boolean;
  canFold:  boolean;
  editable: boolean;
  focus:    PromptFocus;
  onChange: (patch: Partial<PromptData> & { sentAt?: string }, history?: boolean) => void;
  onOpen:   (open: boolean) => void;
  onEscape: () => void;
  onLeave:  () => void;
  onNewRun: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const lastSection = useRef<{ id: string; at: number } | null>(null);
  const [newFill, setNewFill] = useState('');
  const [error, setError] = useState('');
  const toFill = data.fills.filter((f) => !f.value.trim() && fillUsed(data.sections, f.name)).length;
  const folds = hiddenByFolds(data.sections);

  // A request for the keyboard (just made, typed on while selected, Enter, a new run).
  useEffect(() => {
    if (!focus.n || !open) return;
    const firstRun = data.sections.find((s) => s.perRun) ?? data.sections[0];
    const target: HTMLInputElement | HTMLTextAreaElement | null | undefined =
      focus.where === 'title' || (!focus.where && !data.title) ? titleRef.current
        : sectionRefs.current.get((focus.where === 'run' ? firstRun : data.sections[0])?.id ?? '');
    if (!target) return;
    target.focus();
    const end = target.value.length;
    target.setSelectionRange(end, end);
    if (focus.text) {
      if (target === titleRef.current) onChange({ title: data.title + focus.text });
      else {
        const s = data.sections.find((x) => sectionRefs.current.get(x.id) === target);
        if (s) setSection(s.id, { text: s.text + focus.text });
      }
    }
    // Only a new request moves the focus, not a changed prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.n, open]);

  function setSection(id: string, patch: Partial<PromptSection>) {
    const sections = data.sections.map((s) => (s.id === id ? { ...s, ...patch } : s));
    onChange({ sections, fills: withUsedFills({ sections, fills: data.fills }) });
  }

  function moveSection(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= data.sections.length) return;
    const sections = [...data.sections];
    [sections[i], sections[j]] = [sections[j], sections[i]];
    onChange({ sections });
  }

  function addSection() {
    const s: PromptSection = { id: nanoid(6), name: '', text: '', perRun: true };
    onChange({ sections: [...data.sections, s] });
    requestAnimationFrame(() => sectionRefs.current.get(s.id)?.parentElement?.querySelector<HTMLInputElement>('input')?.focus());
  }

  function addFill() {
    const name = newFill.trim().replace(/[{}]/g, '');
    if (!name) return;
    setNewFill('');
    if (!data.fills.some((f) => f.name.toLowerCase() === name.toLowerCase())) onChange({ fills: [...data.fills, { name, value: '' }] });
    insertFill(name);
  }

  // Puts {name} where the cursor was last in a section (the end of the first one, else).
  function insertFill(name: string) {
    const at = lastSection.current;
    const s = data.sections.find((x) => x.id === at?.id) ?? data.sections[0];
    if (!s) return;
    const pos = at?.id === s.id ? Math.min(at.at, s.text.length) : s.text.length;
    const token = `{${name}}`;
    const sections = data.sections.map((x) => (x.id === s.id ? { ...x, text: x.text.slice(0, pos) + token + x.text.slice(pos) } : x));
    onChange({ sections, fills: withUsedFills({ sections, fills: data.fills }) });
    lastSection.current = { id: s.id, at: pos + token.length };
    requestAnimationFrame(() => {
      const el = sectionRefs.current.get(s.id);
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos + token.length, pos + token.length);
    });
  }

  async function send(targetId: string) {
    const prompt = assemblePrompt(data);
    if (!prompt.text.trim()) { setError(L.nothingToSend); return; }
    setError('');
    if (await sendPrompt(targetId, { prompt, data })) onChange({ sentAt: new Date().toISOString() }, false);
  }

  // Markdown with # headings pasted into the title or a section fills the prompt in as sections.
  function pasteMarkdown(e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, sectionId: string | null) {
    if (!editable) return;
    const md = readMarkdownPrompt(e.clipboardData.getData('text/plain'));
    if (!md) return;
    e.preventDefault();
    const el = e.currentTarget;
    const at = sectionId ? { sectionId, from: el.selectionStart ?? 0, to: el.selectionEnd ?? 0 } : null;
    const next = pasteMarkdownPrompt(data, at, md, () => nanoid(6));
    onChange({ ...next, fills: withUsedFills({ sections: next.sections, fills: data.fills }) });
  }

  const targets = promptTargets();
  const keys = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (canFold) onOpen(false); else onEscape(); return; }
    if (e.key === 'Enter' && mod && e.shiftKey) { e.preventDefault(); e.stopPropagation(); if (targets[0]) void send(targets[0].id); return; }
    if (e.key === 'Enter' && mod) { e.preventDefault(); e.stopPropagation(); onLeave(); return; }
    // Enter: on to the next field, and out after the last; Shift+Enter a new line in a section.
    const field = (e.target as HTMLElement).closest?.('[data-prompt-field]');
    if (e.key !== 'Enter' || e.altKey || !field || (e.shiftKey && field instanceof HTMLTextAreaElement)) return;
    e.preventDefault();
    e.stopPropagation();
    const fields = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-prompt-field]') ?? []);
    const next = fields[fields.indexOf(field as HTMLElement) + 1];
    if (next) next.focus(); else onLeave();
  };

  const actions = (
    <div className={styles.actions}>
      {targets.map((t, i) => (
        <button key={t.id} type="button" className={i === 0 ? styles.primary : styles.button} onClick={() => void send(t.id)}
          title={i === 0 ? `${t.label} (Ctrl+Shift+Enter)` : t.label}>
          {t.icon}{t.label}
        </button>
      ))}
      {editable && <button type="button" className={styles.button} onClick={onNewRun} title={L.newRunHint}>{data.template ? L.useTemplate : L.newRun}</button>}
    </div>
  );

  const summary = (
    <span className={styles.summary}>
      {data.template && <span className={styles.badge}>{L.template}</span>}
      {L.summary(data.sections.filter((s) => s.text.trim() || s.name.trim()).length, toFill)}
      {sentAt && <> · {L.sentOn(formatDate(sentAt.slice(0, 10)))}</>}
    </span>
  );

  if (!open) {
    return (
      <div ref={rootRef} className={styles.tile} onKeyDown={keys}>
        <button type="button" className={styles.tileMain} onClick={() => onOpen(true)} title={L.open}>
          <span className={styles.icon} aria-hidden="true">{PROMPT_ICON}</span>
          <span className={styles.tileText}>
            <span className={styles.tileTitle}>{data.title.trim() || L.untitled}</span>
            {summary}
          </span>
        </button>
        {actions}
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={styles.full} onKeyDown={keys}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">{PROMPT_ICON}</span>
        <div className={styles.headText}>
          <span className={styles.kind}>{L.kindLine}</span>
          <input ref={titleRef} className={styles.title} value={data.title} readOnly={!editable} placeholder={L.titlePlaceholder} aria-label={L.titlePlaceholder}
            data-prompt-field="" onPaste={(e) => pasteMarkdown(e, null)} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        {canFold && <button type="button" className={styles.button} onClick={() => onOpen(false)}>{L.close}</button>}
      </div>
      <div className={styles.bar}>{summary}{actions}</div>
      <FieldError>{error}</FieldError>

      {editable && promptIsEmpty(data) && <StartFromTemplate onPick={(t) => onChange({ ...freshRun(t), sections: freshRun(t).sections.map((s) => ({ ...s, id: nanoid(6) })) })} />}

      <section className={styles.group} aria-label={L.fills}>
        <h4 className={styles.groupName}>{L.fills}</h4>
        {data.fills.length === 0 && <p className={styles.hint}>{L.fillsHint}</p>}
        {data.fills.length > 0 && (
          <div className={styles.fills}>
            {data.fills.map((f, i) => {
              const used = fillUsed(data.sections, f.name);
              return (
                <div key={f.name} className={styles.fillRow} data-unused={used ? undefined : ''}>
                  <button type="button" className={styles.fillName} onClick={() => insertFill(f.name)} disabled={!editable}
                    title={used ? L.insertFill(f.name) : `${L.notUsed}. ${L.insertFill(f.name)}`}>{`{${f.name}}`}</button>
                  <input className={styles.fillValue} value={f.value} readOnly={!editable} placeholder={L.fillValue(f.name)} aria-label={L.fillValue(f.name)} data-prompt-field=""
                    onChange={(e) => onChange({ fills: data.fills.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
                  {editable && !used && (
                    <button type="button" className={styles.iconButton} onClick={() => onChange({ fills: data.fills.filter((_, k) => k !== i) })}
                      title={L.removeFill(f.name)} aria-label={L.removeFill(f.name)}><TrashIcon /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {editable && (
          <input className={styles.newFill} value={newFill} placeholder={`+ ${L.addFill}`} aria-label={L.addFill}
            onChange={(e) => setNewFill(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addFill(); } }} onBlur={addFill} />
        )}
      </section>

      <section className={styles.group} aria-label={L.sections}>
        <h4 className={styles.groupName}>{L.sections}</h4>
        {data.sections.map((s, i) => folds.hidden.has(s.id) ? null : (
          <div key={s.id} className={styles.section} data-per-run={s.perRun ? '' : undefined} data-level={sectionLevel(s)}>
            <div className={styles.sectionHead}>
              <button type="button" className={styles.fold} aria-expanded={!s.folded} onClick={() => setSection(s.id, { folded: !s.folded })}
                title={s.folded ? L.unfoldSection : L.foldSection} aria-label={s.folded ? L.unfoldSection : L.foldSection}>
                <DisclosureIcon open={!s.folded} />
              </button>
              <input className={styles.sectionName} value={s.name} readOnly={!editable} placeholder={`${L.sectionName} ${i + 1}`} aria-label={L.sectionName}
                data-prompt-field="" onPaste={(e) => pasteMarkdown(e, s.id)} onChange={(e) => setSection(s.id, { name: e.target.value })} />
              <select className={styles.level} value={sectionLevel(s)} disabled={!editable} aria-label={L.level} title={L.level}
                onChange={(e) => setSection(s.id, { level: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{L.levelOption(n)}</option>)}
              </select>
              <button type="button" className={styles.runToggle} aria-pressed={s.perRun} disabled={!editable}
                title={s.perRun ? L.eachRunHint : L.keptHint} onClick={() => setSection(s.id, { perRun: !s.perRun })}>
                {s.perRun ? L.eachRun : L.kept}
              </button>
              {editable && (
                <span className={styles.sectionTools}>
                  <button type="button" className={styles.iconButton} disabled={i === 0} onClick={() => moveSection(i, -1)} title={L.moveUp} aria-label={L.moveUp}>↑</button>
                  <button type="button" className={styles.iconButton} disabled={i === data.sections.length - 1} onClick={() => moveSection(i, 1)} title={L.moveDown} aria-label={L.moveDown}>↓</button>
                  <button type="button" className={styles.iconButton} onClick={() => onChange({ sections: data.sections.filter((x) => x.id !== s.id) })}
                    title={L.removeSection(s.name)} aria-label={L.removeSection(s.name)}><TrashIcon /></button>
                </span>
              )}
            </div>
            {!folds.textHidden.has(s.id) && <>
              <textarea ref={(el) => { if (el) sectionRefs.current.set(s.id, el); else sectionRefs.current.delete(s.id); }}
                className={styles.sectionText} value={s.text} readOnly={!editable} placeholder={L.sectionPlaceholder} aria-label={s.name || `${L.section} ${i + 1}`}
                data-prompt-field="" onPaste={(e) => pasteMarkdown(e, s.id)}
                onChange={(e) => { setSection(s.id, { text: e.target.value }); lastSection.current = { id: s.id, at: e.target.selectionStart }; }}
                onSelect={(e) => { lastSection.current = { id: s.id, at: (e.target as HTMLTextAreaElement).selectionStart }; }} />
              <FillsUsed text={s.text} />
            </>}
          </div>
        ))}
        {editable && <button type="button" className={styles.addSection} onClick={addSection}>+ {L.addSection}</button>}
      </section>
    </div>
  );
}

// Under a section: the fill-ins it uses, as quiet chips (so a typo in a name shows).
function FillsUsed({ text }: { text: string }) {
  const names = fillsIn(text);
  if (!names.length) return null;
  return <div className={styles.used}>{names.map((n) => <span key={n} className={styles.chip}>{`{${n}}`}</span>)}</div>;
}

// An empty prompt offers the templates in the notes (prompts marked Template), to start from one.
function StartFromTemplate({ onPick }: { onPick: (t: PromptData) => void }) {
  const notes = useNoteViews();
  const templates = useMemo(() => collectPromptTemplates(Object.values(notes)), [notes]);
  if (!templates.length) return null;
  return (
    <div className={styles.templates}>
      <span className={styles.groupName}>{L.fromTemplate}</span>
      {templates.map((t, i) => (
        <button key={`${t.noteId}-${i}`} type="button" className={styles.button} onClick={() => onPick(t.data)} title={t.noteTitle}>
          {t.data.title || L.untitled}
        </button>
      ))}
    </div>
  );
}
