// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ScratchpadPanel } from './ScratchpadPanel';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { scratchpadNote } from '@/services/scratchpad';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState({ ...useUIStore.getInitialState(), scratchpadOpen: true }, true);
  useSettingsStore.setState({ scratchpadDesign: 'paper' });
});
afterEach(() => { cleanup(); });

describe('ScratchpadPanel', () => {
  it('makes its note the first time, shows it, switches design, and closes on Escape', async () => {
    render(<ScratchpadPanel />);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const { notes, noteTags } = useNoteStore.getState();
    expect(scratchpadNote(notes, noteTags)).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Scratchpad' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Design: Simple' }));
    expect(useSettingsStore.getState().scratchpadDesign).toBe('simple');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUIStore.getState().scratchpadOpen).toBe(false);
  });

  it('Escape typed in its text closes it (the tooltip says so)', async () => {
    render(<ScratchpadPanel />);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const text = screen.getByRole('textbox', { name: 'Scratchpad' });
    fireEvent.keyDown(text, { key: 'Escape', keyCode: 27 });   // keyCode: ProseMirror cancels a real Escape (see EscapePassThrough)
    expect(useUIStore.getState().scratchpadOpen).toBe(false);
  });
});
