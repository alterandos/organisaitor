import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { CODE_DESIGNS, CODE_LANGUAGES, PLAIN_TEXT, codePosAt, copyCode, setCodeSettings, type CodeVariant } from './CodeBlock';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a code block: copy its code, its design, its language, its frame.
registerContextMenuProvider({
  id: 'note-editor.code',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="code-block"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = codePosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.code;
    const lang = node.attrs.language as string | null;
    const pick = (language: string | null) => setCodeSettings(view, pos, { language });
    return [
      { id: 'code-copy', label: L.copyTitle, icon: '⎘', run: () => { void copyCode(node.textContent); } },
      designMenuItem(CODE_DESIGNS, node.attrs.variant as CodeVariant, (v) => setCodeSettings(view, pos, { variant: v })),
      {
        id: 'code-language', label: L.language, icon: '‹›',
        submenu: [
          [
            { id: 'code-lang-auto', label: L.auto, icon: lang === null ? '✓' : undefined, run: () => pick(null) },
            { id: 'code-lang-plain', label: L.plainText, icon: lang === PLAIN_TEXT ? '✓' : undefined, run: () => pick(PLAIN_TEXT) },
          ],
          CODE_LANGUAGES.map((l) => ({ id: `code-lang-${l.id}`, label: l.label, icon: lang === l.id ? '✓' : undefined, run: () => pick(l.id) })),
        ],
      },
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});
