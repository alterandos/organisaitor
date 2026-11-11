// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { PromptExtensions, newPromptRun, setPromptAttrs } from './Prompt';
import { NoteBlockDelete } from './blockDesigns';
import { DesignCycle } from './designCycle';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { LABELS } from '@/config/labels';
import { promptTargets, registerPromptTarget } from '@/services/aiPromptTargets';
import { useToastStore } from '@/store/toastStore';

// The AI prompt block (`\prompt`, extensions/Prompt.ts + PromptBody.tsx): made through `\`, written
// in place, {fill-ins} listed as they're typed, sent through the targets (copy today), a new run,
// a template, and the tile folding.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

const L = LABELS.noteBlocks.prompt;
let editor: Editor;
let host: HTMLElement;
afterEach(() => { editor?.destroy(); host?.remove(); vi.restoreAllMocks(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function make(content = '<p></p>') {
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...PromptExtensions, DesignCycle, NoteBlockDelete],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId: 'n', collectionId: null, now: new Date() });
  editor.commands.focus('end');
  await flush();
  // Tiptap focuses on the next animation frame: let it, so it can't take the focus from what a test opens.
  await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const prompts = () => {
  const out: { pos: number; attrs: Record<string, unknown> }[] = [];
  editor.state.doc.descendants((n, at) => { if (n.type.name === 'promptBlock') out.push({ pos: at, attrs: n.attrs }); });
  return out;
};
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name) as HTMLButtonElement | undefined;
const blockDom = (i = 0) => host.querySelectorAll('[data-type="prompt"]')[i] as HTMLElement;
const html = (attrs: string) => `<div data-type="prompt" ${attrs}></div>`;
const sections = (s: unknown[]) => `data-sections='${JSON.stringify(s)}'`;

describe('the AI prompt block', () => {
  it('is made by \\prompt, open, the cursor in its name', async () => {
    await make();
    type('\\prompt ');
    await flush();
    expect(prompts()).toHaveLength(1);
    const title = host.querySelector(`input[aria-label="${L.titlePlaceholder}"]`) as HTMLInputElement;
    expect(document.activeElement).toBe(title);
    fireEvent.change(title, { target: { value: 'Code review' } });
    expect(prompts()[0].attrs.title).toBe('Code review');
  });

  it('lists a {fill-in} as it is written, sends the prompt with it put in, and notes when', async () => {
    await make(html(`data-variant="full" data-title="Review" ${sections([{ id: 'a', name: 'Ask', text: '', perRun: true }])}`));
    fireEvent.change(host.querySelector('textarea')!, { target: { value: 'Review {feature} please' } });
    expect(prompts()[0].attrs.fills).toEqual([{ name: 'feature', value: '' }]);
    fireEvent.change(host.querySelector(`input[aria-label="${L.fillValue('feature')}"]`)!, { target: { value: 'the tile' } });
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    await act(async () => { button(L.copy)!.click(); });
    await flush();
    expect(write).toHaveBeenCalledWith('## Ask\n\nReview the tile please');
    expect(prompts()[0].attrs.sentAt).toBeTruthy();
    expect(useToastStore.getState().current?.message).toBe(L.copied);
  });

  it('says so when there is nothing to send, under the buttons', async () => {
    await make(html(`data-variant="full" data-title="Empty" ${sections([{ id: 'a', name: '', text: '', perRun: false }])}`));
    await act(async () => { button(L.copy)!.click(); });
    expect(host.textContent).toContain(L.nothingToSend);
  });

  it('a new run is a fresh copy after it: each-run sections and fill-ins emptied, the kept ones as they were', async () => {
    await make(html(`data-variant="tile" data-title="Review" data-template="" ${sections([{ id: 'a', name: 'Bg', text: 'Keep {app}', perRun: false }, { id: 'b', name: 'Ask', text: 'Now', perRun: true }])} data-fills='[{"name":"app","value":"X"}]'`));
    expect(button(L.useTemplate)).toBeTruthy();
    act(() => newPromptRun(editor.view, prompts()[0].pos));
    await flush();
    const [first, second] = prompts();
    expect(first.attrs.template).toBe(true);
    expect(second.attrs.template).toBe(false);
    expect((second.attrs.sections as { text: string }[]).map((s) => s.text)).toEqual(['Keep {app}', '']);
    expect(second.attrs.fills).toEqual([{ name: 'app', value: '' }]);
    expect(blockDom(1).hasAttribute('data-prompt-open')).toBe(true);
  });

  it('a tile opens on a click and folds back on Escape; the Template switch is in its pill', async () => {
    await make(html(`data-variant="tile" data-title="Review" ${sections([{ id: 'a', name: '', text: 'Hi', perRun: false }])}`));
    expect(blockDom().hasAttribute('data-prompt-open')).toBe(false);
    act(() => (host.querySelector(`button[title="${L.open}"]`) as HTMLButtonElement).click());
    expect(blockDom().hasAttribute('data-prompt-open')).toBe(true);
    fireEvent.keyDown(host.querySelector('textarea')!, { key: 'Escape' });
    expect(blockDom().hasAttribute('data-prompt-open')).toBe(false);
    act(() => setPromptAttrs(editor.view, prompts()[0].pos, { template: true }));
    expect(blockDom().querySelector('[data-prompt-tools] [data-prompt-template]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('round-trips through HTML', async () => {
    await make(html(`data-variant="full" data-title="R" data-template="" ${sections([{ id: 'a', name: 'N', text: 'T {x}', perRun: true }])} data-fills='[{"name":"x","value":"1"}]'`));
    const before = prompts()[0].attrs;
    editor.commands.setContent(editor.getHTML());
    expect(prompts()[0].attrs).toEqual(before);
  });

  it('a target registered later (the agent) is offered by every prompt with no change to the block', async () => {
    const send = vi.fn(async () => {});
    registerPromptTarget({ id: 'test-agent', label: 'Send to the agent', order: 10, available: () => true, send });
    try {
      expect(promptTargets()[0].id).toBe('test-agent');
      await make(html(`data-variant="full" data-title="R" ${sections([{ id: 'a', name: '', text: 'Go', perRun: false }])}`));
      await act(async () => { button('Send to the agent')!.click(); });
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ prompt: { text: 'Go', missing: [] } }));
    } finally {
      registerPromptTarget({ id: 'test-agent', label: '', order: 10, available: () => false, send });
    }
  });

  // The keys every block has, folding and Markdown (2026-11-11).
  it('Enter goes on to the next field and out after the last; Ctrl+Enter leaves it onto a new line below', async () => {
    await make(html(`data-variant="full" data-title="R" ${sections([{ id: 'a', name: 'Ask', text: 'Go', perRun: false }])}`) + '<p>after</p>');
    const title = host.querySelector(`input[aria-label="${L.titlePlaceholder}"]`) as HTMLInputElement;
    title.focus();
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(document.activeElement).toBe(host.querySelector(`input[aria-label="${L.sectionName}"]`));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    const text = host.querySelector('textarea')!;
    expect(document.activeElement).toBe(text);
    // Shift+Enter is a new line in a section: left to the textarea.
    expect(fireEvent.keyDown(text, { key: 'Enter', shiftKey: true })).toBe(true);
    fireEvent.keyDown(text, { key: 'Enter', ctrlKey: true });
    const sel = editor.state.selection.$from;
    expect(sel.parent.type.name).toBe('paragraph');
    expect(sel.pos).toBe(prompts()[0].pos + editor.state.doc.nodeAt(prompts()[0].pos)!.nodeSize + 1);
  });

  it('Markdown pasted in becomes sections at their levels; a section folds away with those under it, and sends as written', async () => {
    await make(html(`data-variant="full" ${sections([{ id: 'a', name: '', text: '', perRun: false }])}`));
    const text = host.querySelector('textarea')!;
    fireEvent.paste(text, { clipboardData: { getData: () => '# Instructions\n\n## Orient first\nRead it.\n\n### Detail\n- one' } });
    const s = prompts()[0].attrs.sections as { name: string; level: number }[];
    expect(prompts()[0].attrs.title).toBe('Instructions');
    expect(s.map((x) => [x.level, x.name])).toEqual([[2, 'Orient first'], [3, 'Detail']]);
    const fold = host.querySelector(`button[aria-label="${L.foldSection}"]`) as HTMLButtonElement;
    act(() => fold.click());
    expect(host.querySelectorAll('textarea')).toHaveLength(0);
    expect(host.querySelectorAll(`input[aria-label="${L.sectionName}"]`)).toHaveLength(1);
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    await act(async () => { button(L.copy)!.click(); });
    expect(write).toHaveBeenCalledWith('## Orient first\n\nRead it.\n\n### Detail\n\n- one');
  });
});
