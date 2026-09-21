import type { Editor } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';

// dataTransfer type carrying a "Linked from" pill while it is dragged into the editor.
export const ARTIFACT_DRAG_TYPE = 'application/x-organisaitor-artifact';

interface ArtifactDragData { targetType: string; targetId: string; title: string }

// A pill becomes exactly what highlighting text and linking it would have made: the item's title
// as text carrying an `artifactLink` mark (clickable, Ctrl+click selects it, "Remove link" clears
// it). A plain space follows so typing on doesn't extend the link. The text is a snapshot of the
// title, so it is not renamed if the item is renamed later.
export function insertArtifactLinkAtSelection(editor: Editor, targetType: string, targetId: string, title: string) {
  editor.chain().focus().insertContent([
    { type: 'text', text: title, marks: [{ type: 'artifactLink', attrs: { targetType, targetId } }] },
    { type: 'text', text: ' ' },
  ]).run();
}

// Removes every artifactLink mark pointing at the target from the live document (text stays), so
// unlinking from the "Linked from" bar doesn't leave marked text behind in the open tab.
export function removeArtifactMarksFor(editor: Editor, targetType: string, targetId: string) {
  editor.chain().command(({ tr, state }) => {
    state.doc.descendants((node, pos) => {
      node.marks.forEach((m) => {
        if (m.type.name === 'artifactLink' && m.attrs.targetType === targetType && m.attrs.targetId === targetId) {
          tr.removeMark(pos, pos + node.nodeSize, m);
        }
      });
    });
    return true;
  }).run();
}

// Editor `handleDrop`: returns true when the drop carried a pill and it was inserted at the drop point.
export function handleArtifactDrop(view: EditorView, event: DragEvent): boolean {
  const raw = event.dataTransfer?.getData(ARTIFACT_DRAG_TYPE);
  if (!raw) return false;
  let data: ArtifactDragData;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  const markType = view.state.schema.marks.artifactLink;
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!markType || !at) return false;
  event.preventDefault();
  const schema = view.state.schema;
  const linked = schema.text(data.title, [markType.create({ targetType: data.targetType, targetId: data.targetId })]);
  view.dispatch(view.state.tr.insert(at.pos, [linked, schema.text(' ')]).scrollIntoView());
  view.focus();
  return true;
}
