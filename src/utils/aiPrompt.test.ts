import { describe, expect, it } from 'vitest';
import { assemblePrompt, collectPromptTemplates, fillsIn, freshRun, hiddenByFolds, pasteMarkdownPrompt, promptData, readMarkdownPrompt, withUsedFills, type PromptData } from './aiPrompt';
import type { Note } from '@/types/notes';

const prompt = (over: Partial<PromptData> = {}): PromptData => ({
  title: 'Review', template: false,
  sections: [
    { id: 'a', name: 'Background', text: 'I work on {app}, a {platform} app.', perRun: false },
    { id: 'b', name: 'This time', text: 'Look at {feature} in {app}.', perRun: true },
  ],
  fills: [{ name: 'app', value: 'Organisaitor' }, { name: 'platform', value: 'desktop' }],
  ...over,
});

describe('AI prompts (utils/aiPrompt.ts)', () => {
  it('reads {fill-ins} once each, in order, and never code or JSON braces', () => {
    expect(fillsIn('Use {App} then {app} and {feature name} not { "a": 1 } nor {}')).toEqual(['App', 'feature name']);
  });

  it('lists a fill-in a section starts using, keeping ones added by hand', () => {
    const p = prompt({ fills: [{ name: 'tone', value: '' }] });
    expect(withUsedFills(p).map((f) => f.name)).toEqual(['tone', 'app', 'platform', 'feature']);
  });

  it('puts the prompt together under its headings, the fill-ins put in and the empty ones named', () => {
    const out = assemblePrompt(prompt());
    expect(out.text).toBe('## Background\n\nI work on Organisaitor, a desktop app.\n\n## This time\n\nLook at {feature} in Organisaitor.');
    expect(out.missing).toEqual(['feature']);
  });

  it('a single section with no heading is just its text; empty sections are left out', () => {
    const out = assemblePrompt({ sections: [{ id: 'x', name: '', text: ' Hello {app} ', perRun: false }, { id: 'y', name: 'Empty', text: '  ', perRun: true }], fills: [{ name: 'APP', value: 'there' }] });
    expect(out).toEqual({ text: 'Hello there', missing: [] });
  });

  it('a fresh run empties the each-run sections and the fill-ins, and is never a template', () => {
    const f = freshRun(prompt({ template: true }));
    expect(f.sections.map((s) => s.text)).toEqual(['I work on {app}, a {platform} app.', '']);
    expect(f.fills.map((x) => x.value)).toEqual(['', '']);
    expect(f.template).toBe(false);
  });

  it('reads a node’s attributes safely', () => {
    expect(promptData({ title: 3, sections: 'x', fills: [{ name: ' ', value: 'v' }, { name: 'a' }] })).toEqual({ title: '', sections: [], fills: [{ name: 'a', value: '' }], template: false });
  });

  it('finds the templates in the notes, in any tab, and not archived notes', () => {
    const doc = (template: boolean, title: string) => JSON.stringify({ type: 'doc', content: [{ type: 'promptBlock', attrs: { title, template, sections: [], fills: [] } }] });
    const note = (id: string, content: string, tabs: string[] = [], archivedAt: string | null = null) =>
      ({ id, title: id, content, tabs: tabs.map((c, i) => ({ id: `t${i}`, content: c })), archivedAt }) as unknown as Note;
    const found = collectPromptTemplates([note('n1', doc(true, 'Zeta'), [doc(true, 'Alpha'), doc(false, 'Not one')]), note('n2', doc(true, 'Gone'), [], '2026-01-01')]);
    expect(found.map((t) => [t.noteId, t.data.title])).toEqual([['n1', 'Alpha'], ['n1', 'Zeta']]);
  });
});

describe('heading levels, folding and Markdown (2026-11-11)', () => {
  const PASTED = [
    '# Instructions',
    '',
    '## Triage the requirements',
    'The requirements below are grouped by app and feature area. Put each one into one of three groups:',
    '- Ready to build: clear enough to implement now.',
    '',
    '### Needs discussion',
    'Open questions.',
    '```',
    '# not a heading',
    '```',
  ].join('\n');

  it('reads headings at their levels, the lines under each kept as written, a lone first # as the title', () => {
    const md = readMarkdownPrompt(PASTED)!;
    expect(md.title).toBe('Instructions');
    expect(md.sections.map((x) => [x.level, x.name])).toEqual([[2, 'Triage the requirements'], [3, 'Needs discussion']]);
    expect(md.sections[0].text).toBe('The requirements below are grouped by app and feature area. Put each one into one of three groups:\n- Ready to build: clear enough to implement now.');
    expect(md.sections[1].text).toContain('# not a heading');
    expect(readMarkdownPrompt('just text\n- a list')).toBeNull();
  });

  it('pasted into an empty section, the first heading takes it and the rest follow; the title only when there is none', () => {
    let n = 0;
    const data = { title: '', sections: [{ id: 'a', name: '', text: '', perRun: false }] };
    const out = pasteMarkdownPrompt(data, { sectionId: 'a', from: 0, to: 0 }, readMarkdownPrompt(PASTED)!, () => `new${n++}`);
    expect(out.title).toBe('Instructions');
    expect(out.sections.map((x) => [x.id, x.level, x.name])).toEqual([['a', 2, 'Triage the requirements'], ['new0', 3, 'Needs discussion']]);
    const kept = pasteMarkdownPrompt({ ...out, title: 'Mine' }, { sectionId: 'a', from: 0, to: 0 }, readMarkdownPrompt('Lead\n## More\nx')!, () => 'z');
    expect(kept.title).toBe('Mine');
    expect(kept.sections.map((x) => x.name)).toEqual(['Triage the requirements', 'More', 'Needs discussion']);
    expect(kept.sections[0].text.startsWith('Lead')).toBe(true);
  });

  it('sends each heading with its own level, and a heading over sections with text', () => {
    const out = assemblePrompt({
      sections: [
        { id: 'a', name: 'Instructions', text: '', perRun: false, level: 1 },
        { id: 'b', name: 'Orient first', text: 'Read CLAUDE.md.', perRun: false, level: 2 },
        { id: 'c', name: 'Empty', text: '', perRun: false, level: 1 },
      ],
      fills: [],
    });
    expect(out.text).toBe('# Instructions\n\n## Orient first\n\nRead CLAUDE.md.');
  });

  it('a folded section hides its text and the sections under it, not the next at its level', () => {
    const r = hiddenByFolds([
      { id: 'a', name: 'A', text: '', perRun: false, level: 2, folded: true },
      { id: 'b', name: 'B', text: '', perRun: false, level: 3 },
      { id: 'c', name: 'C', text: '', perRun: false, level: 2 },
    ]);
    expect([...r.textHidden]).toEqual(['a']);
    expect([...r.hidden]).toEqual(['b']);
  });
});
