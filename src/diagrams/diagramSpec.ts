import { nanoid } from 'nanoid';

// A diagram anywhere in the suite, described neutrally: boxes and the arrows between them. Like
// ChartSpec (src/charts/chartSpec.ts), this is the only thing stored; the drawing library
// (@xyflow/react, in DiagramWidget.tsx) and the layout library (@dagrejs/dagre, diagramLayout.ts)
// can be swapped without touching a saved note. How it's arranged is the block's design, held
// beside it: Free (positions as dragged), Flow (arranged left to right), Flowchart (top to bottom,
// with step, decision and start/end shapes).

export const DIAGRAM_KINDS = ['free', 'flow', 'flowchart'] as const;
export type DiagramKind = typeof DIAGRAM_KINDS[number];

export const DIAGRAM_SHAPES = ['box', 'round', 'diamond', 'oval'] as const;
export type DiagramShape = typeof DIAGRAM_SHAPES[number];

export interface DiagramNodeSpec { id: string; label: string; shape: DiagramShape; x: number; y: number }
export interface DiagramEdgeSpec { id: string; from: string; to: string; label: string }
export interface DiagramSpec { nodes: DiagramNodeSpec[]; edges: DiagramEdgeSpec[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const text = (v: unknown) => (typeof v === 'string' ? v : '');

// Whatever was stored, as a valid spec: unknown shapes become boxes, arrows to missing boxes go.
export function normalizeDiagram(raw: unknown): DiagramSpec {
  if (!isObj(raw)) return emptyDiagram();
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).filter(isObj).map((n): DiagramNodeSpec => ({
    id: text(n.id) || nanoid(8),
    label: text(n.label),
    shape: (DIAGRAM_SHAPES as readonly string[]).includes(text(n.shape)) ? (n.shape as DiagramShape) : 'box',
    x: num(n.x), y: num(n.y),
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).filter(isObj)
    .map((e): DiagramEdgeSpec => ({ id: text(e.id) || nanoid(8), from: text(e.from), to: text(e.to), label: text(e.label) }))
    .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  return { nodes, edges };
}

export const emptyDiagram = (): DiagramSpec => ({ nodes: [{ id: nanoid(8), label: '', shape: 'round', x: 0, y: 0 }], edges: [] });

export const newNode = (shape: DiagramShape, x: number, y: number, label = ''): DiagramNodeSpec => ({ id: nanoid(8), label, shape, x, y });
export const newEdge = (from: string, to: string, label = ''): DiagramEdgeSpec => ({ id: nanoid(8), from, to, label });

// As plain text: each box, then each arrow ("Idea → Plan (yes)").
export function diagramToText(spec: DiagramSpec): string {
  const name = new Map(spec.nodes.map((n) => [n.id, n.label || '…']));
  const lines = spec.edges.map((e) => `${name.get(e.from)} → ${name.get(e.to)}${e.label ? ` (${e.label})` : ''}`);
  const linked = new Set(spec.edges.flatMap((e) => [e.from, e.to]));
  for (const n of spec.nodes) if (!linked.has(n.id) && n.label) lines.push(n.label);
  return lines.join('\n');
}
