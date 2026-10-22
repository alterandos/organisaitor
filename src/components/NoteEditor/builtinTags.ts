// Future cross-app actions a built-in tag can trigger (not yet wired).
// When implementing: read tag.actions in FloatingToolbar/applyTagItem and
// dispatch to the shared event bus (e.g. emit 'create-task' with the selected text).
export type BuiltinTagActionType = 'create-task';

export interface BuiltinTagAction {
  type: BuiltinTagActionType;
  // Additional action-specific config can be added here as the integration is built
}

export interface BuiltinTag {
  id: string;
  name: string;
  icon: string;
  color: string;
  typeKey: string;
  actions?: BuiltinTagAction[];
}

// `color` is a hex, since a tag made from a built-in copies it as its own colour. Where the app draws
// a Glossary kind (cards, chips, linked text) it uses the theme token instead: kindColor().
export const BUILTIN_TAGS: BuiltinTag[] = [
  { id: 'builtin-important',   name: 'Important',   icon: '⭐', color: '#f59e0b', typeKey: 'important'   },
  { id: 'builtin-concept',     name: 'Concept',     icon: '💡', color: '#4338ca', typeKey: 'concept'     },
  { id: 'builtin-definition',  name: 'Definition',  icon: '📖', color: '#0f766e', typeKey: 'definition'  },
  { id: 'builtin-profile',     name: 'Profile',     icon: '🪪', color: '#be185d', typeKey: 'profile'     },
  { id: 'builtin-example',     name: 'Example',     icon: '📋', color: '#f97316', typeKey: 'example'     },
  { id: 'builtin-question',    name: 'Question',    icon: '❓', color: '#ef4444', typeKey: 'question'    },
  { id: 'builtin-reference',   name: 'Reference',   icon: '📚', color: '#0891b2', typeKey: 'reference'   },
  {
    id:      'builtin-learn-later',
    name:    'Learn Later',
    icon:    '🔖',
    color:   '#7c3aed',
    typeKey: 'learn-later',
    actions: [{ type: 'create-task' }],
  },
  // Structured tag type (see src/config/structuredTagTypes.ts) — applying this one opens a
  // small create/preview popover instead of tagging immediately, and creates a separate
  // StructuredTagEntry alongside the mark. Kept last so Ctrl+1-7 (the existing built-ins)
  // stay on the same keys; this becomes Ctrl+8.
  { id: 'builtin-acronym', name: 'Acronym', icon: '🔤', color: '#4d7c0f', typeKey: 'acronym' },
];

const KIND_TOKENS = ['definition', 'concept', 'acronym', 'profile'];

// The colour the app draws a Glossary kind in: its theme token (index.css --color-kind-*), so it
// reads in both themes; any other built-in tag's own colour.
export function kindColor(typeKey: string | null | undefined, fallback: string): string {
  if (typeKey && KIND_TOKENS.includes(typeKey)) return `var(--color-kind-${typeKey})`;
  return BUILTIN_TAGS.find((t) => t.typeKey === typeKey)?.color ?? fallback;
}
