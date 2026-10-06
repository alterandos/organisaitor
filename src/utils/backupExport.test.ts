import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploaded } = vi.hoisted(() => ({ uploaded: { notes: null as unknown, schedules: null as unknown } }));

vi.mock('@/services/sync/syncService', async () => {
  const { useNoteStore } = await import('@/store/noteStore');
  const { useScheduleStore } = await import('@/store/scheduleStore');
  return {
    // Captures what a real forceUpload would read: the stores' live in-memory state.
    forceUpload: vi.fn(async () => {
      uploaded.notes = useNoteStore.getState().notes;
      uploaded.schedules = useScheduleStore.getState().schedules;
      return {};
    }),
    markRestored: vi.fn(async () => {}),
  };
});

import { restoreBackupData } from './backupExport';
import { useNoteStore } from '@/store/noteStore';
import { useScheduleStore } from '@/store/scheduleStore';

const OLD_NOTE = { id: 'n1', title: 'Old title (from the backup)' };
const NEW_NOTE = { id: 'n1', title: 'New title (edited today)' };

describe('restoreBackupData', () => {
  beforeEach(() => {
    uploaded.notes = null;
    uploaded.schedules = null;
  });

  // Bug found 2026-10-05: only tasks/calendar/trackers were rehydrated before forceUpload, so a
  // signed-in restore uploaded TODAY's notes (and lists, schedules, …) over the restored ones.
  it('uploads the restored notes and schedules, not what was in memory before the restore', async () => {
    useNoteStore.setState({ notes: { n1: NEW_NOTE } as never });
    useScheduleStore.setState({ schedules: { s1: { id: 's1', name: 'Today' } } as never });

    const noteVersion = useNoteStore.persist.getOptions().version;
    const scheduleVersion = useScheduleStore.persist.getOptions().version;
    await restoreBackupData({
      'notes-storage': { state: { ...useNoteStore.getState(), notes: { n1: OLD_NOTE } }, version: noteVersion },
      'todo-schedules': { state: { schedules: { s1: { id: 's1', name: 'From backup' } } }, version: scheduleVersion },
    }, 'user-1');

    expect((uploaded.notes as Record<string, { title: string }>).n1.title).toBe(OLD_NOTE.title);
    expect((uploaded.schedules as Record<string, { name: string }>).s1.name).toBe('From backup');
  });
});
