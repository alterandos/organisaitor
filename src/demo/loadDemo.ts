// Loads the demo account into the running app: no backup file. Everything on this device and in
// the signed-in account is replaced by the demo semester, dated from today, with the pictures in
// ./resources and the per-device touches that make it look lived in (sticky notes, recent items,
// Notes open on "Start here"). Reached from the Account pane in development builds only, and
// refused in an account whose email doesn't contain "demo". See docs/agent-tasks/07-demo-account.md.
//
// The wipe runs WITH sync live, unlike sign-out (services/signOut.ts): here deleting the account's
// old records in the cloud is the point, so the watchers push those deletions, then the new records.
import { buildDemoAccount, type DemoAccount, type DemoPictures } from './demoAccount';
import { clearSyncedLocalData } from '@/services/clearLocalData';
import { flushOpenNoteEditors } from '@/services/liveNoteEditor';
import { addPicture, setBackdrop } from '@/services/pictures';
import { addSticky, docForText, setStickyContent, stickyDocOf } from '@/services/stickyNotes';
import { ensureScratchpad } from '@/services/scratchpad';
import { useAuthStore } from '@/store/authStore';
import { useFitnessStore } from '@/store/fitnessStore';
import { useRoutineStore } from '@/store/routineStore';
import { useStickyStore, type StickyPlace } from '@/store/stickyStore';
import { useRecentItemsStore } from '@/store/recentItemsStore';
import { useUIStore } from '@/store/uiStore';
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { showToast } from '@/components/Toast/showToast';
import { LABELS } from '@/config/labels';
import type { PictureId } from '@/types';

const L = LABELS.demo;

// The pictures in ./resources, by file name without its extension (see its README for the slots).
const FILES = import.meta.glob<string>('./resources/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' });
const fileFor = (slot: string): string | null =>
  Object.entries(FILES).find(([path]) => path.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase() === slot)?.[1] ?? null;

async function picture(slot: string, origin: 'backdrop' | 'note' | 'card'): Promise<PictureId | undefined> {
  const url = fileFor(slot);
  if (!url) return undefined;
  return addPicture(await (await fetch(url)).blob(), { encrypted: false, origin });
}

// Asks first; true when the demo was loaded.
export async function loadDemoAsked(): Promise<boolean> {
  const email = useAuthStore.getState().user?.email ?? null;
  if (email && !email.toLowerCase().includes('demo')) {
    await alertDialog(L.notDemo(email));
    return false;
  }
  const ok = await confirmDialog({ title: L.confirmTitle, message: L.confirmMessage(email ?? L.thisDevice), confirmLabel: L.confirmLabel, destructive: true, irreversible: true });
  if (!ok) return false;
  await loadDemo(new Date());
  showToast({ message: L.loaded });
  return true;
}

export async function loadDemo(today: Date): Promise<void> {
  // An open note would save its text back after the wipe.
  flushOpenNoteEditors();
  useUIStore.getState().closeNote();
  clearSyncedLocalData();
  useFitnessStore.setState({ activities: {} });
  useRoutineStore.setState({ instances: {} });
  useStickyStore.setState({ places: {} });

  const base = new Date(today);
  base.setHours(9, 0, 0, 0);
  const [university, geos201, geos215, quartz, kiama] = await Promise.all([
    picture('university', 'backdrop'), picture('geos201', 'backdrop'), picture('geos215', 'backdrop'),
    picture('quartz', 'card'), picture('kiama', 'note'),
  ]);
  const pictures: DemoPictures = { quartz, kiama };
  const demo = buildDemoAccount(base, pictures);
  for (const [notebook, pictureId] of [[demo.notebooks.university, university], [demo.notebooks.geos201, geos201], [demo.notebooks.geos215, geos215]] as const) {
    if (pictureId) await setBackdrop({ kind: 'notebook', id: notebook }, { kind: 'picture', pictureId });
  }
  livedIn(demo, base);
}

// What a real person's device would have: stickies on the screen, recent places, the last note open.
function livedIn(demo: DemoAccount, base: Date) {
  const tripDay = new Date(base);
  tripDay.setDate(tripDay.getDate() + 4);
  const stickies: [string, Partial<StickyPlace>][] = [
    [`Field trip ${tripDay.toLocaleDateString(undefined, { weekday: 'long' })}: bus at 7:00. Hand lens!`, { x: 0.76, y: 0.1, design: 'pin' }],
    ['Ask about the essay word limit (does the reference list count?)', { x: 0.72, y: 0.34, design: 'tape' }],
  ];
  for (const [text, place] of stickies) {
    const id = addSticky();
    const doc = stickyDocOf(docForText(text));
    if (doc) setStickyContent(id, doc);
    useStickyStore.getState().setPlace(id, place);
  }
  // The scratchpad (Alt+P): a few things jotted down in passing.
  const pad = stickyDocOf(docForText([
    'Room 3.14 for the GEOS215 tute (moved!)',
    'Library card PIN reset: ask at the desk',
    'Sam: borrow the field notebook back before Thursday',
  ].join('\n')));
  if (pad) setStickyContent(ensureScratchpad(), pad, true);

  const recent = useRecentItemsStore.getState();
  for (const id of [demo.notes.hub, demo.notes.minerals, demo.notes.trip, demo.notes.carbon, demo.notes.essay]) recent.recordVisit('note', id);
  recent.recordVisit('notebook', demo.notebooks.geos215);
  recent.recordVisit('task', demo.tasks.draft);
  recent.recordVisit('place', 'glossary');
  recent.recordVisit('note', demo.notes.welcome);

  const ui = useUIStore.getState();
  ui.setActiveView('notes');
  ui.setSelectedNoteTag(demo.notebooks.university);
  ui.openNote(demo.notes.welcome);
}
