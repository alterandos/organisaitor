import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteStore } from '@/store/noteStore';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T09:00:00.000Z'));
  useNoteStore.setState(useNoteStore.getInitialState(), true);
});
afterEach(() => vi.useRealTimers());

describe("a note's tabs remember when they were made and changed", () => {
  it('a new note: its main tab was made and changed now', () => {
    const id = useNoteStore.getState().addNote({ title: 'N' });
    expect(useNoteStore.getState().notes[id].mainTabUpdatedAt).toBe('2026-10-08T09:00:00.000Z');
  });

  it("changing the main tab's content stamps it; other changes don't", () => {
    const id = useNoteStore.getState().addNote({ title: 'N' });
    vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));
    useNoteStore.getState().updateNote(id, { title: 'Renamed' });
    expect(useNoteStore.getState().notes[id].mainTabUpdatedAt).toBe('2026-10-08T09:00:00.000Z');
    useNoteStore.getState().updateNote(id, { content: '{"type":"doc"}' });
    expect(useNoteStore.getState().notes[id].mainTabUpdatedAt).toBe('2026-10-09T12:00:00.000Z');
  });

  it('a tab: made when added, changed when its content changes (not when renamed)', () => {
    const id = useNoteStore.getState().addNote({ title: 'N' });
    const tabId = useNoteStore.getState().addNoteTab(id, 'T');
    vi.setSystemTime(new Date('2026-10-10T07:00:00.000Z'));
    useNoteStore.getState().renameNoteTab(id, tabId, 'T2');
    expect(useNoteStore.getState().notes[id].tabs[0]).toMatchObject({ createdAt: '2026-10-08T09:00:00.000Z', updatedAt: '2026-10-08T09:00:00.000Z' });
    useNoteStore.getState().updateNoteTabContent(id, tabId, '{}');
    expect(useNoteStore.getState().notes[id].tabs[0].updatedAt).toBe('2026-10-10T07:00:00.000Z');
  });
});
