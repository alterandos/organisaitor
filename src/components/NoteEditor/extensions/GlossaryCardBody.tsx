import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { typeAfterTermLink, useCardTermLinks } from './CardTermLinks';
import { factHeadline, quoteHeadline } from '@/utils/factHeadline';
import { pairsBeforeInput, pairsKeyDown } from './cardFieldPairs';
import { insertAtCaret, lineBreakAfterTermLink, termLinkEndingAtCaret } from './cardFieldText';
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { DEFAULT_IMAGE_LAYOUT, IMAGE_PLACES, type ImageLayout } from './cardImageLayout';
import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked, useSecretsVersion } from '@/services/noteSecrets';
import { openGlossaryEntry } from '@/services/notePassage';
import { GLOSSARY_TYPES, TERM_RICH, fieldFacts, fieldSymbols, type FormulaSymbol, fieldLinks, fieldList, fieldRich, fieldRichList, fieldText, getStructuredTagType, termRich, NAMED_FIELD_ID, namedFieldLine, takeNamedLines, type Fact, type GlossaryLink, type StructuredTagFieldDef, glossaryKinds, glossaryNames } from '@/config/structuredTagTypes';
import { glossaryRelation } from '@/config/glossaryRelations';
import { GlossaryTermPicker } from '@/components/GlossaryTermPicker/GlossaryTermPicker';
import { LABELS } from '@/config/labels';
import { entryImportance, glossaryKindLine, headlineTerms } from '@/services/glossary';
import { importanceLevel } from './importanceLevels';
import { addPicture, pictureRef, useFieldPictureSrc } from '@/services/pictures';
import { clipboardImage, imageFileFrom } from '@/components/PictureInput/pictureInput';
import { acronymLetterPositions } from '@/utils/acronymInference';
import { log, errorMessage } from '@/utils/log';
import { normalizeLinkUrl, openExternalLink } from '@/utils/links';
import { escapeHtml, hasFormatting, linesAsBreaks, richLines, richToPlain, sanitizeInlineHtml } from '@/utils/richText';
import type { StructuredTagEntry, StructuredTagEntryId } from '@/types';
import type { GlossaryCardVariant } from './GlossaryCard';
import { BUILTIN_TAGS } from '../builtinTags';
import { MathsInput } from './MathsInput';
import { CORNERS } from './imageGeometry';
import { pictureHandles, resizePicture } from './pictureResize';
import styles from './GlossaryCard.module.css';
import { CardIcon } from '@/components/CardLook/CardIcon';
import { ClarifyIcon, CloseIcon, ReviewIcon, TrashIcon, UnlinkIcon, UnsureIcon } from '@/components/Icons';
import { recordFlag } from './BlockFlags';
import { recordReview } from './ReviewMark';
import { formatDate } from '@/utils/date';

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
  onHide:   (fieldId: string) => void;   // a field taken off the card (emptied first)
  onWaiting: (fields: { id: string; name: string }[]) => void;   // the optional fields not shown yet
  fresh:    boolean;        // made by Shift+Enter and not written in yet
  onTouched: () => void;    // something was typed: no longer fresh
  onAddAnother: () => void; // Shift+Enter in the last field
  onDiscard: (how: 'enter' | 'escape') => void;   // Enter or Esc in a fresh, empty card
  onLeave:  (forward: boolean) => void;   // an arrow key past the first or last field
  onUndo:   () => void;   // Ctrl+Z in a fresh, empty card: undo making it
  imageLayout?: ImageLayout;   // how this card shows its picture (cardImageLayout.ts)
  onImageLayout?: (layout: ImageLayout) => void;
  // Show another record on this card instead, this one (which held nothing else) going for good:
  // an Acronym card whose long form is already defined, its acronym added there.
  onSwitchTo?: (entryId: string) => void;
  showIcon?: boolean;   // the Card design's kind icon beside the term (a card can hide it)
  onShowIcon?: (show: boolean) => void;
}

const DEFAULT_LAYOUT = DEFAULT_IMAGE_LAYOUT;
const MIN_IMAGE_PX = 48;

// The record's current fields merged with `change`, written through the store (encryption-aware).
function saveEntry(entryId: string, change: { term?: string; fields?: Record<string, unknown> }): void {
  const store = useNoteStore.getState();
  const raw = store.structuredTagEntries[entryId as StructuredTagEntryId];
  if (!raw) return;
  const cur = entryView(raw);
  // A Fact or Quote with no headline gets one worked out as it's written (utils/factHeadline.ts).
  if (change.term === undefined && !cur.term.trim() && change.fields) {
    const next = { ...cur.fields, ...change.fields };
    const plain = (id: string) => (typeof next[id] === 'string' ? richToPlain(next[id] as string) : '');
    if (cur.typeKey === 'fact' && plain('statement').trim()) change = { ...change, term: factHeadline(plain('statement'), { terms: headlineTerms(raw.id) }) };
    if (cur.typeKey === 'quote' && plain('text').trim()) change = { ...change, term: quoteHeadline(plain('text'), plain('who')) };
  }
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
function RichField({ html, onCommit, multiline, items, placeholder, className, editable, label, autoFocus, termLinksFor, takeLines }: {
  html: string; onCommit: (html: string) => void; multiline?: boolean; placeholder?: string; className?: string;
  items?: boolean;   // a list: a <div> per item, so each is drawn with its bullet while it's edited
  editable: boolean; label: string; autoFocus?: boolean;
  takeLines?: (html: string) => string;   // on leaving it: "Name: value" lines made into fields, the rest kept
  termLinksFor?: string;   // this card's record: Glossary terms typed here are offered as links (CardTermLinks.tsx)
}) {
  const ref = useRef<HTMLDivElement>(null);
  const links = useCardTermLinks(termLinksFor);
  const dirty = useRef(false);
  // A field of several lines keeps its lines as <br>s whatever the browser wrote (linesAsBreaks); a
  // list, as a <div> per item (2026-11-05: as <br>s its bullets weren't drawn).
  const clean = (h: string) => (items ? richLines(h).map((l) => `<div>${l}</div>`).join('') : sanitizeInlineHtml(multiline ? linesAsBreaks(h) : h));
  const cleanRef = useRef(clean);
  useEffect(() => { cleanRef.current = clean; });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; });
  const save = useRef(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty.current || !ref.current) return;
    dirty.current = false;
    commit.current(cleanRef.current(ref.current.innerHTML));
  });
  // A change from elsewhere shows at once, unless something is being typed here. What was just saved
  // from here may read differently only by its spacing (a save trims lines and drops empty ones), so
  // that is compared line by line: rewriting the field for it put the cursor back at its start
  // (found 2026-11-02, typing on a line of a card's Examples).
  useEffect(() => {
    const el = ref.current;
    if (!el || dirty.current) return;
    const same = (a: string, b: string) => richLines(cleanRef.current(a)).join('<br>') === richLines(cleanRef.current(b)).join('<br>');
    if (!same(el.innerHTML, html)) el.innerHTML = cleanRef.current(html);
  }, [html]);
  useEffect(() => { if (autoFocus && ref.current) focusField(ref.current, 'end'); }, [autoFocus]);
  useEffect(() => { const s = save.current; return () => s(); }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || !editable) return;
    const before = (e: InputEvent) => { if (!pairsBeforeInput(el, e)) typeAfterTermLink(el, e); };
    el.addEventListener('beforeinput', before);
    return () => el.removeEventListener('beforeinput', before);
  }, [editable]);
  if (!editable) {
    return html ? (
      <>
        <div className={`${styles.richShown} ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(html) }}
          onMouseOver={links.onMouseOver} onMouseOut={links.onMouseOut} onClick={links.onClick} />
        {links.overlay}
      </>
    ) : null;
  }
  return (
    <>
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
        else if (items) wrapLooseLine(el);
        dirty.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => save.current(), 500);
        links.onInput(el);
      }}
      onMouseOver={links.onMouseOver}
      onMouseOut={links.onMouseOut}
      onClick={links.onClick}
      onBlur={() => {
        const el = ref.current;
        if (el && takeLines) {
          const rest = takeLines(el.innerHTML);
          if (rest !== el.innerHTML) { el.innerHTML = rest; dirty.current = true; }
        }
        save.current();
        // Left as saved: only the kept formatting (a pasted or browser-added span goes).
        if (el && el.innerHTML !== clean(el.innerHTML)) el.innerHTML = clean(el.innerHTML);
      }}
      onKeyDown={(e) => { if (!links.onKeyDown(e, e.currentTarget) && !pairsKeyDown(e.currentTarget, e)) formatKey(e); }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        const put = multiline ? text : text.replace(/\s*\n\s*/g, ' ');
        // execCommand fires no beforeinput, so a paste at the end of a term link would join it.
        if (termLinkEndingAtCaret(e.currentTarget)) insertAtCaret(e.currentTarget, put);
        else document.execCommand?.('insertText', false, put);
      }}
      onDrop={(e) => e.preventDefault()}
    />
    {links.overlay}
    </>
  );
}

// The browser types a list's first line straight into the field, outside any item: it goes into one
// (keeping the caret), so it has its bullet too.
function wrapLooseLine(el: HTMLElement): void {
  const loose = [...el.childNodes].filter((n) => !(n instanceof HTMLElement && n.tagName === 'DIV'));
  if (!loose.length) return;
  const sel = window.getSelection();
  const caret = sel && sel.anchorNode && el.contains(sel.anchorNode) ? { node: sel.anchorNode, offset: sel.anchorOffset } : null;
  const line = document.createElement('div');
  el.insertBefore(line, loose[0]);
  line.append(...loose);
  if (caret && caret.node !== el) sel!.collapse(caret.node, caret.offset);
  else sel?.collapse(line, line.childNodes.length);
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
      <RichField html={html} onCommit={(v) => onCommit(richLines(v))} multiline items placeholder={placeholder} editable label={label} autoFocus={autoFocus} />
    </div>
  );
}

// Short words shown as chips (a fact's or quote's reasons, 2026-11-03): Enter or a comma adds what's
// typed, Backspace in an empty box takes the last off, and the ones used on other records are
// offered as you type (a datalist), so the same few reasons get reused.
function TagChips({ items, onCommit, placeholder, editable, label, autoFocus, suggestions }: {
  items: string[]; onCommit: (v: string[]) => void; placeholder?: string; editable: boolean; label: string; autoFocus: boolean; suggestions: string[];
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const add = (word: string) => {
    const w = word.trim().replace(/,$/, '').trim();
    if (w && !items.some((i) => i.toLowerCase() === w.toLowerCase())) onCommit([...items, w]);
    setDraft('');
  };
  if (!editable) return items.length ? <div className={styles.chips}>{items.map((t) => <span key={t} className={styles.chip}>{t}</span>)}</div> : null;
  return (
    <div className={styles.chips}>
      {items.map((t) => (
        <span key={t} className={styles.chip}>
          {t}
          <button type="button" className={styles.chipRemove} aria-label={LABELS.glossaryCard.removeChip(t)} onClick={() => onCommit(items.filter((i) => i !== t))}><CloseIcon /></button>
        </span>
      ))}
      <input className={styles.chipInput} value={draft} placeholder={items.length ? '' : placeholder} aria-label={label} list={listId} autoFocus={autoFocus}
        data-card-input="" onChange={(e) => { if (e.target.value.endsWith(',')) add(e.target.value); else setDraft(e.target.value); }}
        onBlur={() => { if (draft.trim()) add(draft); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); e.stopPropagation(); add(draft); }
          else if (e.key === 'Backspace' && !draft && items.length) onCommit(items.slice(0, -1));
        }} />
      <datalist id={listId}>{suggestions.filter((s) => !items.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
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

// A card's own fields (a profile's Habitat, Born…, and any card's): each its own field, its name as
// the label, both edited in place; a field emptied of both goes. There's no box of them: a field is
// made by typing "Name: value" on a line of the card's text (takeOwnFields), or on the new line shown
// while there are none yet (or when the field is added).
function OwnFields({ facts, onCommit, onTake, placeholder, editable, label, autoFocus, entryId }: {
  facts: Fact[]; onCommit: (v: Fact[]) => void; onTake: (fact: Fact) => void; placeholder?: string; editable: boolean;
  label: string; autoFocus: boolean; entryId: string;
}) {
  const [adding, setAdding] = useState(autoFocus);
  const change = (i: number, patch: Partial<Fact>) =>
    onCommit(facts.map((f, j) => (j === i ? { ...f, ...patch } : f)).filter((f) => f.label.trim() || f.value.trim()));
  async function remove(i: number) {
    const f = facts[i];
    if (f.value.trim() && !(await confirmRemoveField(f.label || LABELS.glossary.ownFieldName))) return;
    onCommit(facts.filter((_, j) => j !== i));
  }
  const typing = editable && (adding || facts.length === 0);
  if (!facts.length && !typing) return null;
  // A table of their own, apart from the card's built-in fields: each name on the left, its value
  // on the right (the user, 2026-11-10: the value under its name took room and read poorly).
  return (
    <div className={styles.ownFields} data-own-fields="">
      {facts.map((f, i) => <OwnFieldRow key={i} fact={f} editable={editable} entryId={entryId} onChange={(patch) => change(i, patch)} onRemove={() => void remove(i)} />)}
      {typing && (
        <NewOwnField placeholder={placeholder} label={label} onTake={onTake} onDone={() => setAdding(false)} />
      )}
    </div>
  );
}

// Its value is formatted text like any field's, so Glossary terms typed there are offered as links
// (2026-11-05: an acronym couldn't be linked from a concept's own field).
function OwnFieldRow({ fact, editable, entryId, onChange, onRemove }: { fact: Fact; editable: boolean; entryId: string; onChange: (patch: Partial<Fact>) => void; onRemove: () => void }) {
  const name = useDraft(fact.label, (label) => onChange({ label: label.trim() }));
  const value = (
    <RichField html={fact.value} onCommit={(v) => { if (v !== fact.value) onChange({ value: v }); }} editable={editable}
      label={fact.label || LABELS.glossary.ownFieldName} termLinksFor={entryId} />
  );
  if (!editable) {
    return (
      <div className={styles.ownField}>
        <div className={styles.ownName}>{fact.label}</div>
        <div className={styles.ownValue}>{value}</div>
      </div>
    );
  }
  return (
    <div className={styles.ownField} data-field={NAMED_FIELD_ID}>
      <div className={styles.ownName}>
        <input className={styles.ownLabel} value={name.value} aria-label={LABELS.glossary.ownFieldName} placeholder={LABELS.glossary.ownFieldName}
          onChange={(e) => name.change(e.target.value)} onBlur={name.blur} />
      </div>
      <div className={styles.ownValue}>{value}</div>
      <RemoveFieldButton name={fact.label || LABELS.glossary.ownFieldName} onRemove={onRemove} />
    </div>
  );
}

// The line a new field is typed on, as "Name: value". Enter makes it and opens the next.
function NewOwnField({ placeholder, label, onTake, onDone }: { placeholder?: string; label: string; onTake: (fact: Fact) => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const take = () => {
    const fact = namedFieldLine(text);
    if (fact) { onTake(fact); setText(''); }
    return !!fact;
  };
  return (
    <div className={styles.ownNew}>
      <input className={styles.input} value={text} placeholder={placeholder} aria-label={label} data-card-input="" autoFocus
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { take(); onDone(); }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
          e.preventDefault();
          e.stopPropagation();
          take();
        }} />
    </div>
  );
}

// Taking a field off a card (asked for by the user 2026-11-02: an emptied field stayed). A field
// holding something asks first; an empty one just goes.
const confirmRemoveField = (name: string) =>
  confirmDialog({ title: L.removeFieldTitle(name), message: L.removeFieldMessage, confirmLabel: L.removeField, destructive: true });

// What each symbol of a formula stands for (a Formula's Where): a row per symbol, the symbol as
// maths, then its meaning and unit.
function SymbolsField({ items, onCommit, editable, autoFocus }: { items: FormulaSymbol[]; onCommit: (v: FormulaSymbol[]) => void; editable: boolean; autoFocus: boolean }) {
  const [adding, setAdding] = useState(autoFocus);
  const rows = adding || (editable && items.length === 0) ? [...items, { symbol: '', meaning: '', unit: '' }] : items;
  const change = (i: number, patch: Partial<FormulaSymbol>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r)).filter((r) => r.symbol.trim() || r.meaning.trim() || r.unit.trim());
    if (i >= items.length) setAdding(false);
    onCommit(next);
  };
  return (
    <div className={styles.symbols}>
      {rows.map((r, i) => <SymbolRow key={i} row={r} editable={editable} onChange={(patch) => change(i, patch)} onRemove={() => { if (i < items.length) onCommit(items.filter((_, j) => j !== i)); else setAdding(false); }} />)}
      {editable && !adding && items.length > 0 && (
        <button type="button" className={styles.smallBtn} onClick={() => setAdding(true)}>{L.addSymbol}</button>
      )}
    </div>
  );
}

function SymbolRow({ row, editable, onChange, onRemove }: { row: FormulaSymbol; editable: boolean; onChange: (patch: Partial<FormulaSymbol>) => void; onRemove: () => void }) {
  const meaning = useDraft(row.meaning, (v) => onChange({ meaning: v }));
  const unit = useDraft(row.unit, (v) => onChange({ unit: v }));
  return (
    <div className={styles.symbolRow}>
      <MathsInput className={styles.symbolMaths} value={row.symbol} onCommit={(v) => onChange({ symbol: v })} editable={editable} label={L.symbol} placeholder={editable ? 'x' : undefined} />
      {editable ? (
        <>
          <input className={styles.input} value={meaning.value} placeholder={L.symbolMeaning} aria-label={L.symbolMeaning} data-card-input=""
            onChange={(e) => meaning.change(e.target.value)} onBlur={meaning.blur} />
          <input className={`${styles.input} ${styles.symbolUnit}`} value={unit.value} placeholder={L.symbolUnit} aria-label={L.symbolUnit}
            onChange={(e) => unit.change(e.target.value)} onBlur={unit.blur} />
          <RemoveFieldButton name={L.symbol} onRemove={onRemove} />
        </>
      ) : (
        <span>{row.meaning}{row.unit && <span className={styles.symbolUnit}> ({row.unit})</span>}</span>
      )}
    </div>
  );
}

function RemoveFieldButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button type="button" className={styles.removeField} aria-label={L.removeFieldNamed(name)} title={L.removeFieldNamed(name)}
      onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <TrashIcon />
    </button>
  );
}

// The picture is in the picture library (`picture:<id>` in the field; a data URL from before the
// library still shows). An encrypted entry's picture is stored encrypted. A picture can be chosen,
// pasted (Ctrl+V with the slot focused, anywhere in the card, or the Paste button) or dropped on
// it; dragging its corner resizes it, and it can sit in the fields' order, to their right or after them.
function ImageField({ value, term, encrypted, onCommit, editable, layout, onLayout }: {
  value: string; term: string; encrypted: boolean; onCommit: (v: string) => void; editable: boolean;
  layout: ImageLayout; onLayout?: (l: ImageLayout) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const src = useFieldPictureSrc(value);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  async function choose(file: File | null | undefined) {
    if (!file) return;
    try { onCommit(pictureRef(await addPicture(file, { encrypted, origin: 'card' }))); }
    catch (e) { log.warn('glossaryCard', 'could not read the picture', errorMessage(e)); }
  }
  async function pasteFromClipboard() {
    let file: File | null;
    try { file = await clipboardImage(); }
    catch (e) {
      log.warn('glossaryCard', 'clipboard not readable', errorMessage(e));
      await alertDialog(L.clipboardBlocked);
      return;
    }
    if (file) await choose(file);
    else await alertDialog(L.noClipboardImage);
  }
  // Resized as a note's picture is (pictureResize.ts): its corners, which keep its shape (a card
  // keeps only its picture's width), snapping to the note's pictures and the card's width.
  // Double-clicking a corner puts it back to its own size.
  const boxRef = useRef<HTMLSpanElement>(null);
  const latest = useRef({ layout, onLayout });
  useEffect(() => { latest.current = { layout, onLayout }; });
  const resizable = !!src && editable && !!onLayout;
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !resizable) return;
    let stop: (() => void) | null = null;
    const handles = pictureHandles(CORNERS, (e, h) => {
      const img = imgRef.current;
      const card = img?.closest<HTMLElement>('[data-glossary-type]');
      if (!img) return;
      stop = resizePicture(e, h, {
        picture: img,
        within: img.closest('.ProseMirror'),
        frame: box,
        column: card?.offsetWidth ?? 600,
        stretched: false,
        onMove: (size) => setDragWidth(Math.round(Math.max(MIN_IMAGE_PX, size.width))),
        onDone: (size) => {
          stop = null;
          setDragWidth(null);
          const { layout: now, onLayout: commit } = latest.current;
          commit?.({ ...now, width: Math.round(Math.max(MIN_IMAGE_PX, size.width)) });
        },
      });
    }, { showOnHover: true, label: L.resizeImage });
    handles.addEventListener('dblclick', () => { const { layout: now, onLayout: commit } = latest.current; commit?.({ ...now, width: null }); });
    box.append(handles);
    return () => { stop?.(); handles.remove(); };
  }, [resizable]);
  const width = dragWidth ?? layout.width;
  return (
    <div
      className={styles.imageField}
      tabIndex={editable ? 0 : undefined}
      aria-label={editable ? L.imageSlot : undefined}
      onPaste={(e) => { const f = editable ? imageFileFrom(e.clipboardData) : null; if (f) { e.preventDefault(); e.stopPropagation(); void choose(f); } }}
      onDragOver={(e) => { if (editable && Array.from(e.dataTransfer.items).some((i) => i.type.startsWith('image/'))) e.preventDefault(); }}
      onDrop={(e) => { const f = editable ? imageFileFrom(e.dataTransfer) : null; if (f) { e.preventDefault(); e.stopPropagation(); void choose(f); } }}
    >
      {src && (
        <span ref={boxRef} className={styles.imageBox}>
          <img ref={imgRef} className={`${styles.image} ${width ? styles.imageSized : ''}`} src={src} alt={L.imageAlt(term)} style={width ? { width } : undefined} />
        </span>
      )}
      {editable && (
        <div className={styles.imageTools}>
          <button type="button" className={styles.smallBtn} onClick={() => fileRef.current?.click()}>{value ? L.replaceImage : L.addImage}</button>
          <button type="button" className={styles.smallBtn} onClick={() => void pasteFromClipboard()}>{L.pasteImage}</button>
          {value && <button type="button" className={styles.smallBtn} onClick={() => onCommit('')}>{L.removeImage}</button>}
          {value && onLayout && (
            <span className={styles.placeChoice} role="group" aria-label={L.imagePlace}>
              {IMAGE_PLACES.map((p) => (
                <button key={p} type="button" aria-pressed={layout.place === p} className={`${styles.smallBtn} ${layout.place === p ? styles.smallBtnOn : ''}`}
                  onClick={() => onLayout({ ...layout, place: p })}>{L.imagePlaces[p]}</button>
              ))}
            </span>
          )}
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
    <button type="button" className={styles.entryLink} onClick={() => openGlossaryEntry(entry.id)}>
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
  const read = parent ? <EntryLink entry={parent} /> : null;
  if (!editable) return read;
  // The choice only while the card is being edited; otherwise what was chosen.
  return (
    <>
      {read && <span className={styles.whenReading}>{read}</span>}
      <select className={`${styles.select} ${styles.whenEditing}`} value={parent ? parentId : ''} aria-label={L.choose} onChange={(e) => onCommit(e.target.value)}>
        <option value="">{L.noParent}</option>
        {options.map((e) => <option key={e.id} value={e.id}>{e.term}</option>)}
      </select>
    </>
  );
}

// Typed links to other entries, stored on this one; links other entries make to this one are
// shown from this side (read-only here: they're edited where they're stored).
function LinksField({ self, all, editable, onCommit, relation }: { self: StructuredTagEntry; all: StructuredTagEntry[]; editable: boolean; onCommit: (v: GlossaryLink[]) => void; relation?: string }) {
  const links = fieldLinks(self.fields, 'related');
  const byId = new Map(all.map((e) => [e.id as string, e]));
  const incoming = all.flatMap((e) => e.id === self.id ? [] : fieldLinks(e.fields, 'related').filter((l) => l.entryId === self.id).map((l) => ({ kind: l.kind, from: e })));
  const [picking, setPicking] = useState(false);
  const linked = links.map((l) => l.entryId);
  const choices = all.filter((e) => e.id !== self.id && e.term && !linked.includes(e.id));
  return (
    <div className={styles.links}>
      {links.map((l, i) => {
        const target = byId.get(l.entryId);
        if (!target) return null;
        return (
          <div key={`${l.kind}-${l.entryId}`} className={styles.linkRow}>
            <span className={styles.relation}>{glossaryRelation(l.kind).label}</span> <EntryLink entry={target} />
            {editable && <button type="button" className={styles.remove} aria-label={L.remove} title={L.remove} onClick={() => onCommit(links.filter((_, j) => j !== i))}><UnlinkIcon /></button>}
          </div>
        );
      })}
      {incoming.map(({ kind: k, from }) => (
        <div key={`in-${k}-${from.id}`} className={styles.linkRow}>
          <span className={styles.relation}>{glossaryRelation(k).inverse}</span> <EntryLink entry={from} />
        </div>
      ))}
      {/* Linking another only while the card is being edited (asked for by the user 2026-11-11). */}
      {editable && choices.length > 0 && (
        <div className={`${styles.linkRow} ${styles.whenEditing}`}>
          <button type="button" className={styles.linkAdd} onClick={() => setPicking(true)}>{L.linkTo}</button>
        </div>
      )}
      {picking && (
        <GlossaryTermPicker selfId={self.id} exclude={linked} suggestFrom={self.term} relation={relation}
          onPick={(entryId, kind) => onCommit([...links, { kind, entryId }])} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

// The acronym's expansion with the letters that spell it picked out (Australian Stock eXchange).
function SpelledOut({ term, text }: { term: string; text: string }) {
  const at = new Set(acronymLetterPositions(term, text) ?? []);
  return <>{[...text].map((ch, i) => (at.has(i) ? <b key={i} className={styles.spelled}>{ch}</b> : <Fragment key={i}>{ch}</Fragment>))}</>;
}

export function GlossaryCardBody({ entryId, variant, editable, focusRequest, onEscape, onDone, shown, onShow, onHide, onWaiting, fresh, onTouched, onAddAnother, onDiscard, onLeave, onUndo, imageLayout = DEFAULT_LAYOUT, onImageLayout, onSwitchTo, showIcon = true, onShowIcon }: Props) {
  const entries = useNoteStore((s) => s.structuredTagEntries);
  useSecretsVersion((s) => s.version);
  const [editingExpansion, setEditingExpansion] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Enter in the card's last field: a new line in its own fields (the count asks again).

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
  async function removeField(f: StructuredTagFieldDef) {
    if (hasValue(f)) {
      if (!(await confirmRemoveField(f.name))) return;
      setField(f.id, ['list', 'urls', 'links', 'facts', 'symbols'].includes(f.type) ? [] : '');
    }
    onHide(f.id);
  }

  // Leaving a field (blur) saves it, so every key that leaves blurs first. The user, 2026-11-05:
  //   Enter             the next field ("Name: value" lines finished first); from the last, on to
  //                     the text after the card (as the arrow does). In a list: the next item, and from an
  //                     empty last one the next field (RichList).
  //   Shift+Enter       a field of several lines: a new line, a finished "Name: value" line becoming
  //                     a field of that name; a one-line field: as Enter
  //   arrows            past a field's edge, the next (previous) field, then out of the card
  //   Ctrl+Enter        done: out of the card, on a new line after it
  //   Ctrl+Shift+Enter  out of the card, and another card of the same kind below
  //   Esc               the card is selected
  //   Enter / Esc       in a fresh card (made by Ctrl+Shift+Enter) nothing was written in: it goes again
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
    if (empty && mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      leave(onUndo);
      return;
    }
    if (e.key === 'Enter' && mod && e.shiftKey && !e.altKey) { leave(onAddAnother); return; }
    if (e.key === 'Enter' && mod) { leave(onDone); return; }
    if (e.key === 'Escape') { e.stopPropagation(); leave(onEscape); return; }
    if (at < 0 || mod || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const lines = target.hasAttribute('data-multiline') && target.getAttribute('contenteditable') === 'true';
      // "Name: value" lines typed so far become fields, whichever key finishes them.
      if (lines) {
        const fieldId = target.closest<HTMLElement>('[data-field]')?.dataset.field;
        const rest = fieldId ? takeOwnFields(fieldId, target.innerHTML) : target.innerHTML;
        if (rest !== target.innerHTML) {
          target.innerHTML = rest;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          focusField(target, 'end');
          if (!rest && e.shiftKey) return;
        }
        if (e.shiftKey) {
          if (!lineBreakAfterTermLink(target)) document.execCommand?.('insertLineBreak');
          return;
        }
      }
      if (inputs[at + 1]) { focusField(inputs[at + 1], 'start'); return; }
      leave(() => onLeave(true));
      return;
    }
    if (e.shiftKey) return;
    const edges = e.key.startsWith('Arrow') ? caretEdges(target) : null;
    if (!edges) return;
    if (e.key === 'ArrowDown' && edges.lastLine) go(1, 'start');
    else if (e.key === 'ArrowRight' && edges.end) go(1, 'start');
    else if (e.key === 'ArrowUp' && edges.firstLine) go(-1, 'end');
    else if (e.key === 'ArrowLeft' && edges.start) go(-1, 'end');
  };
  const typed = () => { if (fresh) onTouched(); };
  // Fields of the person's own: the "Name: value" lines of a text field (every line but its first:
  // takeNamedLines) taken out of it. Each becomes a row of the card's own fields, or fills one of
  // its built-in fields of that name while that's empty ("Example: …"). Returns what's left.
  function takeOwnFields(fieldId: string, html: string): string {
    const def = typeDef!.fields.find((f) => f.id === fieldId);
    const own = typeDef!.fields.find((f) => f.id === NAMED_FIELD_ID);
    if (!own || def?.type !== 'textarea') return html;
    const { html: rest, facts } = takeNamedLines(html);
    if (!facts.length) return html;
    takeFacts(facts, fieldId);
    return rest;
  }
  // Each into a built-in field of that name while that's empty, else one of the card's own; one of
  // its own of that name already there takes the new value.
  function takeFacts(facts: Fact[], fromField?: string): void {
    const own = typeDef!.fields.find((f) => f.id === NAMED_FIELD_ID);
    if (!own) return;
    const mine = [...fieldFacts(entry.fields, own.id)];
    let changed = false;
    for (const fact of facts) {
      const same = (name: string) => name.trim().toLowerCase() === fact.label.toLowerCase();
      const builtIn = typeDef!.fields.find((f) => f.id !== fromField && (f.type === 'text' || f.type === 'textarea') && same(f.name));
      if (builtIn && !hasValue(builtIn) && fact.value) { setField(builtIn.id, fact.value); onShow(builtIn.id); continue; }
      const at = mine.findIndex((m) => same(m.label));
      if (at >= 0) mine[at] = { ...mine[at], value: fact.value };
      else mine.push(fact);
      changed = true;
    }
    if (changed) { setField(own.id, mine); onShow(own.id); }
  }
  const isAcronym = entry.typeKey === 'acronym';
  // How important the record is (Key concept, Critical acronym…) and what else it counts as
  // ("also an acronym"): said in the kind line.
  const level = entryImportance(entry);
  const kindLine = glossaryKindLine({ kindLabel: typeDef.label, importance: level, kinds: glossaryKinds(entry) });
  // Every status mark on the card (textMarks.ts) shows as Important's star does: Clarify later, Not
  // sure of this (BlockFlags.ts), Review later (ReviewMark.ts).
  const clarify = recordFlag(entry.fields, 'clarify');
  const unsure = recordFlag(entry.fields, 'unsure');
  const review = recordReview(entry.fields);
  const CL = LABELS.clarify;
  const flagIcons = (clarify || unsure || review) ? (
    <>
      {review && <span className={styles.flagIcon} data-flag="review" title={`${LABELS.importance.reviewLater} · ${LABELS.importance.due(formatDate(review.due))}`}><ReviewIcon /></span>}
      {clarify && <span className={styles.flagIcon} data-flag="clarify" title={clarify.note ? CL.markerNote(clarify.note) : CL.blockToggle}><ClarifyIcon /></span>}
      {unsure && <span className={styles.flagIcon} data-flag="unsure" title={unsure.note ? CL.unsureMarkerWhy(unsure.note) : CL.blockUnsure}><UnsureIcon /></span>}
    </>
  ) : null;
  // Its acronym and what that stands for (glossaryNames), and the field the acronym is spelled out in.
  const names = glossaryNames(entry);
  const spelled = names.short && names.long ? { field: isAcronym ? 'expansion' : 'acronym', short: names.short, long: names.long } : null;
  // One record per thing: an Acronym whose long form is already a record offers to add itself
  // there (when it holds nothing else that would be lost); a record whose acronym already has an
  // Acronym card says so.
  const lower = (s: string | null) => (s ?? '').trim().toLowerCase();
  const definedAs = editable && isAcronym && names.long ? all.find((e) => e.id !== entry.id && e.typeKey !== 'acronym' && lower(e.term) === lower(names.long)) : undefined;
  const onlyNames = typeDef.fields.every((f) => f.id === 'expansion' || !hasValue(f));
  const acronymCard = editable && !isAcronym && names.short ? all.find((e) => e.id !== entry.id && e.typeKey === 'acronym' && e.term.trim() === names.short) : undefined;
  const duplicateHint = definedAs ? (
    <div className={styles.duplicate}>
      {LABELS.glossary.alsoDefined(definedAs.term)}{' '}
      {onSwitchTo && onlyNames && (
        <button type="button" className={styles.smallBtn} onClick={() => { saveEntry(definedAs.id, { fields: { acronym: names.short } }); onSwitchTo(definedAs.id); }}>
          {LABELS.glossary.addAcronymThere(names.short ?? '')}
        </button>
      )}
    </div>
  ) : acronymCard ? (
    <div className={styles.duplicate}>{LABELS.glossary.alsoAcronym(acronymCard.term)} <EntryLink entry={acronymCard} /></div>
  ) : null;
  // The term is plain text to the rest of the app; its formatting (H₂O) is kept beside it.
  const termField = (
    <div data-card-part="title" className={styles.term}>
      <RichField html={termRich(entry) ?? escapeHtml(entry.term)} editable={editable}
        onCommit={(html) => saveEntry(id, { term: richToPlain(html).trim(), fields: { [TERM_RICH]: hasFormatting(html) ? html : '' } })}
        className={isAcronym ? styles.acronymTerm : undefined} placeholder={L.termPlaceholder[entry.typeKey] ?? typeDef.label} label={typeDef.label} />
    </div>
  );

  function renderField(f: StructuredTagFieldDef, autoFocus: boolean): ReactNode {
    switch (f.type) {
      case 'text':
      case 'textarea':
        // An acronym with its letters picked out of what it stands for, until it's typed in (or
        // arrowed into): an Acronym's "Stands for", or a Definition's (Concept's, Profile's)
        // "Acronym", shown as ASX — Australian Securities Exchange, so it's learnt as an acronym.
        if (spelled && f.id === spelled.field && !editingExpansion) {
          return (
            <div className={styles.spelledOut} tabIndex={editable ? 0 : undefined} data-card-input={editable ? '' : undefined}
              onFocus={() => editable && setEditingExpansion(true)} onClick={() => editable && setEditingExpansion(true)}>
              {spelled.field === 'acronym' && <><b className={styles.acronymShort}>{spelled.short}</b>{' — '}</>}
              <SpelledOut term={spelled.short} text={spelled.long} />
            </div>
          );
        }
        return (
          <div onBlur={() => setEditingExpansion(false)}>
            <RichField html={fieldRich(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} multiline={f.type === 'textarea'}
              placeholder={f.placeholder} editable={editable} label={f.name} className={f.id === primaryId ? styles.primary : undefined} termLinksFor={id}
              takeLines={f.type === 'textarea' ? (h) => takeOwnFields(f.id, h) : undefined}
              autoFocus={autoFocus || (spelled?.field === f.id && editingExpansion)} />
          </div>
        );
      case 'list':
        return <RichList items={fieldRichList(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus} />;
      case 'image':
        return <ImageField value={fieldText(entry.fields, f.id)} term={entry.term} encrypted={entry.isEncrypted} onCommit={(v) => setField(f.id, v)} editable={editable} layout={imageLayout} onLayout={onImageLayout} />;
      case 'parent': {
        const parts = all.filter((e) => e.id !== entry.id && fieldText(e.fields, f.id) === id);
        return (
          <>
            <ParentField self={entry} all={all} editable={editable} onCommit={(v) => setField(f.id, v)} />
            {parts.length > 0 && (
              <div className={styles.parts}>
                <span data-card-part="label">{L.subConcepts}</span>
                {parts.map((p) => <EntryLink key={p.id} entry={p} />)}
              </div>
            )}
          </>
        );
      }
      case 'links':
        return <LinksField self={entry} all={all} editable={editable} onCommit={(v) => setField(f.id, v)} relation={f.relation} />;
      case 'urls':
        return <UrlList items={fieldList(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus} />;
      case 'tags':
        return <TagChips items={fieldList(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus}
          suggestions={[...new Set(all.flatMap((e) => fieldList(e.fields, f.id)))].sort((a, b) => a.localeCompare(b))} />;
      case 'maths':
        return <MathsInput className={styles.maths} value={fieldText(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} editable={editable} label={f.name} placeholder={editable ? f.name : undefined} />;
      case 'symbols':
        return <SymbolsField items={fieldSymbols(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} editable={editable} autoFocus={autoFocus} />;
      case 'facts':
        return <OwnFields facts={fieldFacts(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} onTake={(fact) => takeFacts([fact])} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus} entryId={id} />;
    }
  }

  // Compact: one line. The kind's icon and the term, shaded in the kind's colour and ruled off the
  // full height of the card, then what it means.
  if (variant === 'compact') {
    const primary = typeDef.fields.find((f) => f.id === primaryId);
    const icon = BUILTIN_TAGS.find((t) => t.typeKey === entry.typeKey)?.icon;
    return (
      <div ref={rootRef} className={styles.compact} data-card-look="compact" data-glossary-type={entry.typeKey} onKeyDown={keyDown} onInput={typed}>
        <div data-card-part="lead">
          {icon && <CardIcon icon={icon} shown title={kindLine} />}
          {level > 0 && <span className={styles.compactIcon} title={LABELS.importance.kindLevel(level as 1 | 2 | 3, typeDef.label)}>{importanceLevel(level).icon}</span>}
          {flagIcons}
          {termField}
        </div>
        {primary && <div className={styles.compactMeaning} data-field={primary.id}>{renderField(primary, false)}</div>}
        <ReportWaiting fields={NONE} onWaiting={onWaiting} />
      </div>
    );
  }

  // A sub-concept's parts show on its parent too, so the parent field shows when it has parts.
  const hasParts = all.some((e) => e.id !== entry.id && fieldText(e.fields, 'parentId') === id);
  const visible = typeDef.fields.filter((f) => f.id === primaryId || f.always || hasValue(f) || shown.includes(f.id) || (f.type === 'parent' && hasParts) || (f.type === 'links' && all.some((e) => fieldLinks(e.fields, 'related').some((l) => l.entryId === id))));
  const waiting = editable ? typeDef.fields.filter((f) => !visible.includes(f) && f.offered !== false) : [];

  // The picture out of the fields' order when it's placed to their right or after them.
  const imageDef = typeDef.fields.find((f) => f.type === 'image');
  const placed = imageDef && visible.includes(imageDef) && hasValue(imageDef) && imageLayout.place !== 'flow' ? imageDef : null;
  // A card's own fields are each a field of their own, with no box around them.
  const fieldBox = (f: StructuredTagFieldDef) => f.type === 'facts' ? <Fragment key={f.id}>{renderField(f, shown.includes(f.id) && !hasValue(f))}</Fragment> : (
    <div key={f.id} className={styles.field} data-field={f.id}>
      {editable && f.id !== primaryId && <RemoveFieldButton name={f.name} onRemove={() => void removeField(f)} />}
      {f.id !== primaryId && <div data-card-part="label">{f.name}</div>}
      {renderField(f, shown.includes(f.id) && !hasValue(f))}
    </div>
  );
  // The kind's icon beside the term, as the Compact design has it (2026-11-10). Hovering it offers to
  // hide it; hidden, the term moves left and a button at the card's top left brings it back (both
  // also in the card's right-click menu).
  const kindIcon = BUILTIN_TAGS.find((t) => t.typeKey === entry.typeKey)?.icon;
  const iconShown = showIcon && !!kindIcon;
  const canToggleIcon = editable && !!onShowIcon;
  const main = (
    <>
      <div data-card-head="">
        {kindIcon && <CardIcon icon={kindIcon} shown={iconShown} onToggle={canToggleIcon ? onShowIcon : undefined} />}
        <span data-card-part="kind" data-importance={level || undefined}>{kindLine}{flagIcons}</span>
        {termField}
      </div>
      <div data-card-part="rule" aria-hidden="true" />
      {duplicateHint}
      {visible.filter((f) => f !== placed).map(fieldBox)}
    </>
  );
  // Ctrl+V anywhere in the card with a picture on the clipboard puts it in the picture field.
  const pasteImage = (e: React.ClipboardEvent) => {
    const file = editable && imageDef ? imageFileFrom(e.clipboardData) : null;
    if (!file || !imageDef) return;
    e.preventDefault();
    e.stopPropagation();
    if (!visible.includes(imageDef)) onShow(imageDef.id);
    void addPicture(file, { encrypted: entry.isEncrypted, origin: 'card' })
      .then((pid) => setField(imageDef.id, pictureRef(pid)))
      .catch((err) => log.warn('glossaryCard', 'could not read the picture', errorMessage(err)));
  };

  return (
    <div ref={rootRef} className={styles.card} data-card-look="card" data-glossary-type={entry.typeKey} onKeyDown={keyDown} onInput={typed} onPasteCapture={pasteImage}>
      {placed && imageLayout.place === 'right'
        ? <div className={styles.withSide}><div className={styles.mainCol}>{main}</div><div className={styles.sideCol}>{fieldBox(placed)}</div></div>
        : main}
      {placed && imageLayout.place === 'bottom' && fieldBox(placed)}
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
