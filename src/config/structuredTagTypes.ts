// Registry of "structured tag types" — built-in annotation tags (see NoteEditor/builtinTags.ts,
// matched by BuiltinTag.typeKey) that carry their own separate, browsable data entity
// (StructuredTagEntry, src/types/notes.ts) instead of just marking a passage. Acronym is the
// first one; a future Definition/Question/etc. type plugs in by adding one more entry here —
// the create-popover (FloatingToolbar.tsx / NoteEditor.tsx), the hover-edit affordance, and
// the Notes TagView browsable list are all written generically against this registry, not
// against Acronym specifically. See CLAUDE.md "Structured tag entries" for the full design.

import { inferAcronymFromSelection } from '@/utils/acronymInference';
import { inferDefinitionFromSelection } from '@/utils/definitionInference';

export type StructuredTagFieldType = 'text' | 'textarea';

export interface StructuredTagFieldDef {
  id:           string;   // stable key in StructuredTagEntry.fields
  name:         string;
  type:         StructuredTagFieldType;
  placeholder?: string;
}

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
      { id: 'meaning', name: 'Means', type: 'textarea', placeholder: 'What the term means' },
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
      { id: 'summary', name: 'In short', type: 'textarea', placeholder: 'The idea in a sentence' },
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
  String(entry.fields[GLOSSARY_TYPES[entry.typeKey] ?? ''] ?? '');

export function getStructuredTagType(typeKey: string | null | undefined): StructuredTagTypeDef | undefined {
  return typeKey ? STRUCTURED_TAG_TYPES.find((t) => t.key === typeKey) : undefined;
}
