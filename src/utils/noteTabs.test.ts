import { describe, expect, it } from 'vitest';
import { MAIN_TAB_ID, resolveNoteTab, tabDatesText, titlePrefillFor } from './noteTabs';

const note = { content: 'MAIN', tabs: [{ id: 't2', name: 'Second', content: 'TAB2' }] };

describe('resolveNoteTab', () => {
  it('pairs the main tab (null) with the note content', () => {
    expect(resolveNoteTab(note, null)).toEqual({ tabId: null, content: 'MAIN' });
  });
  it('pairs an existing tab with that tab\'s content', () => {
    expect(resolveNoteTab(note, 't2')).toEqual({ tabId: 't2', content: 'TAB2' });
  });
  it('falls back to main — id AND content — for a tab that no longer exists', () => {
    expect(resolveNoteTab(note, 'gone')).toEqual({ tabId: null, content: 'MAIN' });
  });
});

describe('titlePrefillFor', () => {
  const n = { title: 'Biology 101', mainTabName: 'Main', tabs: [{ id: 't2', name: 'Exams', content: '' }] };
  it('uses the tab name for an extra tab', () => expect(titlePrefillFor(n, 't2')).toBe('Exams'));
  it('uses the note title for an unrenamed Main tab', () => expect(titlePrefillFor(n, null)).toBe('Biology 101'));
  it('uses the Main tab\'s own name once renamed', () => expect(titlePrefillFor({ ...n, mainTabName: 'Overview' }, null)).toBe('Overview'));
});

describe('tabDatesText (a tab\'s hover in the tab bar)', () => {
  const note = {
    createdAt: '2026-10-01T09:00:00.000Z',
    mainTabUpdatedAt: '2026-10-08T10:30:00.000Z',
    tabs: [
      { id: 't1', name: 'New', content: '', createdAt: '2026-10-05T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z' },
      { id: 'old', name: 'Old', content: '' },
    ],
  };
  it('the main tab: created with the note, modified when its content last changed', () => {
    expect(tabDatesText(note, null)).toMatch(/^Created .*2026.* · Modified .*2026/);
    expect(tabDatesText(note, MAIN_TAB_ID)).toBe(tabDatesText(note, null));
  });
  it('a tab: its own dates; a tab from before they were kept says so', () => {
    expect(tabDatesText(note, 't1')).not.toContain('not recorded');
    expect(tabDatesText(note, 'old')).toBe('Created not recorded · Modified not recorded');
    expect(tabDatesText({ ...note, mainTabUpdatedAt: null }, null)).toMatch(/Modified not recorded$/);
  });
});

