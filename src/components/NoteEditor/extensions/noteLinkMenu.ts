import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { ContextMenuItem } from '@/contextMenu/types';
import { LABELS } from '@/config/labels';
import { EMBED_ICON, NOTE_LINK_ICON } from '@/config/itemIcons';
import { openNoteLink } from '@/services/noteLinkTargets';
import type { NoteEditorMenuApi } from '../contextMenu';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { unlinkNoteLinkAt } from './NoteLink';
import { EMBED_DESIGNS, copyEmbedAsText, type EmbedVariant } from './NoteEmbed';

// Right-click on a note link: Open, Unlink. On selected text: Link to a note…. On an embedded
// passage: Open where it comes from, Copy as text here, Design ▸, Frame ▸.

const linkAt = (target: Element | null) => target?.closest('a[data-note-link]') as HTMLElement | null;

registerContextMenuProvider({
  id: 'note-editor.note-link',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!linkAt(ctx.target),
  items: (ctx, scope) => {
    const api = scope.data as NoteEditorMenuApi;
    const el = linkAt(ctx.target)!;
    const view = api.editor.view;
    const open = () => openNoteLink(el.getAttribute('data-note-link') ?? '', el.getAttribute('data-note-tab'), el.getAttribute('data-note-block-id'));
    const items: ContextMenuItem[] = [{ id: 'note-link-open', label: LABELS.noteLinks.open, icon: NOTE_LINK_ICON, run: open }];
    if (api.editor.isEditable) {
      items.push({ id: 'note-link-unlink', label: LABELS.noteObjects.link.unlink, icon: '⛓', run: () => { try { unlinkNoteLinkAt(view, view.posAtDOM(el, 0)); } catch { /* the link left the page */ } } });
    }
    return items;
  },
});

registerContextMenuProvider({
  id: 'note-editor.link-to-note',
  kind: 'note-editor',
  order: 8,
  items: (_ctx, scope) => {
    const api = scope.data as NoteEditorMenuApi;
    const { state } = api.editor;
    if (state.selection.empty || !api.editor.isEditable) return [];
    return [{ id: 'link-to-note', label: LABELS.noteLinks.menu, icon: NOTE_LINK_ICON, run: () => api.linkToNote() }];
  },
});

registerContextMenuProvider({
  id: 'note-editor.note-embed',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="note-embed"]'),
  items: (ctx, scope) => {
    const api = scope.data as NoteEditorMenuApi;
    const view = api.editor.view;
    const dom = ctx.target.closest('[data-type="note-embed"]')!;
    let pos: number | null = null;
    try { const p = view.posAtDOM(dom, 0); for (const c of [p, p - 1]) if (view.state.doc.nodeAt(c)?.type.name === 'noteEmbed') pos = c; } catch { /* not in this editor */ }
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const at = pos;
    const L = LABELS.noteLinks;
    const items: ContextMenuItem[] = [{ id: 'embed-open', label: L.embedOpen, icon: EMBED_ICON, run: () => openNoteLink(node.attrs.noteId, node.attrs.tabId, node.attrs.blockId) }];
    if (!api.editor.isEditable) return items;
    return [
      ...items,
      { id: 'embed-copy', label: L.embedCopy, run: () => copyEmbedAsText(api.editor, at) },
      designMenuItem(EMBED_DESIGNS, node.attrs.variant as EmbedVariant, (variant) => view.dispatch(view.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, variant }))),
      frameMenuItem(view, at, node.attrs),
    ];
  },
});
