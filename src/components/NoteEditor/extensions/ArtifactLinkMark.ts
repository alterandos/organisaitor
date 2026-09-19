import { Mark, mergeAttributes } from '@tiptap/core';

// Marks a span of note text as the source of a cross-app entity created from it
// (currently only 'task'; 'event' | 'listItem' are the planned next targets — see
// FloatingToolbar's create-menu comment). Rendered distinctly from both the plain
// `link` mark and the `noteTag` mark (dashed underline + a small type icon) so a
// reader can tell at a glance this text spawned something elsewhere in the suite.
export const ArtifactLinkMark = Mark.create({
  name: 'artifactLink',

  addAttributes() {
    return {
      targetType: { default: null },
      targetId:   { default: null },
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
