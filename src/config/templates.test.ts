import { describe, expect, it } from 'vitest';
import { NOTE_TEMPLATES } from '@/config/noteTemplates';
import { TRACKER_TEMPLATES } from '@/config/trackerTemplates';

// Recursively checks the shape every Tiptap/ProseMirror node needs: a `type` string, and if it
// carries children, a `content` array of more such nodes. Not full schema validation (that needs
// a real Tiptap editor instance), but exactly the kind of malformed-JSON mistake a hand-written
// template builder is prone to — a missing `type`, or `content` that isn't an array — would fail
// loudly here instead of surfacing as a silently blank/broken note the first time it's opened.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertValidNode(node: any, path: string) {
  expect(node, path).toBeTypeOf('object');
  expect(typeof node.type, `${path}.type`).toBe('string');
  if ('content' in node) {
    expect(Array.isArray(node.content), `${path}.content`).toBe(true);
    node.content.forEach((child: unknown, i: number) => assertValidNode(child, `${path}.content[${i}]`));
  }
  if (node.type === 'text') {
    expect(typeof node.text, `${path}.text`).toBe('string');
  }
}

describe('NOTE_TEMPLATES produce well-formed Tiptap doc JSON', () => {
  it('every template id is unique', () => {
    const ids = NOTE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a non-blank template\'s content is a valid "doc" node with at least one block', () => {
    for (const template of NOTE_TEMPLATES) {
      if (template.content === null) continue; // Blank is allowed to have no content
      assertValidNode(template.content, `${template.id}.content`);
      expect((template.content as { type: string }).type, template.id).toBe('doc');
      expect((template.content as { content: unknown[] }).content.length, template.id).toBeGreaterThan(0);
    }
  });

  it('the Blank template has null content (Note.content stays empty)', () => {
    expect(NOTE_TEMPLATES.find((t) => t.id === 'blank')?.content).toBeNull();
  });

  it('every template has a non-empty name, icon and description', () => {
    for (const t of NOTE_TEMPLATES) {
      expect(t.name.length, t.id).toBeGreaterThan(0);
      expect(t.icon.length, t.id).toBeGreaterThan(0);
      expect(t.description.length, t.id).toBeGreaterThan(0);
    }
  });
});

describe('TRACKER_TEMPLATES', () => {
  it('every field in every template has a unique id within that template', () => {
    for (const [key, def] of Object.entries(TRACKER_TEMPLATES)) {
      const ids = def.fields.map((f) => f.id);
      expect(new Set(ids).size, key).toBe(ids.length);
    }
  });

  it('a "select" field always ships with at least one option', () => {
    for (const [key, def] of Object.entries(TRACKER_TEMPLATES)) {
      for (const field of def.fields) {
        if (field.type === 'select') expect((field.options ?? []).length, `${key}.${field.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('every template has a non-empty label and description', () => {
    for (const [key, def] of Object.entries(TRACKER_TEMPLATES)) {
      expect(def.label.length, key).toBeGreaterThan(0);
      expect(def.description.length, key).toBeGreaterThan(0);
    }
  });

  it('every template except "custom" (start from scratch, by design) ships with at least one field', () => {
    for (const [key, def] of Object.entries(TRACKER_TEMPLATES)) {
      if (key === 'custom') { expect(def.fields).toEqual([]); continue; }
      expect(def.fields.length, key).toBeGreaterThan(0);
    }
  });
});
