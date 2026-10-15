import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked, useSecretsVersion } from '@/services/noteSecrets';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { GLOSSARY_TYPES, TERM_RICH, factsFromText, factsToText, fieldFacts, fieldLinks, fieldList, fieldRich, fieldRichList, fieldText, getStructuredTagType, termRich, type Fact, type GlossaryLink, type StructuredTagFieldDef } from '@/config/structuredTagTypes';
import { GLOSSARY_RELATIONS, glossaryRelation } from '@/config/glossaryRelations';
import { LABELS } from '@/config/labels';
import { compressImageBlob } from '@/utils/imageCompress';
import { acronymLetterPositions } from '@/utils/acronymInference';
import { log, errorMessage } from '@/utils/log';
import { normalizeLinkUrl, openExternalLink } from '@/utils/links';
import { escapeHtml, hasFormatting, richLines, richToPlain, sanitizeInlineHtml } from '@/utils/richText';
import type { StructuredTagEntry, StructuredTagEntryId } from '@/types';
import type { GlossaryCardVariant } from './GlossaryCard';
import { BUILTIN_TAGS } from '../builtinTags';
import styles from './GlossaryCard.module.css';

// The card a Glossary card block (GlossaryCard.ts) shows: the record's term, then each field of
// its type's schema (config/structuredTagTypes.ts) drawn by the field's kind, so a new field is
// one schema entry and a new kind of field one renderer below. Empty optional fields wait as
// "+ Example"-style pills, shown only while the card is hovered, floating beside it (the block
// decides which side: GlossaryCard.ts morePillSide), and in the block pill's "+ Add". Edits are
// saved to the record after a short pause and on leaving the field, never per keystroke (each
// save syncs).

const L = LABELS.glossaryCard;

interface Props {
  entryId:  string | null;
  variant:  GlossaryCardVariant;
  editable: boolean;
  // Asked by the block (after `\definition`, Enter, a key typed on the selected card): put the
  // cursor in the term and type `text` there. `n` changes per request.
  focusRequest: { n: number; text: string; edge?: 'start' | 'end' };
  onEscape: () => void;     // Esc in the card selects the block (as in every block)
  onDone:   () => void;     // Ctrl+Enter: what was typed is saved, and the cursor goes to the text after
  shown:    string[];       // optional fields opened on this card (kept by the block, so its "+ Add" can open one too)
  onShow:   (fieldId: string) => void;
  onWaiting: (fields: { id: string; name: string }[]) => void;   // the optional fields not shown yet
  fresh:    boolean;        // made by Shift+Enter and not written in yet
  onTouched: () => void;    // something was typed: no longer fresh
  onAddAnother: () => void; // Shift+Enter in the last field
  onDiscard: (how: 'enter' | 'escape') => void;   // Enter or Esc in a fresh, empty card
  onLeave:  (forward: boolean) => void;   // an arrow key past the first or last field
}

// The record's current fields merged with `change`, written through the store (encryption-aware).
function saveEntry(entryId: string, change: { term?: string; fields?: Record<string, unknown> }): void {
  const store = useNoteStore.getState();
  const raw = store.structuredTagEntries[entryId as StructuredTagEntryId];
  if (!raw) return;
  const cur = entryView(raw);
  store.updateStructuredTagEntry(raw.id, {
    ...(change.term !== undefined ? { term: change.term } : {}),
    ...(change.fields ? { fields: { ...cur.fields, ...change.fields } } : {}),
  });
}

// A text being typed: shown from the draft, saved half a second after typing stops, on leaving
// the field, and on unmount.
function useDraft(value: string, commit: (v: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const latest = useRef({ draft, value, commit });
  useEffect(() => { latest.current = { draft, value, commit }; });
  useEffect(() => {
    if (draft === null || draft === value) return;
    const t = setTimeout(() => latest.current.commit(draft), 500);
    return () => clearTimeout(t);
  }, [draft, value]);
  useEffect(() => () => {
    const l = latest.current;
    if (l.draft !== null && l.draft !== l.value) l.commit(l.draft);
  }, []);
  return {
    value: draft ?? value,
    change: (v: string) => setDraft(v),
    blur: () => { if (draft !== null && draft !== value) commit(draft); setDraft(null); },
  };
}

// Which edge of its field the cursor is at (collapsed only): the very start or end, and the first
// or last line, for the arrows. Lines are measured from the caret's box where there is one.
function caretEdges(el: HTMLElement): { start: boolean; end: boolean; firstLine: boolean; lastLine: boolean } | null {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const at = el.selectionStart ?? 0;
    if (at !== el.selectionEnd) return null;
    const v = el.value;
    return { start: at === 0, end: at === v.length, firstLine: !v.slice(0, at).includes('\n'), lastLine: !v.slice(at).includes('\n') };
  }
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed || !el.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(range.startContainer, range.startOffset);
  const at = before.toString().length;
  const start = at === 0;
  const end = at === (el.textContent ?? '').length;
  if (!el.hasAttribute('data-multiline')) return { start, end, firstLine: true, lastLine: true };
  const caret = range.getClientRects?.()[0];
  const box = el.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
  if (!caret || !caret.height) return { start, end, firstLine: start, lastLine: end };
  return { start, end, firstLine: caret.top < box.top + line, lastLine: caret.bottom > box.bottom - line };
}

// The cursor into a field, at its start or end.
function focusField(el: HTMLElement, at: 'start' | 'end'): void {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const n = at === 'start' ? 0 : el.value.length;
    el.setSelectionRange(n, n);
    return;
  }
  if (el.getAttribute('contenteditable') !== 'true') return;
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(at === 'start');
  sel.removeAllRanges();
  sel.addRange(range);
}

// Formatting keys in a field: the note's own (Ctrl+B, I, U, Ctrl+Shift+S, Ctrl+Shift+= and -).
// Handled here and kept from the note, whose handlers would act on the note's text instead.
function formatKey(e: KeyboardEvent<HTMLElement>): void {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  const cmd = !e.shiftKey && k === 'b' ? 'bold'
    : !e.shiftKey && k === 'i' ? 'italic'
    : !e.shiftKey && k === 'u' ? 'underline'
    : e.shiftKey && k === 's' ? 'strikeThrough'
    : e.shiftKey && e.code === 'Equal' ? 'superscript'
    : e.shiftKey && e.code === 'Minus' ? 'subscript'
    : null;
  if (!cmd) return;
  e.preventDefault();
  e.stopPropagation();
  document.execCommand?.(cmd);
}

// A field of formatted text (utils/richText.ts): editable in place, saved half a second after
// typing stops and on leaving it, never per keystroke (each save syncs). Shown from the record while
// it isn't being typed in. Pasting brings in the text only.
function RichField({ html, onCommit, multiline, placeholder, className, editable, label, autoFocus }: {
  html: string; onCommit: (html: string) => void; multiline?: boolean; placeholder?: string; className?: string;
  editable: boolean; label: string; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; });
  const save = useRef(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty.current || !ref.current) return;
    dirty.current = false;
    commit.current(sanitizeInlineHtml(ref.current.innerHTML));
  });
  // A change from elsewhere shows at once, unless something is being typed here; what was just
  // saved from here reads the same, so the cursor isn't disturbed.
  useEffect(() => {
    const el = ref.current;
    if (!el || dirty.current) return;
    const shown = sanitizeInlineHtml(html);
    if (sanitizeInlineHtml(el.innerHTML) !== shown) el.innerHTML = shown;
  }, [html]);
  useEffect(() => { if (autoFocus && ref.current) focusField(ref.current, 'end'); }, [autoFocus]);
  useEffect(() => { const s = save.current; return () => s(); }, []);
  if (!editable) return html ? <div className={`${styles.richShown} ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(html) }} /> : null;
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      tabIndex={0}
      role="textbox"
      aria-label={label}
      aria-multiline={multiline || undefined}
      data-card-input=""
      data-multiline={multiline ? '' : undefined}
      data-placeholder={placeholder}
      className={`${styles.input} ${styles.rich} ${className ?? ''}`}
      onInput={() => {
        const el = ref.current!;
        if (!el.textContent) el.innerHTML = '';
        dirty.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => save.current(), 500);
      }}
      onBlur={() => {
        save.current();
        // Left as saved: only the kept formatting (a pasted or browser-added span goes).
        const el = ref.current;
        if (el && el.innerHTML !== sanitizeInlineHtml(el.innerHTML)) el.innerHTML = sanitizeInlineHtml(el.innerHTML);
      }}
      onKeyDown={formatKey}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand?.('insertText', false, multiline ? text : text.replace(/\s*\n\s*/g, ' '));
      }}
      onDrop={(e) => e.preventDefault()}
    />
  );
}

// A list of formatted items, edited as lines (one item per line), shown with bullets. Enter starts
// the next item; Enter on an empty last line goes on to the next field (the card's keys).
function RichList({ items, onCommit, placeholder, editable, label, autoFocus }: {
  items: string[]; onCommit: (v: string[]) => void; placeholder?: string; editable: boolean; label: string; autoFocus: boolean;
}) {
  const html = items.map((i) => `<div>${sanitizeInlineHtml(i)}</div>`).join('');
  if (!editable) {
    return items.length ? <ul className={styles.list}>{items.map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(item) }} />)}</ul> : null;
  }
  return (
    <div className={styles.richList} onKeyDown={(e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const root = e.target as HTMLElement;
      const sel = window.getSelection();
      let line: Node | null = sel?.anchorNode ?? null;
      while (line && line.parentNode !== root && line !== root) line = line.parentNode;
      const lastLine = !root.lastChild || line === root || line === root.lastChild;
      const empty = !line || line === root ? !(root.textContent ?? '').trim() : !(line.textContent ?? '').trim();
      if (lastLine && empty) {
        if (line && line !== root) { line.parentNode?.removeChild(line); root.dispatchEvent(new Event('input', { bubbles: true })); }
        return;   // on to the card's keys: the next field
      }
      e.stopPropagation();   // a new line: the next item
    }}>
      <RichField html={html} onCommit={(v) => onCommit(richLines(v))} multiline placeholder={placeholder} editable label={label} autoFocus={autoFocus} />
    </div>
  );
}

// Web addresses, one per line, shown short and opened the app's way. Plain text (an address has
// nothing to format). Enter on an empty last line goes on, as in a list.
function UrlList({ items, onCommit, placeholder, editable, label, autoFocus }: {
  items: string[]; onCommit: (v: string[]) => void; placeholder?: string; editable: boolean; label: string; autoFocus: boolean;
}) {
  const [editing, setEditing] = useState(autoFocus);
  const d = useDraft(items.join('\n'), (text) => onCommit(text.split('\n').map((s) => s.trim()).filter(Boolean)));
  if (editable && (editing || items.length === 0)) {
    return (
      <textarea className={`${styles.input} ${styles.listInput}`} value={d.value} placeholder={placeholder} aria-label={label} rows={2} autoFocus={editing}
        data-card-input="" onChange={(e) => d.change(e.target.value)} onBlur={() => { d.blur(); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
          const t = e.currentTarget;
          const atEnd = t.selectionStart === t.value.length;
          if (atEnd && (t.value === '' || t.value.endsWith('\n'))) { d.change(t.value.replace(/\n+$/, '')); return; }
          e.stopPropagation();
        }} />
    );
  }
  return (
    <ul className={styles.list} tabIndex={editable ? 0 : undefined} data-card-input={editable ? '' : undefined}
      onFocus={() => editable && setEditing(true)} onClick={() => editable && setEditing(true)}>
      {items.map((item, i) => <li key={i}><WebLink url={item} /></li>)}
    </ul>
  );
}

// Facts (a profile's Habitat, Family, Born…): typed one per line as "Label: value", shown as two
// columns of label and value.
function FactsField({ facts, onCommit, placeholder, editable, label, autoFocus }: {
  facts: Fact[]; onCommit: (v: Fact[]) => void; placeholder?: string; editable: boolean; label: string; autoFocus: boolean;
}) {
  const [editing, setEditing] = useState(autoFocus);
  const d = useDraft(factsToText(facts), (text) => onCommit(factsFromText(text)));
  if (editable && (editing || facts.length === 0)) {
    return (
      <textarea className={`${styles.input} ${styles.listInput}`} value={d.value} placeholder={placeholder} aria-label={label} rows={3} autoFocus={editing}
        data-card-input="" onChange={(e) => d.change(e.target.value)} onBlur={() => { d.blur(); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
          const t = e.currentTarget;
          const atEnd = t.selectionStart === t.value.length;
          if (atEnd && (t.value === '' || t.value.endsWith('\n'))) { d.change(t.value.replace(/\n+$/, '')); return; }
          e.stopPropagation();
        }} />
    );
  }
  return (
    <dl className={styles.facts} tabIndex={editable ? 0 : undefined} data-card-input={editable ? '' : undefined}
      onFocus={() => editable && setEditing(true)} onClick={() => editable && setEditing(true)}>
      {facts.map((f, i) => (
        <Fragment key={i}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function ImageField({ src, term, onCommit, editable }: { src: string; term: string; onCommit: (v: string) => void; editable: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  async function choose(file: File | undefined) {
    if (!file) return;
    try { onCommit(await compressImageBlob(file)); }
    catch (e) { log.warn('glossaryCard', 'could not read the picture', errorMessage(e)); }
  }
  return (
    <div className={styles.imageField}>
      {src && <img className={styles.image} src={src} alt={L.imageAlt(term)} />}
      {editable && (
        <div className={styles.imageTools}>
          <button type="button" className={styles.smallBtn} onClick={() => fileRef.current?.click()}>{src ? L.replaceImage : L.addImage}</button>
          {src && <button type="button" className={styles.smallBtn} onClick={() => onCommit('')}>{L.removeImage}</button>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void choose(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}

// A web address, shown short (host and path) and opened the app's way (utils/links.ts), so it works
// in the desktop app and on Android, where a plain link wouldn't leave the app.
function WebLink({ url }: { url: string }) {
  const href = normalizeLinkUrl(url);
  let shown = url;
  try { const u = new URL(href); shown = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`; } catch { /* not a full address: shown as typed */ }
  return (
    <a className={styles.webLink} href={href} title={href}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openExternalLink(href); }}>{shown}</a>
  );
}

// An entry's term as a link to where it's defined.
function EntryLink({ entry }: { entry: StructuredTagEntry }) {
  return (
    <button type="button" className={styles.entryLink} onClick={() => openNotePassage(entry.noteId, definitionPassage(entry.id))}>
      {entry.term || '…'}
    </button>
  );
}

// The broader concept this one is part of (a choice among the other concepts, never one of its
// own parts), and its parts: the concepts that name it as theirs.
function ParentField({ self, all, editable, onCommit }: { self: StructuredTagEntry; all: StructuredTagEntry[]; editable: boolean; onCommit: (v: string) => void }) {
  const parentId = fieldText(self.fields, 'parentId');
  const byId = new Map(all.map((e) => [e.id as string, e]));
  const descends = (id: string): boolean => {
    for (let cur = byId.get(id), seen = 0; cur && seen < 50; cur = byId.get(fieldText(cur.fields, 'parentId')), seen++) if (cur.id === self.id) return true;
    return false;
  };
  const options = all.filter((e) => e.typeKey === self.typeKey && e.id !== self.id && e.term && !descends(e.id));
  const parent = byId.get(parentId);
  if (!editable) return parent ? <EntryLink entry={parent} /> : null;
  return (
    <select className={styles.select} value={parent ? parentId : ''} aria-label={L.choose} onChange={(e) => onCommit(e.target.value)}>
      <option value="">{L.noParent}</option>
      {options.map((e) => <option key={e.id} value={e.id}>{e.term}</option>)}
    </select>
  );
}

// Typed links to other entries, stored on this one; links other entries make to this one are
// shown from this side (read-only here: they're edited where they're stored).
function LinksField({ self, all, editable, onCommit }: { self: StructuredTagEntry; all: StructuredTagEntry[]; editable: boolean; onCommit: (v: GlossaryLink[]) => void }) {
  const links = fieldLinks(self.fields, 'related');
  const byId = new Map(all.map((e) => [e.id as string, e]));
  const incoming = all.flatMap((e) => e.id === self.id ? [] : fieldLinks(e.fields, 'related').filter((l) => l.entryId === self.id).map((l) => ({ kind: l.kind, from: e })));
  const [kind, setKind] = useState(GLOSSARY_RELATIONS[0].kind);
  const choices = all.filter((e) => e.id !== self.id && e.term && !links.some((l) => l.entryId === e.id));
  return (
    <div className={styles.links}>
      {links.map((l, i) => {
        const target = byId.get(l.entryId);
        if (!target) return null;
        return (
          <div key={`${l.kind}-${l.entryId}`} className={styles.linkRow}>
            <span className={styles.relation}>{glossaryRelation(l.kind).label}</span> <EntryLink entry={target} />
            {editable && <button type="button" className={styles.remove} aria-label={L.remove} title={L.remove} onClick={() => onCommit(links.filter((_, j) => j !== i))}>×</button>}
          </div>
        );
      })}
      {incoming.map(({ kind: k, from }) => (
        <div key={`in-${k}-${from.id}`} className={styles.linkRow}>
          <span className={styles.relation}>{glossaryRelation(k).inverse}</span> <EntryLink entry={from} />
        </div>
      ))}
      {editable && choices.length > 0 && (
        <div className={styles.linkRow}>
          <select className={styles.select} value={kind} aria-label={L.linkTo} onChange={(e) => setKind(e.target.value)}>
            {GLOSSARY_RELATIONS.map((r) => <option key={r.kind} value={r.kind}>{r.label}</option>)}
          </select>
          <select className={styles.select} value="" aria-label={L.choose} onChange={(e) => e.target.value && onCommit([...links, { kind, entryId: e.target.value }])}>
            <option value="">{L.linkTo}</option>
            {choices.map((e) => <option key={e.id} value={e.id}>{e.term}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// The acronym's expansion with the letters that spell it picked out (Australian Stock eXchange).
function SpelledOut({ term, text }: { term: string; text: string }) {
  const at = new Set(acronymLetterPositions(term, text) ?? []);
  return <>{[...text].map((ch, i) => (at.has(i) ? <b key={i} className={styles.spelled}>{ch}</b> : <Fragment key={i}>{ch}</Fragment>))}</>;
}

export function GlossaryCardBody({ entryId, variant, editable, focusRequest, onEscape, onDone, shown, onShow, onWaiting, fresh, onTouched, onAddAnother, onDiscard, onLeave }: Props) {
  const entries = useNoteStore((s) => s.structuredTagEntries);
  useSecretsVersion((s) => s.version);
  const [editingExpansion, setEditingExpansion] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Runs after the card is drawn, so a request made while it was being drawn still lands: the
  // term (or, arriving from below, the last field), then `text` typed there.
  const { n: focusN, text: focusText, edge: focusEdge } = focusRequest;
  useEffect(() => {
    if (focusN === 0 || !rootRef.current) return;
    const inputs = rootRef.current.querySelectorAll<HTMLElement>('[data-card-input]');
    const target = focusEdge === 'end' ? inputs[inputs.length - 1] : inputs[0];
    if (!target) return;
    focusField(target, focusEdge ?? 'end');
    // As if typed: through the browser's own editing, so the field sees it.
    if (focusText) document.execCommand?.('insertText', false, focusText);
  }, [focusN, focusText, focusEdge]);

  const raw = entryId ? entries[entryId as StructuredTagEntryId] : undefined;
  if (!raw) return <div className={styles.missing}>{L.missing}</div>;
  if (isEntryLocked(raw)) return <div className={styles.missing}>🔒 {L.locked}</div>;
  const entry = entryView(raw);
  const typeDef = getStructuredTagType(entry.typeKey);
  if (!typeDef) return null;
  const primaryId = GLOSSARY_TYPES[entry.typeKey] ?? typeDef.fields[0]?.id;
  const all = Object.values(entries).filter((e) => e.typeKey in GLOSSARY_TYPES && !isEntryLocked(e)).map(entryView);
  const id = entry.id as string;
  const setField = (fid: string, v: unknown) => saveEntry(id, { fields: { [fid]: v } });

  const hasValue = (f: StructuredTagFieldDef) => {
    const v = entry.fields[f.id];
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== '';
  };

  // Leaving a field (blur) saves it, so every key that leaves blurs first.
  //   Enter           the next field; after the last, on to the text after the card
  //   arrows          past a field's edge, the next (previous) field, then out of the card
  //   Ctrl+Enter      done: on to the text after the card
  //   Esc             the card is selected
  //   Shift+Enter     in the last field: another card of the same kind below; elsewhere a line break
  //   Enter / Esc     in a fresh card (made by Shift+Enter) nothing was written in: it goes again
  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const inputs = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-card-input]')];
    const at = inputs.indexOf(target);
    const go = (step: 1 | -1, edge: 'start' | 'end') => {
      e.preventDefault();
      e.stopPropagation();
      const next = inputs[at + step];
      if (next) { focusField(next, edge); return; }
      (document.activeElement as HTMLElement | null)?.blur();
      onLeave(step === 1);
    };
    const leave = (then: () => void) => {
      e.preventDefault();
      e.stopPropagation();
      (document.activeElement as HTMLElement | null)?.blur();
      then();
    };
    const mod = e.ctrlKey || e.metaKey;
    const typedHere = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : target.textContent;
    const empty = fresh && !entry.term && !typeDef.fields.some(hasValue) && !typedHere;
    if (empty && (e.key === 'Escape' || (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey))) {
      e.stopPropagation();
      const how = e.key === 'Enter' ? 'enter' : 'escape';
      leave(() => onDiscard(how));
      return;
    }
    if (e.key === 'Enter' && e.shiftKey && !mod && !e.altKey) {
      const fields = e.currentTarget.querySelectorAll('[data-field]');
      if (fields.length && fields[fields.length - 1].contains(target)) leave(onAddAnother);
      else if (target.hasAttribute('data-multiline') && target.getAttribute('contenteditable') === 'true') { e.preventDefault(); document.execCommand?.('insertLineBreak'); }
      else e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && mod) { leave(onDone); return; }
    if (e.key === 'Escape') { e.stopPropagation(); leave(onEscape); return; }
    if (at < 0 || mod || e.shiftKey || e.altKey) return;
    if (e.key === 'Enter') { go(1, 'start'); return; }
    const edges = e.key.startsWith('Arrow') ? caretEdges(target) : null;
    if (!edges) return;
    if (e.key === 'ArrowDown' && edges.lastLine) go(1, 'start');
    else if (e.key === 'ArrowRight' && edges.end) go(1, 'start');
    else if (e.key === 'ArrowUp' && edges.firstLine) go(-1, 'end');
    else if (e.key === 'ArrowLeft' && edges.start) go(-1, 'end');
  };
  const typed = () => { if (fresh) onTouched(); };
  const isAcronym = entry.typeKey === 'acronym';
  // The term is plain text to the rest of the app; its formatting (H₂O) is kept beside it.
  const termField = (
    <RichField html={termRich(entry) ?? escapeHtml(entry.term)} editable={editable}
      onCommit={(html) => saveEntry(id, { term: richToPlain(html).trim(), fields: { [TERM_RICH]: hasFormatting(html) ? html : '' } })}
      className={`${styles.term} ${isAcronym ? styles.acronymTerm : ''}`} placeholder={L.termPlaceholder[entry.typeKey] ?? typeDef.label} label={typeDef.label} />
  );

  function renderField(f: StructuredTagFieldDef, autoFocus: boolean): ReactNode {
    switch (f.type) {
      case 'text':
      case 'textarea':
        // An acronym's expansion with its letters picked out, until it's typed in (or arrowed into).
        if (isAcronym && f.id === 'expansion' && !editingExpansion && entry.term && fieldText(entry.fields, f.id)) {
          return (
            <div className={styles.spelledOut} tabIndex={editable ? 0 : undefined} data-card-input={editable ? '' : undefined}
              onFocus={() => editable && setEditingExpansion(true)} onClick={() => editable && setEditingExpansion(true)}>
              <SpelledOut term={entry.term} text={fieldText(entry.fields, f.id)} />
            </div>
          );
        }
        return (
          <div onBlur={() => setEditingExpansion(false)}>
            <RichField html={fieldRich(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} multiline={f.type === 'textarea'}
              placeholder={f.placeholder} editable={editable} label={f.name} className={f.id === primaryId ? styles.primary : undefined}
              autoFocus={autoFocus || (isAcronym && f.id === 'expansion' && editingExpansion)} />
          </div>
        );
      case 'list':
        return <RichList items={fieldRichList(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus} />;
      case 'image':
        return <ImageField src={fieldText(entry.fields, f.id)} term={entry.term} onCommit={(v) => setField(f.id, v)} editable={editable} />;
      case 'parent': {
        const parts = all.filter((e) => e.id !== entry.id && fieldText(e.fields, f.id) === id);
        return (
          <>
            <ParentField self={entry} all={all} editable={editable} onCommit={(v) => setField(f.id, v)} />
            {parts.length > 0 && (
              <div className={styles.parts}>
                <span className={styles.label}>{L.subConcepts}</span>
                {parts.map((p) => <EntryLink key={p.id} entry={p} />)}
              </div>
            )}
          </>
        );
      }
      case 'links':
        return <LinksField self={entry} all={all} editable={editable} onCommit={(v) => setField(f.id, v)} />;
      case 'urls':
        return <UrlList items={fieldList(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus} />;
      case 'facts':
        return <FactsField facts={fieldFacts(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus} />;
    }
  }

  // Compact: one line. The kind's icon, the term, a thin rule, then what it means.
  if (variant === 'compact') {
    const primary = typeDef.fields.find((f) => f.id === primaryId);
    const icon = BUILTIN_TAGS.find((t) => t.typeKey === entry.typeKey)?.icon;
    return (
      <div ref={rootRef} className={styles.compact} data-glossary-type={entry.typeKey} onKeyDown={keyDown} onInput={typed}>
        {icon && <span className={styles.compactIcon} title={typeDef.label} aria-hidden="true">{icon}</span>}
        {termField}
        <span className={styles.pipe} aria-hidden="true" />
        {primary && <div className={styles.compactMeaning} data-field={primary.id}>{renderField(primary, false)}</div>}
        <ReportWaiting fields={NONE} onWaiting={onWaiting} />
      </div>
    );
  }

  // A sub-concept's parts show on its parent too, so the parent field shows when it has parts.
  const hasParts = all.some((e) => e.id !== entry.id && fieldText(e.fields, 'parentId') === id);
  const visible = typeDef.fields.filter((f) => f.id === primaryId || hasValue(f) || shown.includes(f.id) || (f.type === 'parent' && hasParts) || (f.type === 'links' && all.some((e) => fieldLinks(e.fields, 'related').some((l) => l.entryId === id))));
  const waiting = editable ? typeDef.fields.filter((f) => !visible.includes(f)) : [];

  return (
    <div ref={rootRef} className={styles.card} data-glossary-type={entry.typeKey} onKeyDown={keyDown} onInput={typed}>
      <div className={styles.head}>
        <span className={styles.kind}>{typeDef.label}</span>
        {termField}
      </div>
      <div className={styles.rule} aria-hidden="true" />
      {visible.map((f) => (
        <div key={f.id} className={styles.field} data-field={f.id}>
          {f.id !== primaryId && <div className={styles.label}>{f.name}</div>}
          {renderField(f, shown.includes(f.id) && !hasValue(f))}
        </div>
      ))}
      {waiting.length > 0 && (
        <div className={styles.more} data-card-more="">
          {waiting.map((f) => (
            <button key={f.id} type="button" className={styles.addField} onClick={() => onShow(f.id)}>+ {f.name}</button>
          ))}
        </div>
      )}
      <ReportWaiting fields={waiting} onWaiting={onWaiting} />
    </div>
  );
}

const NONE: StructuredTagFieldDef[] = [];

// Tells the block which optional fields are still waiting, after drawing (for the pill's "+ Add").
function ReportWaiting({ fields, onWaiting }: { fields: StructuredTagFieldDef[]; onWaiting: Props['onWaiting'] }) {
  const key = fields.map((f) => `${f.id}:${f.name}`).join('|');
  useEffect(() => {
    onWaiting(key ? key.split('|').map((p) => { const i = p.indexOf(':'); return { id: p.slice(0, i), name: p.slice(i + 1) }; }) : []);
  }, [key, onWaiting]);
  return null;
}
