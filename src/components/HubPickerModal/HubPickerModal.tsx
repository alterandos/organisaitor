import { useMemo, useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { LABELS } from '@/config/labels';
import { HUB_ICON, ITEM_TYPE_ICON } from '@/config/itemIcons';
import { HubIcon } from '@/components/Icons';
import { ItemPickerModal, PickerChoices } from '@/components/ItemPickerModal/ItemPickerModal';
import { rankPicker } from '@/components/ItemPickerModal/rankPicker';
import { listHubs, type HubTarget, type LinkChoice } from '@/services/noteHubs';
import { glossaryEntries, type GlossaryEntry } from '@/services/glossary';
import type { RankField } from '@/utils/suggestRank';
import { RELATIONS, type HubRef, type HubRelation } from '@/utils/noteHubs';
import { noteName } from '@/utils/notes';
import own from './HubPickerModal.module.css';

type Props =
  // Add to hub: which hub a selected passage goes to.
  | { mode: 'hub'; suggestFrom: string; onPick: (target: HubTarget, relation: HubRelation) => void; onClose: () => void }
  // + Link… in a hub: a Glossary term or a note to link into it (not `excludeNoteId`, the hub's own note).
  | { mode: 'link'; suggestFrom: string; excludeNoteId: string | null; onPick: (choice: LinkChoice, relation: HubRelation) => void; onClose: () => void };

type Row =
  | { key: string; kind: 'hub'; hub: HubRef }
  | { key: string; kind: 'new' }
  | { key: string; kind: 'glossary'; entry: GlossaryEntry }
  | { key: string; kind: 'note'; noteId: string; title: string; text: string; updatedAt: string };

const fieldsOf = (r: Row): RankField[] => {
  switch (r.kind) {
    case 'hub':      return [{ text: r.hub.title, weight: 3 }, { text: r.hub.noteTitle, weight: 2 }, { text: `${r.hub.take} ${r.hub.links.map((l) => l.label).join(' ')}`, weight: 1, counted: true }];
    case 'glossary': return [{ text: r.entry.term, weight: 3 }, { text: r.entry.meaning, weight: 1, counted: true }, { text: r.entry.noteTitle, weight: 1 }];
    case 'note':     return [{ text: r.title, weight: 3 }, { text: r.text, weight: 1, counted: true }];
    default:         return [];
  }
};
const recencyOf = (r: Row) => (r.kind === 'glossary' ? Date.parse(r.entry.updatedAt) || 0 : r.kind === 'note' ? Date.parse(r.updatedAt) || 0 : 0);

// Add to hub, and a hub's + Link…: the picker dialog (components/ItemPickerModal), ordered like
// every picker (utils/suggestRank.ts) by the words of what's being linked (the selected text, or
// the hub's name and take), then the most recent. Above the list, how it relates (Related unless
// chosen).
export function HubPickerModal(props: Props) {
  const { mode, suggestFrom, onClose } = props;
  const notesRaw = useNoteStore((s) => s.notes);
  const entriesRaw = useNoteStore((s) => s.structuredTagEntries);
  const notes = useNoteViews();
  const noteTags = useNoteStore((s) => s.noteTags);
  const [query, setQuery] = useState('');
  const [relation, setRelation] = useState<HubRelation>('related');
  const L = LABELS.hubs;
  const excludeNoteId = props.mode === 'link' ? props.excludeNoteId : null;

  const { rows, sections } = useMemo(() => {
    void notesRaw; void entriesRaw;
    let candidates: Row[];
    if (mode === 'hub') {
      candidates = listHubs().map((hub) => ({ key: `hub:${hub.noteId}:${hub.hubId}`, kind: 'hub', hub }));
    } else {
      const terms: Row[] = glossaryEntries().filter((e) => !e.locked && e.term).map((entry) => ({ key: `term:${entry.id}`, kind: 'glossary', entry }));
      const noteRows: Row[] = Object.values(notes)
        .filter((n) => !n.archivedAt && n.id !== excludeNoteId)
        .map((n) => ({ key: `note:${n.id}`, kind: 'note', noteId: n.id, title: noteName(n, noteTags, { untitled: LABELS.mobileNotes.untitled }).full, text: n.abstract ?? '', updatedAt: n.updatedAt }));
      candidates = [...terms, ...noteRows];
    }
    const ranked = rankPicker(candidates, fieldsOf, recencyOf, query, suggestFrom);
    const list = ranked.rows.slice(0, 60);
    const kept = ranked.sections.filter((s) => s.at < list.length);
    if (mode === 'hub') list.push({ key: 'new', kind: 'new' });
    return { rows: list, sections: kept };
  }, [mode, notes, notesRaw, entriesRaw, excludeNoteId, query, suggestFrom, noteTags]);

  const choose = (r: Row) => {
    onClose();
    if (props.mode === 'hub') {
      if (r.kind === 'new') props.onPick({ newHere: true }, relation);
      else if (r.kind === 'hub') props.onPick(r.hub, relation);
    } else if (r.kind === 'glossary') props.onPick({ kind: 'glossary', entryId: r.entry.id, label: r.entry.term }, relation);
    else if (r.kind === 'note') props.onPick({ kind: 'note', noteId: r.noteId, label: r.title }, relation);
  };

  const title = mode === 'hub' ? L.pickerTitle : L.linkPickerTitle;
  const describe = (r: Row): { top: string; path: string | null } => {
    switch (r.kind) {
      case 'hub':      return { top: `${HUB_ICON} ${r.hub.title || L.untitled}`, path: `${r.hub.noteTitle || 'Untitled'} · ${L.linkCount(r.hub.links.length)}` };
      case 'new':      return { top: `＋ ${L.newHere}`, path: null };
      case 'glossary': return { top: `${r.entry.icon} ${r.entry.term}`, path: [r.entry.kindLabel, r.entry.meaning].filter(Boolean).join(' · ') };
      case 'note':     return { top: `${ITEM_TYPE_ICON.note} ${r.title}`, path: L.kinds.note };
    }
  };
  const empty = mode === 'hub' ? (rows.length === 1 ? L.noHubs : null) : rows.length === 0 ? L.noMatches : null;

  return (
    <ItemPickerModal
      label={title}
      heading={<span className={own.title}><HubIcon className={own.icon} /> {title}</span>}
      query={query}
      onQuery={setQuery}
      search={mode === 'hub' ? L.search : L.linkSearch}
      rows={rows}
      sections={sections}
      keyOf={(r) => r.key}
      render={(r) => { const d = describe(r); return { title: d.top, meta: d.path ?? undefined }; }}
      onPick={choose}
      onClose={onClose}
      above={<>
        {empty && mode === 'hub' && <p className={own.empty}>{empty}</p>}
        <PickerChoices label={L.relation} value={relation} onChange={setRelation} options={RELATIONS.map((r) => ({ value: r, label: L.relations[r].label }))} />
      </>}
      empty={mode === 'link' ? empty : null}
      footer={L.footer}
    />
  );
}
