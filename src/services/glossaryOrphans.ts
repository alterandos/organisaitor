import type { Node as PMNode } from '@tiptap/pm/model';
import { useNoteStore } from '@/store/noteStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { liveNotes } from '@/services/liveNoteEditor';
import { glossaryEntry } from '@/services/glossary';
import { askWithCheckbox } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types';

// A Glossary record left in no note (agreed with the user 2026-11-03). A record lives in the
// Glossary, not its note, so taking out its last card, chip or marked text, or deleting the note
// that held it, never deletes it on its own: the person is asked whether to delete it from the
// Glossary too, or keep it there. "Don't ask again" remembers that answer (settingsStore
// `glossaryOrphans`, changed back in Settings → Notes). The one rule for both ways it can happen.
//
// "In a note" means any card, chip, marked text or linked text for it (a conceptRef mark). A
// locked note can't be read, so while one exists a record might be in it: nothing is asked, and
// the record is kept (the safe answer).

export type OrphanAnswer = 'keep' | 'delete' | 'cancel';

// Every record a document shows or links to.
export function entriesInDoc(doc: PMNode): Set<string> {
  const out = new Set<string>();
  doc.descendants((n) => {
    if ((n.type.name === 'glossaryCard' || n.type.name === 'glossaryChip') && n.attrs.entryId) out.add(n.attrs.entryId as string);
    // A kept quote's block shows its record (services/keptQuotes.ts).
    else if (n.type.name === 'quoteBlock' && n.attrs.keptId) out.add(n.attrs.keptId as string);
    else if (n.isText) {
      for (const m of n.marks) {
        if (m.type.name === 'noteTag' && m.attrs.structuredEntryId) out.add(m.attrs.structuredEntryId as string);
        if (m.type.name === 'conceptRef' && m.attrs.entryId) out.add(m.attrs.entryId as string);
      }
    }
    return true;
  });
  return out;
}

// Whether a record is in any note but `except` (whose text the caller has already looked at): the
// open editors read live (their typing may not be saved yet), every other note from its stored
// text. True while a locked note exists, since it might be there.
export function entryInOtherNotes(entryId: string, except: string | null): boolean {
  const live = liveNotes();
  for (const l of live) if (l.noteId !== except && entriesInDoc(l.view.state.doc).has(entryId)) return true;
  for (const raw of Object.values(useNoteStore.getState().notes)) {
    if (raw.id === except) continue;
    if (isNoteLocked(raw)) return true;
    const n = noteView(raw);
    // Each tab from its stored text, but the one open in an editor (read live above).
    const tabs: [string | null, string | null | undefined][] = [[null, n.content], ...n.tabs.map((t): [string, string] => [t.id, t.content])];
    for (const [tabId, content] of tabs) {
      if (live.some((l) => l.noteId === raw.id && l.tabId === tabId)) continue;
      if (content?.includes(entryId)) return true;
    }
  }
  return false;
}

// The records that deleting this note would leave in no note: those it shows or links to, and no
// other note does.
export function entriesOnlyIn(noteId: string): string[] {
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw || isNoteLocked(raw)) return [];
  const live = liveNotes().filter((l) => l.noteId === noteId);
  const n = noteView(raw);
  const ids = new Set<string>();
  for (const l of live) for (const id of entriesInDoc(l.view.state.doc)) ids.add(id);
  for (const id of Object.keys(useNoteStore.getState().structuredTagEntries)) {
    if ([n.content, ...n.tabs.map((t) => t.content)].some((c) => c?.includes(id))) ids.add(id);
  }
  return [...ids].filter((id) => glossaryEntry(id) && !entryInOtherNotes(id, noteId));
}

// Asks (or answers as the setting says) whether records left in no note go from the Glossary too.
// `from`: what took them out, for the wording. 'cancel' only when asked and cancelled.
export async function askAboutOrphans(entryIds: string[], from: 'card' | 'note'): Promise<OrphanAnswer> {
  if (!entryIds.length) return 'keep';
  const setting = useSettingsStore.getState().glossaryOrphans;
  if (setting !== 'ask') return setting;
  const L = LABELS.glossaryOrphans;
  const entries = entryIds.map((id) => glossaryEntry(id)).filter((e): e is NonNullable<typeof e> => !!e);
  if (!entries.length) return 'keep';
  const one = entries.length === 1 ? entries[0] : null;
  const { result, checked } = await askWithCheckbox({
    title:          one ? L.titleOne(one.kindLabel.toLowerCase(), one.term || '…') : L.titleMany(entries.length),
    message:        from === 'note' ? L.messageNote(entries.length) : L.messageCard(entries.length),
    list:           one ? undefined : entries.map((e) => `${e.term || '…'} (${e.kindLabel.toLowerCase()})`),
    confirmLabel:   L.keep,
    alternateLabel: L.delete,
    checkboxLabel:  L.dontAsk,
  });
  if (result === 'cancel') return 'cancel';
  const answer: OrphanAnswer = result === 'confirm' ? 'keep' : 'delete';
  if (checked) useSettingsStore.getState().setGlossaryOrphans(answer);
  return answer;
}
