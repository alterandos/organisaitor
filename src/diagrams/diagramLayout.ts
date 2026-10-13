import dagre from '@dagrejs/dagre';
import type { DiagramKind, DiagramNodeSpec, DiagramSpec } from './diagramSpec';

// Where each box goes in the arranged designs (Flow: left to right; Flowchart: top to bottom),
// worked out by dagre from the boxes and arrows. Computed when drawing, never stored. Free keeps
// the positions as dragged. Imported only by the widget (its own chunk) and tests.

export const nodeSize = (n: Pick<DiagramNodeSpec, 'label' | 'shape'>): { width: number; height: number } => {
  const width = Math.min(240, Math.max(n.shape === 'diamond' ? 130 : 110, n.label.length * 7.5 + 40));
  return { width, height: n.shape === 'diamond' ? 84 : 46 };
};

export function layoutDiagram(spec: DiagramSpec, kind: DiagramKind): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (kind === 'free') {
    for (const n of spec.nodes) out.set(n.id, { x: n.x, y: n.y });
    return out;
  }
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: kind === 'flow' ? 'LR' : 'TB', nodesep: 36, ranksep: 56, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of spec.nodes) g.setNode(n.id, nodeSize(n));
  for (const e of spec.edges) g.setEdge(e.from, e.to);
  dagre.layout(g);
  for (const n of spec.nodes) {
    const p = g.node(n.id);
    const { width, height } = nodeSize(n);
    out.set(n.id, { x: p.x - width / 2, y: p.y - height / 2 });
  }
  return out;
}
