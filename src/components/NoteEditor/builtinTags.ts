export interface BuiltinTag {
  id: string;
  name: string;
  icon: string;
  color: string;
  typeKey: string;
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
  },
  { id: 'builtin-acronym', name: 'Acronym', icon: '🔤', color: '#4d7c0f', typeKey: 'acronym' },
  { id: 'builtin-fact', name: 'Fact', icon: '✨', color: '#8a6500', typeKey: 'fact' },
  { id: 'builtin-quote', name: 'Quote', icon: '❞', color: '#9a3412', typeKey: 'quote' },
  { id: 'builtin-formula', name: 'Formula', icon: 'ƒ', color: '#1e40af', typeKey: 'formula' },
  // The Example Glossary kind (key `instance`, 2026-11-12), apart from the Example annotation above.
  { id: 'builtin-instance', name: 'Example', icon: '👉', color: '#5b21b6', typeKey: 'instance' },
];

// The tags Ctrl+Space and Ctrl+1…9 put on text (2026-11-03, the user's call: marking text is apart
// from making cards, which is `\` and right-click's Turn into). The rest of BUILTIN_TAGS are the
// Glossary kinds, plus Question, Quote and Learn Later, no longer offered as tags (a question and a
// quote are blocks, Learn Later is Review later): passages marked with them before still show.
const TEXT_TAG_IDS = ['builtin-important', 'builtin-example', 'builtin-reference'];
export const TEXT_TAGS: BuiltinTag[] = TEXT_TAG_IDS.map((id) => BUILTIN_TAGS.find((t) => t.id === id)!);

const KIND_TOKENS = ['definition', 'concept', 'acronym', 'profile', 'fact', 'quote', 'formula', 'instance'];

// The colour the app draws a Glossary kind in: its theme token (index.css --color-kind-*), so it
// reads in both themes; any other built-in tag's own colour.
export function kindColor(typeKey: string | null | undefined, fallback: string): string {
  if (typeKey && KIND_TOKENS.includes(typeKey)) return `var(--color-kind-${typeKey})`;
  return BUILTIN_TAGS.find((t) => t.typeKey === typeKey)?.color ?? fallback;
}
