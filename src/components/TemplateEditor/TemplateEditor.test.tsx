// @vitest-environment jsdom
//
// The template editor (components/TemplateEditor): a new template's tags and notebook; red notes
// for what's missing; a built-in one saved as the person's copy, or as a new one.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TemplateEditor } from './TemplateEditor';
import { useTemplateStore } from '@/store/templateStore';
import { useUIStore } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { DEFAULT_TEMPLATE_BY_ID } from '@/config/defaultTemplates';
import { blankTemplate } from '@/services/templates';
import { LABELS } from '@/config/labels';

const L = LABELS.templates;

beforeEach(() => {
  useTemplateStore.setState(useTemplateStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
});
afterEach(cleanup);

describe('TemplateEditor', () => {
  it('makes a template from what the form holds: its tags (by name) and whether it makes a notebook', () => {
    useUIStore.getState().openTemplateEditor(blankTemplate());
    render(<TemplateEditor def={blankTemplate()} />);
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Course' } });
    const tags = screen.getByLabelText(LABELS.tagField.label);
    fireEvent.change(tags, { target: { value: 'Study' } });
    fireEvent.keyDown(tags, { key: 'Enter' });
    fireEvent.click(screen.getByLabelText(L.notebook));
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    const [t] = Object.values(useTemplateStore.getState().templates);
    expect(t).toMatchObject({ name: 'Course', tags: ['Study'], notebook: true });
    // A tag named in a template isn't made until an Endeavour is made from it.
    expect(Object.keys(useTaskStore.getState().tags)).toHaveLength(0);
    expect(useUIStore.getState().templateEditor).toBeNull();
  });

  it('says what’s missing, under the field, and saves nothing', () => {
    render(<TemplateEditor def={blankTemplate()} />);
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    expect(screen.getByText(L.nameNeeded)).toBeInTheDocument();
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
