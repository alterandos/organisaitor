import {
  NAMED_FIELD_ID, fieldFacts, getStructuredTagType, glossaryNames,
  type Fact, type StructuredTagFieldDef,
} from '@/config/structuredTagTypes';
import { richToPlain } from '@/utils/richText';

// Changing a Glossary record's kind (asked for by the user 2026-11-11: a Concept that would have been
// better as a Definition). Pure: what the record becomes. Its fields move to the new kind's:
//   - a field the new kind also has (by id) moves one to one;
//   - its meaning moves to the new kind's meaning field (a Concept's "In short" is a Definition's
//     "Means"), and a few fields with another name are the same thing (Examples / Example, Sources /
//     Source; a list and a text read into each other a line per item);
//   - an Acronym's names change ends: its term is the short form, a Definition's the long one;
//   - anything else that can be written as text becomes a field of the person's own, "Name: value"
//     (a Concept's "Not to be confused with" on a Definition), kept in the facts field, and one of
//     those named as a field of the new kind goes into it;
//   - what can't be text (a picture, links to other records) is kept on the record, out of sight,
//     so changing back brings it back.
// Nothing is lost. The services/glossary.ts changeGlossaryKind applies it.

// Where a kind's meaning is, for moving between kinds (an Acronym's is "Means": its "Stands for" is
// its long name, handled with the names).
const MEANING: Record<string, string> = { definition: 'meaning', concept: 'summary', acronym: 'meaning', profile: 'summary', fact: 'statement', quote: 'text', formula: 'summary', instance: 'example' };

// Fields that are the same thing under another id.
const SAME: string[][] = [['example', 'examples'], ['source', 'sources'], ['explanation', 'about', 'details']];

const TEXTUAL = new Set(['text', 'textarea', 'list', 'urls', 'tags']);
const isList = (f: StructuredTagFieldDef) => f.type === 'list' || f.type === 'urls' || f.type === 'tags';

// A field's value as the target field holds it, or null when it doesn't fit (a picture into text).
function convertValue(value: unknown, from: StructuredTagFieldDef, to: StructuredTagFieldDef): unknown | null {
  if (from.type === to.type) return value;
  if (!TEXTUAL.has(from.type) || !TEXTUAL.has(to.type)) return null;
  const lines = isList(from) ? (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []) : (typeof value === 'string' ? value.split(/<br\s*\/?>|\n/i) : []);
  if (isList(to)) return lines.map((l) => (to.type === 'list' ? l : richToPlain(l))).map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => richToPlain(l).trim()).join(isList(from) ? '<br>' : '\n');
}

const hasValue = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v != null && v !== false);

// A value as one line of a field of the person's own.
function asFactValue(value: unknown, def: StructuredTagFieldDef): string | null {
  if (!TEXTUAL.has(def.type)) return null;
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' ? [value] : [];
  const text = items.map((i) => richToPlain(i).replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ');
  return text || null;
}

export interface KindChange { typeKey: string; term: string; fields: Record<string, unknown> }

export function changeKind(entry: { typeKey: string; term: string; fields: Record<string, unknown> }, toKey: string): KindChange | null {
  const from = getStructuredTagType(entry.typeKey);
  const to = getStructuredTagType(toKey);
  if (!from || !to || from.key === to.key) return null;
  const toById = new Map(to.fields.map((f) => [f.id, f]));
  const out: Record<string, unknown> = {};
  const own: Fact[] = [];
  const moved = new Set<string>();
  const put = (target: StructuredTagFieldDef, value: unknown) => {
    if (!hasValue(value) || hasValue(out[target.id])) return false;
    out[target.id] = value;
    return true;
  };

  // The names first: an Acronym's term is its short form.
  const names = glossaryNames(entry);
  let term = entry.term;
  if (from.key === 'acronym' && to.key !== 'acronym') {
    term = names.long ?? entry.term;
    if (names.long && names.short && toById.has('acronym')) out.acronym = names.short;
    moved.add('expansion');
  } else if (to.key === 'acronym' && from.key !== 'acronym') {
    term = names.short ?? entry.term;
    if (names.short) { out.expansion = names.long ?? entry.term; moved.add('acronym'); }
    else out.expansion = '';
  }

  for (const def of from.fields) {
    if (moved.has(def.id) || def.id === NAMED_FIELD_ID) continue;
    const value = entry.fields[def.id];
    if (!hasValue(value)) continue;
    const targets: (StructuredTagFieldDef | undefined)[] = [
      toById.get(def.id),
      MEANING[from.key] === def.id ? toById.get(MEANING[to.key]) : undefined,
      ...(SAME.find((g) => g.includes(def.id)) ?? []).filter((id) => id !== def.id).map((id) => toById.get(id)),
    ];
    let done = false;
    for (const target of targets) {
      if (!target) continue;
      const v = convertValue(value, def, target);
      if (v !== null && put(target, v)) { done = true; break; }
    }
    if (done) continue;
    const text = asFactValue(value, def);
    if (text) own.push({ label: def.name, value: text });
    else out[def.id] = value;   // kept, out of sight (a picture, links), for changing back
  }

  // What isn't a field of either kind (the term's formatting, its importance, its flags) stays.
  for (const [id, value] of Object.entries(entry.fields)) {
    if (id === NAMED_FIELD_ID || from.fields.some((f) => f.id === id) || id in out) continue;
    out[id] = value;
  }
  // A field of the person's own named as one of the new kind's fields goes into it (so changing
  // back puts a Concept's "Not to be confused with" back where it was).
  const byName = new Map(to.fields.filter((f) => TEXTUAL.has(f.type)).map((f) => [f.name.toLowerCase(), f]));
  const facts = [...fieldFacts(entry.fields, NAMED_FIELD_ID), ...own].filter((f) => {
    const target = byName.get(f.label.trim().toLowerCase());
    return !(target && put(target, isList(target) ? f.value.split('; ').filter(Boolean) : f.value));
  });
  if (facts.length) out[NAMED_FIELD_ID] = facts;
  // The term's formatting holds only while the term is the same.
  if (term !== entry.term) delete out.termRich;
  return { typeKey: to.key, term, fields: out };
}

