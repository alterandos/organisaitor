import { describe, expect, it } from 'vitest';
import { activityIsEmpty, noteIsEmpty, richTextIsEmpty } from './emptyContent';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { useDialogStore } from '@/store/dialogStore';

const doc = (...content: unknown[]) => JSON.stringify({ type: 'doc', content });
const para = (text?: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });

describe('what counts as empty when deleting', () => {
  it('rich text: only empty lines and whitespace are empty; any block or picture is content', () => {
    expect(richTextIsEmpty('')).toBe(true);
    expect(richTextIsEmpty(doc(para(), para('   ')))).toBe(true);
    expect(richTextIsEmpty(doc({ type: 'section', content: [para()] }))).toBe(true);
    expect(richTextIsEmpty(doc(para('Hi')))).toBe(false);
    expect(richTextIsEmpty(doc({ type: 'image', attrs: { pictureId: 'p1' } }))).toBe(false);
    expect(richTextIsEmpty(doc({ type: 'timeline', content: [] }))).toBe(false);
  });

  it('a note: no title, abstract or text on any tab, no sub-notes, and not encrypted', () => {
    const note = { isEncrypted: false, title: '', abstract: null, content: doc(para()), tabs: [{ id: 't', name: 'Tab 2', content: '' }] };
    expect(noteIsEmpty(note, false)).toBe(true);
    expect(noteIsEmpty(note, true)).toBe(false);
    expect(noteIsEmpty({ ...note, title: 'Draft' }, false)).toBe(false);
    expect(noteIsEmpty({ ...note, tabs: [{ id: 't', name: 'Tab 2', content: doc(para('x')) }] }, false)).toBe(false);
    expect(noteIsEmpty({ ...note, isEncrypted: true }, false)).toBe(false);   // can't tell: asks
  });

  it('confirmDelete with empty: true resolves at once, without a dialog', async () => {
    useDialogStore.setState({ queue: [] });
    await expect(confirmDelete('note', '', undefined, { empty: true })).resolves.toBe(true);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });
});

describe('an activity with nothing recorded', () => {
  const blank = { source: 'manual' as const, distanceMeters: null, movingTimeSeconds: null, elapsedTimeSeconds: null, notes: null, data: {} };
  it('is empty; any measurement, note, field value or import is content', () => {
    expect(activityIsEmpty(blank)).toBe(true);
    expect(activityIsEmpty({ ...blank, distanceMeters: 5000 })).toBe(false);
    expect(activityIsEmpty({ ...blank, notes: 'felt good' })).toBe(false);
    expect(activityIsEmpty({ ...blank, data: { rpe: 7 } })).toBe(false);
    expect(activityIsEmpty({ ...blank, source: 'strava' as const })).toBe(false);
  });
});
