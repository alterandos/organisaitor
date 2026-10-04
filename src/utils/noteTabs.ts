import type { Note } from '@/types/notes';

// The main tab has no NoteTab record of its own; this is its id wherever a tab is named by id
// (Note.tabOrder, CrossAppRef.tabId).
export const MAIN_TAB_ID = '__main__';

type NoteWithTabs = Pick<Note, 'tabs' | 'mainTabName'>;

// What to store as CrossAppRef.tabId when linking to a note from the given tab (null = main tab).
// Notes without extra tabs get no tabId, so the link stays "the whole note" and keeps working
// unchanged if tabs are added later.
export function linkTabIdFor(note: Pick<Note, 'tabs'> | undefined, activeTabId: string | null): string | undefined {
  if (!note || note.tabs.length === 0) return undefined;
  return activeTabId ?? MAIN_TAB_ID;
}

// A link's tab as it applies now: a link naming a tab that has since been deleted falls back to the
// main tab. undefined (a whole-note link) stays undefined.
export function effectiveLinkTabId(note: Pick<Note, 'tabs'>, tabId: string | undefined): string | undefined {
  if (!tabId) return undefined;
  return tabId === MAIN_TAB_ID || note.tabs.some((t) => t.id === tabId) ? tabId : MAIN_TAB_ID;
}

export function tabNameOf(note: NoteWithTabs, tabId: string | undefined): string | null {
  if (!tabId) return null;
  if (tabId === MAIN_TAB_ID) return note.mainTabName || 'Main';
  return note.tabs.find((t) => t.id === tabId)?.name ?? null;
}

// The tab to show and the content that belongs to it, always as a pair. The editor saves whatever
// it is showing under whichever tab it thinks is active, so loading one tab's content while another
// tab is marked active overwrites that tab (reported 2026-09-30: Alt+Left/Right restored a note's
// last tab but loaded its main content, and the next save wrote main over that tab). A tab that no
// longer exists resolves to the main tab (null), content included.
export function resolveNoteTab(note: Pick<Note, 'tabs' | 'content'>, tabId: string | null): { tabId: string | null; content: string } {
  const tab = tabId ? note.tabs.find((t) => t.id === tabId) : undefined;
  return tab ? { tabId: tab.id, content: tab.content } : { tabId: null, content: note.content };
}

// What a new Title starts as (the Title is independent of the tab name afterwards). A tab's own
// name; for the Main tab — usually just called "Main" — the note's title, unless the Main tab has
// been given a name of its own.
export function titlePrefillFor(note: Pick<Note, 'title' | 'tabs' | 'mainTabName'>, tabId: string | null): string {
  if (tabId) return note.tabs.find((t) => t.id === tabId)?.name ?? '';
  return note.mainTabName && note.mainTabName !== 'Main' ? note.mainTabName : note.title;
}
