import { describe, expect, it } from 'vitest';
import { collectArtifactTargets, noteContentToText, stripArtifactLinksFromContent } from '@/utils/noteContent';

function doc(content: unknown) {
  return JSON.stringify({ type: 'doc', content });
}

describe('noteContentToText', () => {
  it('extracts plain text from a nested doc, blocks separated by a space', () => {
    const content = doc([
      { type: 'section', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
      { type: 'section', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'World' }] }] },
    ]);
    expect(noteContentToText(content)).toBe('Hello World');
  });

  it('returns "" for empty or malformed JSON', () => {
    expect(noteContentToText('')).toBe('');
    expect(noteContentToText('not json')).toBe('');
  });

  it('stops walking further blocks once the running length passes maxChars', () => {
    // The cap is checked once per node visited, not mid-text — a single text node already
    // over the limit is still emitted whole (see the next test), but once that check trips,
    // no further sibling blocks are appended.
    const content = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(15) }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'SHOULD NOT APPEAR' }] },
    ]);
    const out = noteContentToText(content, 10);
    expect(out).not.toContain('SHOULD NOT APPEAR');
  });

  it('does not truncate mid-text — a single node already over maxChars is emitted whole', () => {
    const longText = 'a'.repeat(100);
    const content = doc([{ type: 'paragraph', content: [{ type: 'text', text: longText }] }]);
    expect(noteContentToText(content, 10)).toBe(longText);
  });
});

describe('collectArtifactTargets', () => {
  it('finds every artifactLink mark target', () => {
    const content = doc([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'linked task', marks: [{ type: 'artifactLink', attrs: { targetType: 'task', targetId: 't1' } }] },
          { type: 'text', text: 'linked event', marks: [{ type: 'artifactLink', attrs: { targetType: 'event', targetId: 'e1' } }] },
        ],
      },
    ]);
    expect(collectArtifactTargets(content)).toEqual(new Set(['task:t1', 'event:e1']));
  });

  it('returns an empty set for content with no artifact links', () => {
    const content = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }]);
    expect(collectArtifactTargets(content)).toEqual(new Set());
  });

  it('returns an empty set for malformed JSON', () => {
    expect(collectArtifactTargets('not json')).toEqual(new Set());
  });
});

describe('stripArtifactLinksFromContent', () => {
  it('removes the mark but keeps the text intact, reporting changed: true', () => {
    const content = doc([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'linked task', marks: [{ type: 'artifactLink', attrs: { targetType: 'task', targetId: 't1' } }] }],
      },
    ]);
    const out = stripArtifactLinksFromContent(content, 'task', 't1');
    expect(out.changed).toBe(true);
    const parsed = JSON.parse(out.content);
    expect(parsed.content[0].content[0].text).toBe('linked task');
    expect(parsed.content[0].content[0].marks).toEqual([]);
  });

  it('leaves other marks and other targets untouched', () => {
    const content = doc([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'x',
            marks: [
              { type: 'bold' },
              { type: 'artifactLink', attrs: { targetType: 'task', targetId: 't1' } },
              { type: 'artifactLink', attrs: { targetType: 'task', targetId: 't2' } },
            ],
          },
        ],
      },
    ]);
    const out = stripArtifactLinksFromContent(content, 'task', 't1');
    const parsed = JSON.parse(out.content);
    const marks = parsed.content[0].content[0].marks;
    expect(marks).toHaveLength(2);
    expect(marks.some((m: { type: string }) => m.type === 'bold')).toBe(true);
    expect(marks.some((m: { attrs?: { targetId?: string } }) => m.attrs?.targetId === 't2')).toBe(true);
  });

  it('returns changed: false and the original string when there is nothing to strip', () => {
    const content = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }]);
    const out = stripArtifactLinksFromContent(content, 'task', 't1');
    expect(out).toEqual({ changed: false, content });
  });

  it('returns changed: false for empty or malformed content', () => {
    expect(stripArtifactLinksFromContent('', 'task', 't1')).toEqual({ changed: false, content: '' });
    expect(stripArtifactLinksFromContent('not json', 'task', 't1')).toEqual({ changed: false, content: 'not json' });
  });
});
