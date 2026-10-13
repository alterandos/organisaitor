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
// A new kind of field is a member here, a reader below, and a renderer in GlossaryCardBody.
export type StructuredTagFieldType = 'text' | 'textarea' | 'list' | 'image' | 'parent' | 'links' | 'urls';

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
      { id: 'explanation', name: 'Explanation', type: 'textarea', placeholder: 'Optional notes for yourself' },
      { id: 'image',       name: 'Picture',     type: 'image' },
      { id: 'weblinks',    name: 'Links',       type: 'urls',     placeholder: 'A web address, one per line' },
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
      { id: 'example', name: 'Example', type: 'textarea', placeholder: 'A sentence that uses it' },
      { id: 'image',   name: 'Picture', type: 'image' },
      { id: 'source',  name: 'Source',  type: 'text',     placeholder: 'Where it comes from: a book, a link…' },
      { id: 'weblinks', name: 'Links',  type: 'urls',     placeholder: 'A web address, one per line' },
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
      { id: 'explanation', name: 'Explanation',       type: 'textarea', placeholder: 'The idea in full' },
      { id: 'keyPoints',   name: 'Key points',        type: 'list',     placeholder: 'A key point' },
      { id: 'examples',    name: 'Examples',          type: 'list',     placeholder: 'An example' },
      { id: 'nonExamples', name: 'Not to be confused with', type: 'list', placeholder: 'Something that looks like it but isn’t' },
      { id: 'image',       name: 'Picture',           type: 'image' },
      { id: 'parentId',    name: 'Part of',           type: 'parent' },
      { id: 'related',     name: 'Related',           type: 'links' },
      { id: 'sources',     name: 'Sources',           type: 'list',     placeholder: 'A book, a link…' },
      { id: 'weblinks',    name: 'Links',             type: 'urls',     placeholder: 'A web address, one per line' },
    ],
    infer: (selectedText, contextText) => {
      const { term, meaning } = inferDefinitionFromSelection(selectedText, contextText);
      return { term, fields: { summary: meaning } };
    },
  },
];

// The types that make up the Glossary, and the field each one's meaning is in.
export const GLOSSARY_TYPES: Record<string, string> = { definition: 'meaning', concept: 'summary', acronym: 'expansion' };

export const glossaryMeaning = (entry: { typeKey: string; fields: Record<string, unknown> }): string =>
  fieldText(entry.fields, GLOSSARY_TYPES[entry.typeKey] ?? '');

export function getStructuredTagType(typeKey: string | null | undefined): StructuredTagTypeDef | undefined {
  return typeKey ? STRUCTURED_TAG_TYPES.find((t) => t.key === typeKey) : undefined;
}
