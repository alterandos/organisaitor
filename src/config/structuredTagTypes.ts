// Registry of "structured tag types" — built-in annotation tags (see NoteEditor/builtinTags.ts,
// matched by BuiltinTag.typeKey) that carry their own separate, browsable data entity
// (StructuredTagEntry, src/types/notes.ts) instead of just marking a passage. Acronym is the
// first one; a future Definition/Question/etc. type plugs in by adding one more entry here —
// the create-popover (FloatingToolbar.tsx / NoteEditor.tsx), the hover-edit affordance, and
// the Notes TagView browsable list are all written generically against this registry, not
// against Acronym specifically. Full design: "Structured tag entries" in
// docs/features/implemented-features.md.

import { inferAcronymFromSelection } from '@/utils/acronymInference';
import { richToPlain } from '@/utils/richText';
import { inferDefinitionFromSelection } from '@/utils/definitionInference';

// How a field's value is held in StructuredTagEntry.fields, and so how it's shown and edited.
//   text, textarea  a string
//   list            string[]           (key points, examples, sources…)
//   image           a data URL string  (compressed on the way in, utils/imageCompress.ts)
//   parent          an entry id string (a concept's broader concept; its sub-concepts are derived)
//   links           GlossaryLink[]     (typed links to other entries, config/glossaryRelations.ts)
//   urls            string[]           (web addresses: supporting documents, further reading)
//   facts           Fact[]             (label / value rows the user names: Family, Habitat, Born…)
// A new kind of field is a member here, a reader below, and a renderer in GlossaryCardBody.
export type StructuredTagFieldType = 'text' | 'textarea' | 'list' | 'image' | 'parent' | 'links' | 'urls' | 'facts';

export interface Fact { label: string; value: string }

export interface StructuredTagFieldDef {
  id:           string;   // stable key in StructuredTagEntry.fields
  name:         string;
  type:         StructuredTagFieldType;
  placeholder?: string;
}

export interface GlossaryLink { kind: string; entryId: string }

// Readers for a field's value, whatever was stored (an older or hand-edited record may hold
// something else; it reads as empty).
// Text fields may hold a little formatting (utils/richText.ts). These read them plain, for
// everything but the card itself; fieldRich / fieldRichList keep the formatting, for the card.
export const fieldRich = (fields: Record<string, unknown>, id: string): string =>
  typeof fields[id] === 'string' ? (fields[id] as string) : '';
export const fieldRichList = (fields: Record<string, unknown>, id: string): string[] =>
  Array.isArray(fields[id]) ? (fields[id] as unknown[]).filter((v): v is string => typeof v === 'string') : [];
export const fieldText = (fields: Record<string, unknown>, id: string): string => richToPlain(fieldRich(fields, id));
export const fieldList = (fields: Record<string, unknown>, id: string): string[] => fieldRichList(fields, id).map(richToPlain);
// The term with its formatting (H₂O), kept beside the plain term the rest of the app reads;
// ignored once the term has been changed elsewhere without it.
export const TERM_RICH = 'termRich';
export const termRich = (entry: { term: string; fields: Record<string, unknown> }): string | null => {
  const rich = fieldRich(entry.fields, TERM_RICH);
  return rich && richToPlain(rich) === entry.term ? rich : null;
};
export const fieldLinks = (fields: Record<string, unknown>, id: string): GlossaryLink[] =>
  Array.isArray(fields[id])
    ? (fields[id] as unknown[]).filter((v): v is GlossaryLink => !!v && typeof (v as GlossaryLink).kind === 'string' && typeof (v as GlossaryLink).entryId === 'string')
    : [];

export const fieldFacts = (fields: Record<string, unknown>, id: string): Fact[] =>
  Array.isArray(fields[id])
    ? (fields[id] as unknown[]).filter((v): v is Fact => !!v && typeof (v as Fact).label === 'string' && typeof (v as Fact).value === 'string')
    : [];

// Facts as typed: one per line, "Label: value" (a line with no colon is a value with no label).
export function factsFromText(text: string): Fact[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    return i > 0 ? { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() } : { label: '', value: line };
  });
}
export const factsToText = (facts: Fact[]): string => facts.map((f) => (f.label ? `${f.label}: ${f.value}` : f.value)).join('\n');

// A field of the person's own (asked for by the user 2026-10-27): a line written "Name: value" on a
// new line of a card's text field becomes a field of that name, kept in the card's facts field.
// The name is a word or a few (up to 30 characters) starting with a letter, so "10:30" or a web
// address never is. A field's first line never is: it's the field's own text ("Note: …").
export const NAMED_FIELD_ID = 'facts';
export function namedFieldLine(line: string): Fact | null {
  const m = /^\s*(\p{L}[\p{L}\p{N} '’&/()-]{0,29}):\s*(.*)$/u.exec(line);
  if (!m || /\s$/.test(m[1]) || /^https?$/i.test(m[1]) || m[2].startsWith('//')) return null;
  return { label: m[1], value: m[2].trim() };
}

// The "Name: value" lines of a field's formatted text (every line but its first), taken out.
export function takeNamedLines(html: string): { html: string; facts: Fact[] } {
  const lines = html.replace(/<\/?(div|p)\b[^<>]*>/gi, '<br>').split(/<br\s*\/?>/i);
  const first = lines.findIndex((l) => richToPlain(l).trim() !== '');
  const facts: Fact[] = [];
  const kept = lines.filter((l, i) => {
    if (first < 0 || i <= first) return true;
    const fact = namedFieldLine(richToPlain(l));
    if (fact) facts.push(fact);
    return !fact;
  });
  return facts.length ? { html: kept.join('<br>').replace(/(<br>)+$/, ''), facts } : { html, facts };
}

const OWN_FIELDS_PLACEHOLDER = 'One per line, e.g. Origin: Latin';

// The fields the quick create/edit popover shows; the card shows and edits every field.
export const isQuickField = (f: StructuredTagFieldDef) => f.type === 'text' || f.type === 'textarea';

export interface StructuredTagTypeDef {
  key:    string;   // matches BuiltinTag.typeKey
  label:  string;
  fields: StructuredTagFieldDef[];
  // Optional non-AI inference: given the highlighted text and the surrounding paragraph's
  // full text, suggest a term + starting field values. A field left out of the returned
  // `fields` stays blank for the user to fill in manually — inference never fabricates a
  // value it isn't reasonably confident about. Pattern/regex-based only for now (see
  // src/utils/acronymInference.ts); an LLM-backed version is a documented stretch goal,
  // not built here (see BACKLOG.md "Structured tag entries").
  infer?: (selectedText: string, contextText: string) => { term: string; fields: Record<string, string> };
}

export const STRUCTURED_TAG_TYPES: StructuredTagTypeDef[] = [
  {
    key:   'acronym',
    label: 'Acronym',
    fields: [
      { id: 'expansion',   name: 'Stands for',  type: 'text',     placeholder: 'e.g. Australian Stock Exchange' },
      // What it is, when that's worth learning too: then it's also a definition (glossaryKinds).
      { id: 'meaning',     name: 'Means',       type: 'textarea', placeholder: 'What it is, if that’s worth learning too' },
      { id: 'explanation', name: 'Explanation', type: 'textarea', placeholder: 'Optional notes for yourself' },
      { id: 'image',       name: 'Picture',     type: 'image' },
      { id: 'weblinks',    name: 'Links',       type: 'urls',     placeholder: 'A web address, one per line' },
      { id: 'facts',       name: 'Your fields', type: 'facts',    placeholder: OWN_FIELDS_PLACEHOLDER },
    ],
    infer: (selectedText, contextText) => {
      const { term, expansion } = inferAcronymFromSelection(selectedText, contextText);
      return { term, fields: { expansion: expansion ?? '' } };
    },
  },
  // Definition and Concept are the Glossary (components/NotesSection/GlossaryView.tsx): text
  // elsewhere can be linked to one with `\` (a conceptRef mark, drawn with a bracket in the margin).
  {
    key:   'definition',
    label: 'Definition',
    fields: [
      { id: 'meaning', name: 'Means',   type: 'textarea', placeholder: 'What the term means' },
      { id: 'acronym', name: 'Acronym', type: 'text',     placeholder: 'Its short form, e.g. ASX' },
      { id: 'example', name: 'Example', type: 'textarea', placeholder: 'A sentence that uses it' },
      { id: 'image',   name: 'Picture', type: 'image' },
      { id: 'source',  name: 'Source',  type: 'text',     placeholder: 'Where it comes from: a book, a link…' },
      { id: 'weblinks', name: 'Links',  type: 'urls',     placeholder: 'A web address, one per line' },
      { id: 'facts',   name: 'Your fields', type: 'facts', placeholder: OWN_FIELDS_PLACEHOLDER },
    ],
    infer: (selectedText, contextText) => {
      const { term, meaning } = inferDefinitionFromSelection(selectedText, contextText);
      return { term, fields: { meaning } };
    },
  },
  {
    key:   'concept',
    label: 'Concept',
    fields: [
      { id: 'summary',     name: 'In short',          type: 'textarea', placeholder: 'The idea in a sentence' },
      { id: 'acronym',     name: 'Acronym',           type: 'text',     placeholder: 'Its short form, if it has one' },
      { id: 'explanation', name: 'Explanation',       type: 'textarea', placeholder: 'The idea in full' },
      { id: 'keyPoints',   name: 'Key points',        type: 'list',     placeholder: 'A key point' },
      { id: 'examples',    name: 'Examples',          type: 'list',     placeholder: 'An example' },
      { id: 'nonExamples', name: 'Not to be confused with', type: 'list', placeholder: 'Something that looks like it but isn’t' },
      { id: 'image',       name: 'Picture',           type: 'image' },
      { id: 'parentId',    name: 'Part of',           type: 'parent' },
      { id: 'related',     name: 'Related',           type: 'links' },
      { id: 'sources',     name: 'Sources',           type: 'list',     placeholder: 'A book, a link…' },
      { id: 'weblinks',    name: 'Links',             type: 'urls',     placeholder: 'A web address, one per line' },
      { id: 'facts',       name: 'Your fields',       type: 'facts',    placeholder: OWN_FIELDS_PLACEHOLDER },
    ],
    infer: (selectedText, contextText) => {
      const { term, meaning } = inferDefinitionFromSelection(selectedText, contextText);
      return { term, fields: { summary: meaning } };
    },
  },
  // A card about a thing (2026-10-15): a species, a person, a place, a book, a company — anything
  // with a picture and facts of its own, rather than a term with a meaning. In the Glossary, so the
  // same thing can be shown in several notes, linked to, and its name linked as you type.
  {
    key:   'profile',
    label: 'Profile',
    fields: [
      { id: 'summary',  name: 'In short', type: 'textarea', placeholder: 'What it is, in a sentence' },
      { id: 'acronym',  name: 'Acronym',  type: 'text',     placeholder: 'Its short form, e.g. WHO' },
      { id: 'image',    name: 'Picture',  type: 'image' },
      { id: 'facts',    name: 'Facts',    type: 'facts',    placeholder: 'One per line, e.g. Habitat: wetlands' },
      { id: 'about',    name: 'About',    type: 'textarea', placeholder: 'More about it' },
      { id: 'related',  name: 'Related',  type: 'links' },
      { id: 'sources',  name: 'Sources',  type: 'list',     placeholder: 'A book, a link…' },
      { id: 'weblinks', name: 'Links',    type: 'urls',     placeholder: 'A web address, one per line' },
    ],
  },
];

// The types that make up the Glossary, and the field each one's meaning is in.
export const GLOSSARY_TYPES: Record<string, string> = { definition: 'meaning', concept: 'summary', acronym: 'expansion', profile: 'summary' };

export const glossaryMeaning = (entry: { typeKey: string; fields: Record<string, unknown> }): string =>
  fieldText(entry.fields, GLOSSARY_TYPES[entry.typeKey] ?? '');

// A record's names, whichever way it was made (agreed with the user 2026-10-27: an acronym and what
// it stands for are one record, made from either end). An Acronym holds its short form as the term
// and the long one in "Stands for"; a Definition, Concept or Profile holds the long form as the
// term and may hold its short form in "Acronym". Everything that matches, links or lists a term by
// name reads it here, so the two directions can't drift apart.
export interface GlossaryNames { short: string | null; long: string | null }
export function glossaryNames(entry: { typeKey: string; term: string; fields: Record<string, unknown> }): GlossaryNames {
  const clean = (s: string) => s.trim() || null;
  if (entry.typeKey === 'acronym') return { short: clean(entry.term), long: clean(fieldText(entry.fields, 'expansion')) };
  return { short: clean(fieldText(entry.fields, 'acronym')), long: clean(entry.term) };
}

// The kinds a record counts as: its own, plus an acronym when a Definition, Concept or Profile has
// one, plus a definition when an Acronym says what it is. Its own kind still decides its card,
// colour and icon, and never changes.
export function glossaryKinds(entry: { typeKey: string; term: string; fields: Record<string, unknown> }): string[] {
  const kinds = [entry.typeKey];
  if (entry.typeKey !== 'acronym' && glossaryNames(entry).short) kinds.push('acronym');
  if (entry.typeKey === 'acronym' && fieldText(entry.fields, 'meaning').trim()) kinds.push('definition');
  return kinds;
}

export function getStructuredTagType(typeKey: string | null | undefined): StructuredTagTypeDef | undefined {
  return typeKey ? STRUCTURED_TAG_TYPES.find((t) => t.key === typeKey) : undefined;
}
