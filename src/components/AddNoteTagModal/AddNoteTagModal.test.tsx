// @vitest-environment jsdom
//
// The New notebook pane's "Inside" picker (2026-10-05): it starts at the notebook it was opened
// from, can be moved anywhere in the tree or to the top level, and the switcher at the top moves
// to another kind of thing keeping the typed name.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddNoteTagModal } from './AddNoteTagModal';
import { AddNoteModal } from '../AddNoteModal/AddNoteModal';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import type { NoteTagId } from '@/types/notes';

let uni: NoteTagId;
let bio: NoteTagId;

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  uni = useNoteStore.getState().addNoteTag({ name: 'University', kind: 'area' }) as NoteTagId;
  bio = useNoteStore.getState().addNoteTag({ name: 'Biology', kind: 'area', parentTagId: uni }) as NoteTagId;
  useNoteStore.getState().addNoteTag({ name: 'Home', kind: 'area' });
});

afterEach(() => {
  cleanup();
});

// Mirrors App.tsx: one modal per openModal, the notebook pane keyed by kind.
function Mounted() {
  const openModal = useUIStore((s) => s.openModal);
  const kind = useUIStore((s) => s.pendingNoteTagKind);
  if (openModal === 'add-note-tag') return <AddNoteTagModal key={kind} />;
  if (openModal === 'add-note') return <AddNoteModal />;
  return null;
}

const created = (name: string) => Object.values(useNoteStore.getState().noteTags).find((t) => t.name === name);

describe('AddNoteTagModal: where the new notebook goes', () => {
  it('starts inside the notebook it was opened from, shown as a path', async () => {
    useUIStore.getState().showAddNoteTag(bio, 'area');
    render(<Mounted />);
    expect(screen.getByTitle(LABELS.notebookParent.change)).toHaveTextContent('University › Biology');
    await userEvent.type(screen.getByLabelText('Name'), 'Lecture 1{Enter}');
    expect(created('Lecture 1')?.parentTagId).toBe(bio);
  });

  it('✕ makes it a top-level notebook', async () => {
    useUIStore.getState().showAddNoteTag(bio, 'area');
    render(<Mounted />);
    await userEvent.click(screen.getByLabelText(LABELS.notebookParent.makeTopLevel));
    expect(screen.getByTitle(LABELS.notebookParent.change)).toHaveTextContent(LABELS.notebookParent.topLevel);
    await userEvent.type(screen.getByLabelText('Name'), 'Travel{Enter}');
    expect(created('Travel')?.parentTagId).toBeNull();
  });

  it('the picker moves it under any other notebook', async () => {
    useUIStore.getState().showAddNoteTag(bio, 'area');
    render(<Mounted />);
    await userEvent.click(screen.getByTitle(LABELS.notebookParent.change));
    await userEvent.click(screen.getByRole('button', { name: /Home/ }));
    await userEvent.type(screen.getByLabelText('Name'), 'Garden{Enter}');
    expect(created('Garden')?.parentTagId).not.toBe(bio);
    expect(useNoteStore.getState().noteTags[created('Garden')!.parentTagId!].name).toBe('Home');
  });
});

describe('CreateKindSwitcher in the Notes creation panes', () => {
  it('offers Note / Notebook / Tag, and switching keeps the typed text', async () => {
    useUIStore.setState({ selectedNoteTagId: bio });
    useUIStore.getState().showAddNote();
    render(<Mounted />);
    await userEvent.type(screen.getByLabelText('Title'), 'Week 3');

    await userEvent.click(screen.getByRole('tab', { name: /Notebook/ }));
    expect(useUIStore.getState().openModal).toBe('add-note-tag');
    expect(screen.getByLabelText('Name')).toHaveValue('Week 3');
    // A notebook made from Notes goes inside the selected one.
    expect(screen.getByTitle(LABELS.notebookParent.change)).toHaveTextContent('University › Biology');

    await userEvent.click(screen.getByRole('tab', { name: /Tag/ }));
    expect(useUIStore.getState().pendingNoteTagKind).toBe('tag');
    expect(screen.getByLabelText('Name')).toHaveValue('Week 3');

    await userEvent.click(screen.getByRole('tab', { name: /Note$/ }));
    expect(screen.getByLabelText('Title')).toHaveValue('Week 3');
  });

  it('closing the pane drops the carried text', () => {
    useUIStore.getState().setCreateDraft('left over');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().createDraft).toBeNull();
  });
});

describe('AddNoteTagModal: Escape with the picker open', () => {
  it('closes only the picker, not the pane', async () => {
    useUIStore.getState().showAddNoteTag(bio, 'area');
    render(<Mounted />);
    await userEvent.click(screen.getByTitle(LABELS.notebookParent.change));
    expect(screen.getByRole('button', { name: /Home/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /Home/ })).not.toBeInTheDocument();
    expect(useUIStore.getState().openModal).toBe('add-note-tag');
  });
});
