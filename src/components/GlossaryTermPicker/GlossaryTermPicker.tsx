import { useMemo, useState } from 'react';
import { LABELS } from '@/config/labels';
import { GLOSSARY_RELATIONS } from '@/config/glossaryRelations';
import { useNoteStore } from '@/store/noteStore';
import { ItemPickerModal, PickerChoices } from '@/components/ItemPickerModal/ItemPickerModal';
import { rankPicker } from '@/components/ItemPickerModal/rankPicker';
import { glossaryEntries, type GlossaryEntry } from '@/services/glossary';
import type { RankField } from '@/utils/suggestRank';

// A Glossary card's Related field, "+ Link…": another Glossary entry to link to and how it relates
// (asked for by the user 2026-11-11: the two dropdowns couldn't be searched). A configuration of
// the one picker dialog (components/ItemPickerModal), ordered like every picker by the words of
// the card's own term, then the most recent.

interface Props {
  // The card's own entry, and those it already links to: not offered.
  selfId:      string;
  exclude:     readonly string[];
  suggestFrom: string;
  onPick:      (entryId: string, kind: string) => void;
  onClose:     () => void;
  relation?:   string;   // how it relates, chosen at first (an Example's links: exampleOf)
}

const fieldsOf = (e: GlossaryEntry): RankField[] => [
  { text: [e.term, e.short, e.long].filter(Boolean).join(' '), weight: 3 },
  { text: e.meaning, weight: 1, counted: true },
  { text: e.noteTitle, weight: 1 },
];

export function GlossaryTermPicker({ selfId, exclude, suggestFrom, onPick, onClose, relation }: Props) {
  const L = LABELS.glossaryCard;
  const entriesRaw = useNoteStore((s) => s.structuredTagEntries);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState(relation ?? GLOSSARY_RELATIONS[0].kind);
  const { rows, sections } = useMemo(() => {
    void entriesRaw;
    const candidates = glossaryEntries().filter((e) => !e.locked && e.term && e.id !== selfId && !exclude.includes(e.id));
    return rankPicker(candidates, fieldsOf, (e) => Date.parse(e.updatedAt) || 0, query, suggestFrom);
  }, [entriesRaw, selfId, exclude, query, suggestFrom]);

  return (
    <ItemPickerModal
      label={L.linkTermTitle}
      heading={L.linkTermTitle}
      query={query}
      onQuery={setQuery}
      search={L.linkTermSearch}
      rows={rows}
      sections={sections}
      keyOf={(e) => e.id}
      render={(e) => ({ title: <>{e.icon} {e.term}</>, meta: e.meaning ? `${e.kindLabel} · ${e.meaning}` : e.kindLabel })}
      onPick={(e) => { onPick(e.id, kind); onClose(); }}
      onClose={onClose}
      above={<PickerChoices label={L.linkTermRelation} value={kind} onChange={setKind} options={GLOSSARY_RELATIONS.map((r) => ({ value: r.kind, label: r.label }))} />}
      empty={rows.length === 0 ? L.linkTermNone : null}
      footer={L.linkTermFooter}
    />
  );
}
