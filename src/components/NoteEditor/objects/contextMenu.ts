import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { ContextMenuContext, ContextMenuScope } from '@/contextMenu/types';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { ARTIFACT_TYPES } from './artifactTypes';
import { flagMenuItems } from './flags';
import { findArtifactGroup, setArtifactDisplay, unlinkArtifactGroup } from './artifactGroups';

// Right-click on linked text (or anywhere on its pane): the pane's own actions, plus the item's
// extras (its flags and repeat, which the visual pane doesn't offer).

function linkAt(ctx: ContextMenuContext, scope: ContextMenuScope) {
  const { editor } = scope.data as NoteEditorMenuApi;
  const view = editor.view;
  const widget = ctx.target.closest<HTMLElement>('[data-artifact-target]');
  const mark = ctx.target.closest<HTMLElement>('mark[data-artifact-id]');
  const key = widget?.dataset.artifactTarget
    ?? (mark ? `${mark.getAttribute('data-artifact-type')}:${mark.getAttribute('data-artifact-id')}` : null);
  if (!key) return null;
  let pos: number;
  try { pos = view.posAtDOM(widget ?? mark!, 0); } catch { return null; }
  const group = findArtifactGroup(view.state.doc, key, pos);
  return group ? { view, group, pos } : null;
}

registerContextMenuProvider({
  id: 'note-editor.artifact-link',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('[data-artifact-target], mark[data-artifact-id]'),
  items: (ctx, scope) => {
    const link = linkAt(ctx, scope);
    if (!link) return [];
    const { view, group, pos } = link;
    const L = LABELS.noteObjects.link;
    const def = ARTIFACT_TYPES[group.targetType as keyof typeof ARTIFACT_TYPES];
    const summary = def?.summarize(group.targetId) ?? null;
    const expanded = group.display === 'expanded';
    return [
      { id: 'open', label: L.open, icon: '↗', disabled: !summary, run: () => { openArtifactTarget(group.targetType, group.targetId); } },
      { id: 'display', label: expanded ? L.hideDetails : L.showDetails, icon: expanded ? '▴' : '▾', run: () => setArtifactDisplay(view, group.key, pos, expanded ? 'basic' : 'expanded') },
      ...(summary && summary.done !== null && def?.toggleDone
        ? [{ id: 'done', label: summary.done ? L.markNotDone : L.markDone, icon: summary.done ? '☐' : '☑', run: () => def.toggleDone!(group.targetId) }]
        : []),
      ...(summary && def?.flags ? flagMenuItems(def.flags(group.targetId)) : []),
      { id: 'unlink', label: L.unlink, icon: '✕', run: () => unlinkArtifactGroup(view, group.key, pos) },
    ];
  },
});
