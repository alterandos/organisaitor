import type { CrossAppRef } from '@/types';

// Writing note content in code (Tiptap JSON), shared by the demo account (demoAccount.ts) and the
// block examples (blockExamples.ts): a node and its text, marks, and the blocks' small builders.

export type J = Record<string, unknown>;
export type Inline = string | J | Inline[];

export const flat = (c: Inline[]): J[] => c.flatMap((x): J[] => (Array.isArray(x) ? flat(x) : typeof x === 'string' ? (x ? [{ type: 'text', text: x }] : []) : [x]));
export const node = (type: string, attrs: J | null, ...c: Inline[]): J => {
  const content = flat(c);
  return { type, ...(attrs ? { attrs } : {}), ...(content.length ? { content } : {}) };
};
export const kids = (type: string, attrs: J | null, children: J[]): J => ({ type, ...(attrs ? { attrs } : {}), content: children });

export const marked = (text: string, ...marks: J[]): J => ({ type: 'text', text, marks });
export const bold = (text: string) => marked(text, { type: 'bold' });
export const italic = (text: string) => marked(text, { type: 'italic' });
export const sub = (text: string) => marked(text, { type: 'subscript' });
export const sup = (text: string) => marked(text, { type: 'superscript' });
export const weblink = (text: string, href: string) => marked(text, { type: 'link', attrs: { href } });

export const p = (...c: Inline[]) => node('paragraph', null, ...c);
export const pId = (blockId: string, ...c: Inline[]) => node('paragraph', { blockId }, ...c);
export const h = (level: number, text: string, blockId?: string) => node('heading', { level, ...(blockId ? { blockId } : {}) }, text);
export const bullets = (...items: Inline[][]) => kids('bulletList', null, items.map((c) => kids('listItem', null, [p(...c)])));
export const numbered = (...items: Inline[][]) => kids('orderedList', null, items.map((c) => kids('listItem', null, [p(...c)])));
export const table = (head: string[], rows: string[][]) => kids('table', null, [
  kids('tableRow', null, head.map((c) => kids('tableHeader', null, [p(c)]))),
  ...rows.map((r) => kids('tableRow', null, r.map((c) => kids('tableCell', null, [p(c)])))),
]);

export const section = (...blocks: J[]) => kids('section', { columns: 1, locked: false }, blocks);
export const columns = (...cols: J[][]) => kids('section', { columns: cols.length, locked: false }, [kids('columnBlock', null, cols.map((c) => kids('column', null, c)))]);
export const doc = (...sections: J[]) => JSON.stringify({ type: 'doc', content: sections });

// Marks the app puts on text.
export const IMPORTANT = { tagId: 'builtin-important', color: '#f59e0b', typeKey: 'important' };
export const important = (text: string, level: 1 | 2 | 3, passageId: string, reviewDue: string | null = null) =>
  marked(text, { type: 'noteTag', attrs: { ...IMPORTANT, level, passageId, reviewDue, reviewStep: reviewDue ? 0 : null } });
export const tagged = (text: string, tagId: string, color: string) => marked(text, { type: 'noteTag', attrs: { tagId, color } });
export const itemLink = (text: string, targetType: CrossAppRef['type'], targetId: string, display: 'basic' | 'expanded' = 'basic') =>
  marked(text, { type: 'artifactLink', attrs: { targetType, targetId, display } });
export const noteLink = (text: string, noteId: string, blockId: string | null = null) => marked(text, { type: 'noteLink', attrs: { noteId, tabId: null, blockId } });
export const termLink = (text: string, entryId: string, typeKey: string) => marked(text, { type: 'conceptRef', attrs: { entryId, typeKey } });
export const hubPassage = (text: string, hub: { hubId: string; noteId: string; title: string }, linkId: string) =>
  marked(text, { type: 'hubRef', attrs: { hubId: hub.hubId, linkId, hubNoteId: hub.noteId, hubTitle: hub.title } });
export const unsure = (text: string, flagId: string, reason: string | null = null) => marked(text, { type: 'unsureFlag', attrs: { flagId, reason, qid: null } });
export const chip = (entryId: string) => node('glossaryChip', { entryId });
export const mathInline = (latex: string) => node('mathInline', { latex });

// Blocks.
export const card = (entryId: string, variant: 'card' | 'compact' = 'card', frame: J = {}) => node('glossaryCard', { entryId, variant, ...frame });
export const embed = (noteId: string, blockId: string, variant: 'quote' | 'card' | 'plain' = 'card') => node('noteEmbed', { noteId, tabId: null, blockId, variant });
export const mathBlock = (latex: string, variant: 'centred' | 'left' | 'numbered' = 'centred') => node('mathBlock', { latex, variant });
export const code = (language: string, text: string) => node('codeBlock', { language, variant: 'numbered' }, text);

