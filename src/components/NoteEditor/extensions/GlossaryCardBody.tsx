import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked, useSecretsVersion } from '@/services/noteSecrets';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { GLOSSARY_TYPES, fieldLinks, fieldList, fieldText, getStructuredTagType, type GlossaryLink, type StructuredTagFieldDef } from '@/config/structuredTagTypes';
import { GLOSSARY_RELATIONS, glossaryRelation } from '@/config/glossaryRelations';
import { LABELS } from '@/config/labels';
import { compressImageBlob } from '@/utils/imageCompress';
import { acronymLetterPositions } from '@/utils/acronymInference';
import { log, errorMessage } from '@/utils/log';
import { normalizeLinkUrl, openExternalLink } from '@/utils/links';
import type { StructuredTagEntry, StructuredTagEntryId } from '@/types';
import type { GlossaryCardVariant } from './GlossaryCard';
import styles from './GlossaryCard.module.css';

// The card a Glossary card block (GlossaryCard.ts) shows: the record's term, then each field of
// its type's schema (config/structuredTagTypes.ts) drawn by the field's kind, so a new field is
// one schema entry and a new kind of field one renderer below. Empty optional fields wait as
// "+ Example"-style buttons until wanted. Edits are saved to the record after a short pause and
// on leaving the field, never per keystroke (each save syncs).

const L = LABELS.glossaryCard;

interface Props {
  entryId:  string | null;
  variant:  GlossaryCardVariant;
  editable: boolean;
  // Asked by the block (after `\definition`, Enter, a key typed on the selected card): put the
  // cursor in the term and type `text` there. `n` changes per request.
  focusRequest: { n: number; text: string };
  onEscape: () => void;     // Esc in the card selects the block (as in every block)
  onDone:   () => void;     // Ctrl+Enter: what was typed is saved, and the cursor goes to the text after
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

function TextField({ value, onCommit, multiline, placeholder, className, editable, label, inputRef, autoFocus }: {
  value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string; className?: string;
  editable: boolean; label: string; inputRef?: React.RefObject<HTMLInputElement | null>; autoFocus?: boolean;
}) {
  const d = useDraft(value, onCommit);
  if (!editable) return value ? <div className={className}>{value}</div> : null;
  return multiline
    ? <textarea className={`${styles.input} ${className ?? ''}`} value={d.value} placeholder={placeholder} aria-label={label} rows={1} autoFocus={autoFocus}
        onChange={(e) => d.change(e.target.value)} onBlur={d.blur} />
    : <input ref={inputRef} className={`${styles.input} ${className ?? ''}`} value={d.value} placeholder={placeholder} aria-label={label} autoFocus={autoFocus}
        onChange={(e) => d.change(e.target.value)} onBlur={d.blur} />;
}

// A list is edited as lines (one item per line) and shown as bullets, or as `renderItem` draws one.
function ListField({ items, onCommit, placeholder, editable, label, autoFocus, renderItem }: {
  items: string[]; onCommit: (v: string[]) => void; placeholder?: string; editable: boolean; label: string; autoFocus: boolean;
  renderItem?: (item: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(autoFocus);
  const d = useDraft(items.join('\n'), (text) => onCommit(text.split('\n').map((s) => s.trim()).filter(Boolean)));
  if (editable && (editing || items.length === 0)) {
    return (
      <textarea className={`${styles.input} ${styles.listInput}`} value={d.value} placeholder={placeholder} aria-label={label} rows={2} autoFocus={editing}
        onChange={(e) => d.change(e.target.value)} onBlur={() => { d.blur(); setEditing(false); }} />
    );
  }
  return (
    <ul className={styles.list} onClick={() => editable && setEditing(true)}>
      {items.map((item, i) => <li key={i}>{renderItem ? renderItem(item) : item}</li>)}
    </ul>
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

export function GlossaryCardBody({ entryId, variant, editable, focusRequest, onEscape, onDone }: Props) {
  const entries = useNoteStore((s) => s.structuredTagEntries);
  useSecretsVersion((s) => s.version);
  const [shown, setShown] = useState<string[]>([]);
  const [editingExpansion, setEditingExpansion] = useState(false);
  const termRef = useRef<HTMLInputElement>(null);

  // Runs after the card is drawn, so a request made while it was being drawn still lands.
  const { n: focusN, text: focusText } = focusRequest;
  useEffect(() => {
    if (focusN === 0) return;
    const input = termRef.current;
    if (!input) return;
    input.focus();
    // As if typed: through the browser's own editing, so React's onChange sees it.
    if (focusText) document.execCommand?.('insertText', false, focusText);
  }, [focusN, focusText]);

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

  // Leaving a field (blur) saves it, so both keys blur first.
  const keyDown = (e: KeyboardEvent) => {
    const done = e.key === 'Enter' && (e.ctrlKey || e.metaKey);
    if (e.key !== 'Escape' && !done) return;
    e.preventDefault();
    e.stopPropagation();
    (document.activeElement as HTMLElement | null)?.blur();
    if (done) onDone(); else onEscape();
  };

  const hasValue = (f: StructuredTagFieldDef) => {
    const v = entry.fields[f.id];
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== '';
  };
  const isAcronym = entry.typeKey === 'acronym';
  const termField = (
    <TextField value={entry.term} onCommit={(term) => saveEntry(id, { term })} editable={editable} inputRef={termRef}
      className={`${styles.term} ${isAcronym ? styles.acronymTerm : ''}`} placeholder={L.termPlaceholder[entry.typeKey] ?? typeDef.label} label={typeDef.label} />
  );

  function renderField(f: StructuredTagFieldDef, autoFocus: boolean): ReactNode {
    switch (f.type) {
      case 'text':
      case 'textarea':
        if (isAcronym && f.id === 'expansion' && !editingExpansion && entry.term && fieldText(entry.fields, f.id)) {
          return (
            <div className={styles.spelledOut} onClick={() => editable && setEditingExpansion(true)}>
              <SpelledOut term={entry.term} text={fieldText(entry.fields, f.id)} />
            </div>
          );
        }
        return (
          <div onBlur={() => setEditingExpansion(false)}>
            <TextField value={fieldText(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} multiline={f.type === 'textarea'}
              placeholder={f.placeholder} editable={editable} label={f.name} className={f.id === primaryId ? styles.primary : undefined} autoFocus={autoFocus} />
          </div>
        );
      case 'list':
        return <ListField items={fieldList(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus} />;
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
        return <ListField items={fieldList(entry.fields, f.id)} onCommit={(v) => setField(f.id, v)} placeholder={f.placeholder} editable={editable} label={f.name} autoFocus={autoFocus}
          renderItem={(url) => <WebLink url={url} />} />;
    }
  }

  // Split: the term in bold, a rule as tall as the text, then what it means.
  if (variant === 'split') {
    const primary = typeDef.fields.find((f) => f.id === primaryId);
    return (
      <div className={styles.split} data-glossary-type={entry.typeKey} onKeyDown={keyDown}>
        <div className={styles.splitTerm}>{termField}</div>
        <div className={styles.splitRule} aria-hidden="true" />
        <div className={styles.splitBody}>{primary && renderField(primary, false)}</div>
      </div>
    );
  }

  if (variant === 'compact') {
    const primary = typeDef.fields.find((f) => f.id === primaryId);
    return (
      <div className={styles.compact} data-glossary-type={entry.typeKey} onKeyDown={keyDown}>
        {termField}
        <span className={styles.dash} aria-hidden="true">—</span>
        {primary && renderField(primary, false)}
      </div>
    );
  }

  // A sub-concept's parts show on its parent too, so the parent field shows when it has parts.
  const hasParts = all.some((e) => e.id !== entry.id && fieldText(e.fields, 'parentId') === id);
  const visible = typeDef.fields.filter((f) => f.id === primaryId || hasValue(f) || shown.includes(f.id) || (f.type === 'parent' && hasParts) || (f.type === 'links' && all.some((e) => fieldLinks(e.fields, 'related').some((l) => l.entryId === id))));
  const waiting = editable ? typeDef.fields.filter((f) => !visible.includes(f)) : [];

  return (
    <div className={styles.card} data-glossary-type={entry.typeKey} onKeyDown={keyDown}>
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
        <div className={styles.more}>
          {waiting.map((f) => (
            <button key={f.id} type="button" className={styles.addField} onClick={() => setShown((s) => [...s, f.id])}>+ {f.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
