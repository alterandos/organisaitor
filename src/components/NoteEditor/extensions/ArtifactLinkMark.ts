import { Mark, mergeAttributes } from '@tiptap/core';

// Marks a span of note text as linked to an item elsewhere in the suite (a task, event,
// reminder, deadline, list), made from the text with Ctrl+Q's "Create ▸" menu or by typing `\`.
// The mark is only the data; how it looks (an inline pane, expanded into a box) is drawn by
// objects/artifactGroups.ts. `display` is whether this link shows inline ('basic') or expanded,
// saved with the note. Inclusive (the default): typing at the end of the text extends it — it's
// the item's title. Creating one clears it from the cursor, so typing on after that is plain text.
export const ArtifactLinkMark = Mark.create({
  name: 'artifactLink',

  addAttributes() {
    return {
      targetType: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-artifact-type') ?? el.getAttribute('targettype') },
      targetId:   { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-artifact-id') ?? el.getAttribute('targetid') },
      display: {
        default:    'basic',
        parseHTML:  (el: HTMLElement) => (el.getAttribute('data-artifact-display') === 'expanded' ? 'expanded' : 'basic'),
        renderHTML: (attrs: { display?: string }) => ({ 'data-artifact-display': attrs.display ?? 'basic' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-artifact-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, string> = {
      'data-artifact-id':   HTMLAttributes.targetId,
      'data-artifact-type': HTMLAttributes.targetType,
    };
    return ['mark', mergeAttributes(HTMLAttributes, attrs), 0];
  },
});
