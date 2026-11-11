import { useMemo } from 'react';
import { linksTo, useLinksTo, type IncomingLink } from '@/services/linksTo';

export interface NoteBacklink {
  type:  'task' | 'event' | 'reminder' | 'deadline' | 'list';
  id:    string;
  title: string;
  done:  boolean;   // a completed task, or a reminder/deadline marked done — shown struck through
  tabId?: string;   // the note tab the link is about (CrossAppRef.tabId); absent = the whole note
}

// Everything that links to a note: the references naming it (services/linksTo.ts, the one "what
// links here"), one per item (its first reference), archived items left out. Derived on each
// change, never stored, so it can't disagree with the items themselves.
function backlinks(links: IncomingLink[]): NoteBacklink[] {
  const seen = new Set<string>();
  const out: NoteBacklink[] = [];
  for (const l of links) {
    const key = `${l.type}:${l.id}`;
    if (l.via !== 'reference' || l.archived || seen.has(key)) continue;
    seen.add(key);
    out.push({ type: l.type, id: l.id, title: l.title, done: l.done, ...(l.tabId ? { tabId: l.tabId } : {}) });
  }
  return out;
}

// Same list, read once from the stores (for event handlers and timers, where a hook can't be used).
export function getNoteBacklinks(noteId: string): NoteBacklink[] {
  return backlinks(linksTo('note', noteId));
}

export function useNoteBacklinks(noteId: string | null | undefined): NoteBacklink[] {
  const links = useLinksTo('note', noteId);
  return useMemo(() => backlinks(links), [links]);
}
