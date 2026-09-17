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

export const BUILTIN_TAGS: BuiltinTag[] = [
  { id: 'builtin-important',   name: 'Important',   icon: '⭐', color: '#f59e0b', typeKey: 'important'   },
  { id: 'builtin-concept',     name: 'Concept',     icon: '💡', color: '#6366f1', typeKey: 'concept'     },
  { id: 'builtin-definition',  name: 'Definition',  icon: '📖', color: '#10b981', typeKey: 'definition'  },
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
  { id: 'builtin-acronym', name: 'Acronym', icon: '🔤', color: '#0d9488', typeKey: 'acronym' },
];
