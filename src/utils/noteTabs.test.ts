import { describe, expect, it } from 'vitest';
import { resolveNoteTab, titlePrefillFor } from './noteTabs';

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
