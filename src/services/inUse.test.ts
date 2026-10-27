import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { endeavourInUse, purposeInUse, tagInUse } from './inUse';
import type { NoteId, TagId } from '@/types';

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
});

describe('whether an Endeavour, Purpose or tag is used (deleting an unused one doesn’t ask)', () => {
  it('an Endeavour is used by a task, or by a note in another app', () => {
    const tasks = useTaskStore.getState();
    const e = tasks.addCollection({ kind: 'project', name: 'Thesis' });
    expect(endeavourInUse(e)).toBe(false);
    const note = useNoteStore.getState().addNote({ title: 'Plan' }) as NoteId;
    useNoteStore.getState().updateNote(note, { collectionId: e });
    expect(endeavourInUse(e)).toBe(true);
  });

  it('a Purpose and a tag are used once a task carries them', () => {
    const tasks = useTaskStore.getState();
    const p = tasks.addPurpose({ name: 'Health' });
    const tag = { id: 'tag-1' as TagId, name: 'Urgent', color: null, notes: null };
    tasks.addTag(tag);
    expect(purposeInUse(p)).toBe(false);
    expect(tagInUse(tag.id)).toBe(false);
    tasks.addTask({ title: 'Run', purposeIds: [p], tagIds: [tag.id] });
    expect(purposeInUse(p)).toBe(true);
    expect(tagInUse(tag.id)).toBe(true);
  });
});
