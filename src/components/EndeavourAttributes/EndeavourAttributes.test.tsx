// @vitest-environment jsdom
//
// An Endeavour's attributes pane (agreed with the user 2026-10-30): a default Type gives their own
// copy, fields of its own are added and filled in, and removing the period asks first.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AttributesSummary, EndeavourAttributesPane } from './EndeavourAttributesPane';
import { useTaskStore } from '@/store/taskStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useUIStore } from '@/store/uiStore';
import { useDialogStore } from '@/store/dialogStore';
import { LABELS } from '@/config/labels';

const L = LABELS.attributes;

beforeEach(() => {
  for (const s of [useTaskStore, useItemTypeStore, useDialogStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => { cleanup(); });

describe('the attributes pane', () => {
  it('takes a default Type as their own, adds and fills a field of its own, and asks before removing the period', () => {
    const id = useTaskStore.getState().addCollection({ kind: 'project', name: 'Semester 2' });
    useUIStore.getState().showEndeavourAttributes(id);
    render(<EndeavourAttributesPane />);
    const pane = screen.getByRole('dialog', { name: L.title('Semester 2') });

    fireEvent.change(within(pane).getByRole('combobox', { name: L.type }), { target: { value: 'default:semester' } });
    const typeId = useTaskStore.getState().collections[id].attributes!.typeId!;
    expect(useItemTypeStore.getState().types[typeId]).toMatchObject({ name: 'Semester', builtIn: 'semester' });
    expect(within(pane).getByRole('group', { name: 'Teaching period' })).toBeInTheDocument();

    fireEvent.change(within(pane).getByRole('textbox', { name: L.newName }), { target: { value: 'Faculty' } });
    fireEvent.click(within(pane).getByRole('button', { name: L.addField }));
    const faculty = within(pane).getByRole('group', { name: 'Faculty' });
    fireEvent.change(within(faculty).getByRole('textbox'), { target: { value: 'Science' } });
    const own = useTaskStore.getState().collections[id].attributes!;
    expect(Object.values(own.values)).toEqual(['Science']);
    cleanup();

    render(<AttributesSummary id={id} />);
    expect(screen.getByRole('group', { name: L.summary })).toHaveTextContent('Faculty Science');
    cleanup();

    // A period of its own (no Type): removing it asks first.
    useTaskStore.getState().updateCollection(id, { attributes: { typeId: null, fields: [], values: {} }, period: { start: '2031-07-28', end: '2031-11-07', breaks: [] } });
    render(<EndeavourAttributesPane />);
    fireEvent.click(screen.getByRole('button', { name: `${L.remove}: Period` }));
    expect(useDialogStore.getState().queue).toHaveLength(1);
    expect(useTaskStore.getState().collections[id].period).not.toBeNull();
  });
});
