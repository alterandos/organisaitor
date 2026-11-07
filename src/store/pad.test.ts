// The pad (uiStore.pad, 2026-11-07): one floating window holding the scratchpad, a note or the
// calendar; shown only in the section it was opened in; a note or the calendar opened over the
// scratchpad goes back to it when closed.
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/store/uiStore';

const ui = () => useUIStore.getState();

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));

describe('the pad', () => {
  it('a note opened over the scratchpad goes back to the scratchpad when closed', () => {
    ui().setActiveView('tasks');
    ui().openScratchpad();
    ui().openNoteInPad('n1');
    expect(ui().pad).toEqual({ kind: 'note', noteId: 'n1' });
    ui().closePad();
    expect(ui().pad).toEqual({ kind: 'scratchpad' });
    ui().closePad();
    expect(ui().pad).toBeNull();
  });

  it('belongs to the section it was opened in, and moves to where it is opened again', () => {
    ui().setActiveView('tasks');
    ui().openCalendarPad();
    expect(ui().padSection).toBe('tasks');
    ui().setActiveView('calendar');
    expect(ui().pad).toEqual({ kind: 'calendar' });     // kept, shown again on going back
    ui().openCalendarPad();
    expect(ui().padSection).toBe('calendar');
  });

  it('a note already open in Notes is shown there, not in the pad', () => {
    ui().setActiveView('notes');
    ui().openNote('n1');
    ui().openNoteInPad('n1');
    expect(ui().pad).toBeNull();
    expect(ui().editingNoteId).toBe('n1');
  });
});
