// @vitest-environment jsdom
//
// The template editor (components/TemplateEditor): a new template with a class and its task for
// each date; red notes for what's missing; a built-in one saved as the person's copy.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TemplateEditor } from './TemplateEditor';
import { useTemplateStore } from '@/store/templateStore';
import { useUIStore } from '@/store/uiStore';
import { DEFAULT_TEMPLATE_BY_ID } from '@/config/defaultTemplates';
import { blankTemplate } from '@/services/templates';
import { LABELS } from '@/config/labels';

const L = LABELS.templates;

beforeEach(() => {
  useTemplateStore.setState(useTemplateStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(cleanup);

describe('TemplateEditor', () => {
  it('makes a template with a class on its days and a task for each date', () => {
    useUIStore.getState().openTemplateEditor(blankTemplate());
    render(<TemplateEditor def={blankTemplate()} />);
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Course' } });
    const classes = screen.getByRole('group', { name: L.classes });
    fireEvent.click(within(classes).getByRole('button', { name: L.add }));
    fireEvent.change(within(classes).getByLabelText(L.classTitle), { target: { value: '{name} lecture' } });
    fireEvent.click(within(classes).getByRole('button', { name: L.dayShort[3] }));
    fireEvent.click(within(classes).getByRole('button', { name: /Prepare/ }));
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    const [t] = Object.values(useTemplateStore.getState().templates);
    expect(t).toMatchObject({ name: 'Course', classes: [{ title: '{name} lecture', weekdays: [3], taskRules: [{ title: 'Prepare', side: 'before', days: 1 }] }] });
    expect(useUIStore.getState().templateEditor).toBeNull();
  });

  it('says what’s missing, under the field, and saves nothing', () => {
    render(<TemplateEditor def={blankTemplate()} />);
    const classes = screen.getByRole('group', { name: L.classes });
    fireEvent.click(within(classes).getByRole('button', { name: L.add }));
    fireEvent.change(within(classes).getByLabelText(L.classTitle), { target: { value: 'Lecture' } });
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    expect(screen.getByText(L.nameNeeded)).toBeInTheDocument();
    expect(screen.getByText(L.daysNeeded)).toBeInTheDocument();
    expect(Object.keys(useTemplateStore.getState().templates)).toHaveLength(0);
  });

  it('Save as new template leaves the one opened as it was and adds another; a name taken gets “(copy)”', () => {
    render(<TemplateEditor def={DEFAULT_TEMPLATE_BY_ID.subject} />);
    fireEvent.click(screen.getByRole('button', { name: L.saveAsNew }));
    let mine = Object.values(useTemplateStore.getState().templates);
    expect(mine.map((t) => [t.name, t.builtIn])).toEqual([['Subject (copy)', undefined]]);
    cleanup();
    render(<TemplateEditor def={mine[0]} />);
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Lab subject' } });
    fireEvent.click(screen.getByRole('button', { name: L.saveAsNew }));
    mine = Object.values(useTemplateStore.getState().templates);
    expect(mine.map((t) => t.name).sort()).toEqual(['Lab subject', 'Subject (copy)']);
  });

  it('a new template has only Save', () => {
    render(<TemplateEditor def={blankTemplate()} />);
    expect(screen.queryByRole('button', { name: L.saveAsNew })).toBeNull();
  });

  it('a built-in one says so, and saving keeps the person’s copy', () => {
    render(<TemplateEditor def={DEFAULT_TEMPLATE_BY_ID.semester} />);
    expect(screen.getByText(L.editorBuiltIn)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Term' } });
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    const [t] = Object.values(useTemplateStore.getState().templates);
    expect(t).toMatchObject({ name: 'Term', builtIn: 'semester', partsFrom: 'subject' });
  });
});
