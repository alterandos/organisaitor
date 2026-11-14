import { LABELS } from '@/config/labels';

// How one Glossary entry can relate to another (a concept's Related field, links: GlossaryLink[]).
// Stored once, on the entry that names the link; the other entry shows it from its side using
// `inverse` (so "A is a type of B" reads "B has the type A"). A new relation is one entry here,
// plus its labels in LABELS.glossaryCard.relations. "Part of" was a field of its own until 2026-11-14 (the
// user: folded into Related); a concept's old parent is read as a partOf link (fieldLinks).
export interface GlossaryRelation {
  kind:    string;
  label:   string;   // "type of"
  inverse: string;   // seen from the other entry: "has the type"
}

const R = LABELS.glossaryCard.relations;

export const GLOSSARY_RELATIONS: GlossaryRelation[] = [
  { kind: 'typeOf',        label: R.typeOf,        inverse: R.typeOfInverse },
  { kind: 'partOf',        label: R.partOf,        inverse: R.partOfInverse },
  { kind: 'dependsOn',     label: R.dependsOn,     inverse: R.dependsOnInverse },
  { kind: 'contrastsWith', label: R.contrastsWith, inverse: R.contrastsWith },
  { kind: 'exampleOf',     label: R.exampleOf,     inverse: R.exampleOfInverse },
  { kind: 'related',       label: R.related,       inverse: R.related },
];

export const glossaryRelation = (kind: string): GlossaryRelation =>
  GLOSSARY_RELATIONS.find((r) => r.kind === kind) ?? GLOSSARY_RELATIONS[GLOSSARY_RELATIONS.length - 1];
