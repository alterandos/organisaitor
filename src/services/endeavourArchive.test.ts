// Archiving an Endeavour with parts asks (services/endeavourArchive.ts); moving one asks about its
// notebooks (services/endeavourNotebooks.ts). Nothing to ask about, nothing asked.
import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useDialogStore } from '@/store/dialogStore';
import { archiveEndeavourAsked } from './endeavourArchive';
import { askToMoveNotebooks } from './endeavourNotebooks';
import type { CollectionId, NoteTagId } from '@/types';

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useDialogStore.setState({ queue: [] });
});

const make = (name: string, partOf?: CollectionId) => {
  const id = useTaskStore.getState().addCollection({ kind: 'project', name });
  if (partOf) useTaskStore.getState().addEndeavourLink(id, 'partOf', partOf);
  return id;
};
const answer = async (r: 'confirm' | 'alternate' | 'cancel') => {
  await Promise.resolve();
  const q = useDialogStore.getState().queue[0];
  expect(q).toBeDefined();
  useDialogStore.getState().settle(q.id, r);
};

describe('archiving an Endeavour with parts', () => {
  it('one with no parts is archived without asking', async () => {
    const a = make('Old');
    await archiveEndeavourAsked(a, true);
    expect(useTaskStore.getState().collections[a].archivedAt).not.toBeNull();
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('asks; “Archive all” takes its parts too, “Just this one” leaves them', async () => {
    const sem = make('Sem');
    const bio = make('Bio', sem);
    let done = archiveEndeavourAsked(sem, true);
    await answer('alternate');
    await done;
    expect(useTaskStore.getState().collections[bio].archivedAt).toBeNull();
    await archiveEndeavourAsked(sem, false);   // restoring: Bio isn't archived, so nothing to ask
    done = archiveEndeavourAsked(sem, true);
    await answer('confirm');
    await done;
    expect(useTaskStore.getState().collections[bio].archivedAt).not.toBeNull();
  });
});

describe('moving an Endeavour asks about its notebooks', () => {
  it('offers to move its notebook into its new parent’s; nothing to move, nothing asked', async () => {
    const sem = make('Sem');
    const bio = make('Bio');
    const semNb = useNoteStore.getState().addNoteTag({ name: 'Sem', kind: 'area', collectionId: sem, parentTagId: null });
    const bioNb = useNoteStore.getState().addNoteTag({ name: 'Bio', kind: 'area', collectionId: bio, parentTagId: null });
    useTaskStore.getState().addEndeavourLink(bio, 'partOf', sem);
    const asked = askToMoveNotebooks(bio);
    await answer('confirm');
    expect(await asked).toBe(true);
    expect(useNoteStore.getState().noteTags[bioNb as NoteTagId].parentTagId).toBe(semNb);
    expect(await askToMoveNotebooks(bio)).toBe(false);
  });
});
