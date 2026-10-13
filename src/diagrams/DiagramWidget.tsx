import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Background, ConnectionMode, Handle, MarkerType, Panel, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LABELS } from '@/config/labels';
import { layoutDiagram, nodeSize } from './diagramLayout';
import { newEdge, newNode, type DiagramKind, type DiagramShape, type DiagramSpec } from './diagramSpec';
import styles from './DiagramWidget.module.css';

// Showing and editing a diagram (a DiagramSpec), for every app that has one; the note block
// (NoteEditor/extensions/Diagram.ts) is one host. Its own chunk: it's imported lazily, with
// @xyflow/react and dagre, the first time a diagram is shown. Every change is reported whole
// through onCommit(spec); the host stores it. Everything is reachable by buttons as well as by
// mouse gestures (double-click to rename, drag to connect), so it works on touch.

export interface DiagramWidgetProps {
  spec:        DiagramSpec;
  kind:        DiagramKind;
  editable:    boolean;
  onCommit:    (spec: DiagramSpec) => void;
  onEscape:    () => void;     // Esc (not renaming): the host selects its block
  focusSignal: number;         // changes when the host asks for the keyboard (typing on the block)
}

interface ShapeData extends Record<string, unknown> {
  label: string; shape: DiagramShape; editing: boolean;
  rename: (id: string, label: string) => void; stopEditing: () => void;
}

const L = LABELS.diagrams;

function ShapeNode({ id, data }: NodeProps<Node<ShapeData>>) {
  const { width, height } = nodeSize({ label: data.label, shape: data.shape });
  const finish = (value: string) => { data.rename(id, value.trim()); data.stopEditing(); };
  // A new box is hidden until React Flow has measured it, so focus waits a couple of frames.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!data.editing) return;
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => inputRef.current?.focus()); });
    return () => cancelAnimationFrame(frame);
  }, [data.editing]);
  return (
    <div className={`${styles.node} ${styles[data.shape]}`} style={{ width, height }}>
      {data.shape === 'diamond' && (
        <svg className={styles.diamondShape} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="50,2 98,50 50,98 2,50" />
          <polygon points="50,2 98,50 50,98 2,50" />
        </svg>
      )}
      {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => (
        <Handle key={side} id={side} type="source" position={Position[side]} className={styles.handle} />
      ))}
      {data.editing ? (
        <input ref={inputRef} className={`${styles.labelInput} nodrag`} defaultValue={data.label} aria-label={L.rename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') finish(e.currentTarget.value);
            else if (e.key === 'Escape') { e.stopPropagation(); data.stopEditing(); }
          }}
          onBlur={(e) => finish(e.currentTarget.value)} />
      ) : (
        <span className={data.label ? styles.label : `${styles.label} ${styles.placeholder}`}>{data.label || L.untitled}</span>
      )}
    </div>
  );
}

const NODE_TYPES = { shape: ShapeNode };
const FIT = { padding: 0.2, maxZoom: 1 };

// What the add buttons make in each design.
const ADD_SHAPES: Record<DiagramKind, DiagramShape[]> = {
  free: ['round'],
  flow: ['round'],
  flowchart: ['box', 'diamond', 'oval'],
};

function Inner({ spec, kind, editable, onCommit, onEscape, focusSignal }: DiagramWidgetProps) {
  const flow = useReactFlow();
  const flowRef = useRef(flow);
  useEffect(() => { flowRef.current = flow; });
  const wrapRef = useRef<HTMLDivElement>(null);
  const positions = useMemo(() => layoutDiagram(spec, kind), [spec, kind]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ node: string | null; edge: string | null }>({ node: null, edge: null });
  const [edgeLabel, setEdgeLabel] = useState<{ id: string; value: string } | null>(null);
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});
  // Each box's measured size, handed back on every render: a box given without it is measured
  // again, hidden for a moment, which made the second click of a double-click miss it.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => { if (focusSignal) wrapRef.current?.focus(); }, [focusSignal]);
  // The arranged designs re-fit when boxes or arrows are added or removed (not on every render);
  // Free keeps the view where it is. Never zoomed in past 100%, so one box isn't drawn huge.
  useEffect(() => {
    if (kind === 'free') return;
    const t = setTimeout(() => flowRef.current.fitView({ ...FIT, duration: 150 }), 0);
    return () => clearTimeout(t);
  }, [kind, spec.nodes.length, spec.edges.length]);

  const commit = (next: DiagramSpec) => onCommit(next);
  const rename = (id: string, label: string) => {
    if (spec.nodes.find((n) => n.id === id)?.label === label) return;
    commit({ ...spec, nodes: spec.nodes.map((n) => (n.id === id ? { ...n, label } : n)) });
  };

  const nodes: Node<ShapeData>[] = spec.nodes.map((n) => ({
    id: n.id, type: 'shape',
    position: drag[n.id] ?? positions.get(n.id) ?? { x: n.x, y: n.y },
    data: { label: n.label, shape: n.shape, editing: editingId === n.id, rename, stopEditing: () => { setEditingId(null); wrapRef.current?.focus(); } },
    selected: selected.node === n.id,
    draggable: editable && kind === 'free',
    ...(measured[n.id] ? { measured: measured[n.id] } : {}),
  }));
  // Each arrow leaves the side of its box that faces the box it points to (and enters the facing side).
  const centre = (id: string) => {
    const n = spec.nodes.find((x) => x.id === id)!;
    const p = drag[id] ?? positions.get(id) ?? { x: n.x, y: n.y };
    const { width, height } = nodeSize(n);
    return { x: p.x + width / 2, y: p.y + height / 2 };
  };
  const sides = (from: string, to: string): [string, string] => {
    const a = centre(from);
    const b = centre(to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? ['Bottom', 'Top'] : ['Top', 'Bottom'];
    return dx >= 0 ? ['Right', 'Left'] : ['Left', 'Right'];
  };
  const edges: Edge[] = spec.edges.map((e) => ({
    id: e.id, source: e.from, target: e.to, label: e.label || undefined,
    sourceHandle: sides(e.from, e.to)[0], targetHandle: sides(e.from, e.to)[1],
    type: kind === 'free' ? 'default' : 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
    selected: selected.edge === e.id,
  }));

  const onNodesChange = (changes: NodeChange<Node<ShapeData>>[]) => {
    const removed: string[] = [];
    for (const c of changes) {
      if (c.type === 'position' && c.position) setDrag((d) => ({ ...d, [c.id]: c.position! }));
      if (c.type === 'dimensions' && c.dimensions) setMeasured((m) => ({ ...m, [c.id]: c.dimensions! }));
      if (c.type === 'select') setSelected((s) => ({ node: c.selected ? c.id : s.node === c.id ? null : s.node, edge: c.selected ? null : s.edge }));
      if (c.type === 'remove') removed.push(c.id);
    }
    if (removed.length && editable) {
      const gone = new Set(removed);
      commit({ nodes: spec.nodes.filter((n) => !gone.has(n.id)), edges: spec.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)) });
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    const removed = new Set<string>();
    for (const c of changes) {
      if (c.type === 'select') setSelected((s) => ({ edge: c.selected ? c.id : s.edge === c.id ? null : s.edge, node: c.selected ? null : s.node }));
      if (c.type === 'remove') removed.add(c.id);
    }
    if (removed.size && editable) commit({ ...spec, edges: spec.edges.filter((e) => !removed.has(e.id)) });
  };
  const onConnect = (c: Connection) => {
    if (!editable || !c.source || !c.target || c.source === c.target) return;
    if (spec.edges.some((e) => e.from === c.source && e.to === c.target)) return;
    commit({ ...spec, edges: [...spec.edges, newEdge(c.source, c.target)] });
  };
  const onDragStop = (_: unknown, node: Node) => {
    commit({ ...spec, nodes: spec.nodes.map((n) => (n.id === node.id ? { ...n, x: Math.round(node.position.x), y: Math.round(node.position.y) } : n)) });
    setDrag((d) => { const next = { ...d }; delete next[node.id]; return next; });
  };

  // A new box: after the selected one (linked to it), else below the others; ready to type into.
  const add = (shape: DiagramShape) => {
    const from = selected.node ? spec.nodes.find((n) => n.id === selected.node) : null;
    const at = from ? positions.get(from.id) ?? { x: from.x, y: from.y } : { x: 0, y: Math.max(0, ...spec.nodes.map((n) => (positions.get(n.id)?.y ?? n.y) + 90)) };
    const node = newNode(shape, Math.round(at.x + (from ? 200 : 0)), Math.round(at.y));
    commit({ nodes: [...spec.nodes, node], edges: from ? [...spec.edges, newEdge(from.id, node.id)] : spec.edges });
    setSelected({ node: node.id, edge: null });
    setEditingId(node.id);
  };
  const setShape = (shape: DiagramShape) => {
    if (!selected.node) return;
    commit({ ...spec, nodes: spec.nodes.map((n) => (n.id === selected.node ? { ...n, shape } : n)) });
  };
  const removeSelected = () => {
    if (selected.node) onNodesChange([{ type: 'remove', id: selected.node }]);
    else if (selected.edge) onEdgesChange([{ type: 'remove', id: selected.edge }]);
    setSelected({ node: null, edge: null });
  };
  const saveEdgeLabel = () => {
    if (!edgeLabel) return;
    commit({ ...spec, edges: spec.edges.map((e) => (e.id === edgeLabel.id ? { ...e, label: edgeLabel.value.trim() } : e)) });
    setEdgeLabel(null);
  };

  // The diagram's keys are its own: none reach the note or the app's shortcuts. Esc selects the block.
  const keyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !editingId && !edgeLabel) { e.preventDefault(); onEscape(); }
    e.stopPropagation();
  };

  const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  return (
    <div ref={wrapRef} className={styles.wrap} tabIndex={-1} onKeyDown={keyDown} data-kind={kind}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDragStop={onDragStop}
        onNodeDoubleClick={(_, n) => editable && setEditingId(n.id)}
        onEdgeDoubleClick={(_, e) => editable && setEdgeLabel({ id: e.id, value: (e.label as string) ?? '' })}
        connectionMode={ConnectionMode.Loose}
        nodesConnectable={editable} elementsSelectable
        deleteKeyCode={editable && !editingId && !edgeLabel ? ['Delete', 'Backspace'] : null}
        fitView fitViewOptions={FIT} minZoom={0.3} maxZoom={2}
        colorMode={dark ? 'dark' : 'light'}
        zoomOnScroll={false} preventScrolling={false}
        zoomOnDoubleClick={false}   /* a double-click renames a box; zooming on it swallowed the event */
      >
        <Background gap={20} size={1} />
        {editable && (
          // The buttons don't keep focus (a click mustn't leave Space or Enter pressing them again).
          <Panel position="top-left" className={styles.toolbar} onMouseDown={(e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') e.preventDefault(); }}>
            {ADD_SHAPES[kind].map((shape) => (
              <button key={shape} type="button" onClick={() => add(shape)} title={selected.node ? L.addAfter(L.shapes[shape]) : L.add(L.shapes[shape])}>+ {L.shapes[shape]}</button>
            ))}
            {selected.node && kind === 'flowchart' && (
              <select aria-label={L.shape} value={spec.nodes.find((n) => n.id === selected.node)?.shape ?? 'box'} onChange={(e) => setShape(e.target.value as DiagramShape)}>
                {ADD_SHAPES.flowchart.map((s) => <option key={s} value={s}>{L.shapes[s]}</option>)}
              </select>
            )}
            {selected.node && <button type="button" onClick={() => setEditingId(selected.node)}>{L.rename}</button>}
            {selected.edge && <button type="button" onClick={() => setEdgeLabel({ id: selected.edge!, value: spec.edges.find((e) => e.id === selected.edge)?.label ?? '' })}>{L.labelArrow}</button>}
            {(selected.node || selected.edge) && <button type="button" onClick={removeSelected}>{L.remove}</button>}
          </Panel>
        )}
        {edgeLabel && (
          <Panel position="top-right" className={styles.toolbar}>
            <input autoFocus aria-label={L.labelArrow} placeholder={L.arrowPlaceholder} value={edgeLabel.value}
              onChange={(e) => setEdgeLabel({ ...edgeLabel, value: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') saveEdgeLabel();
                else if (e.key === 'Escape') { e.stopPropagation(); setEdgeLabel(null); }
              }}
              onBlur={saveEdgeLabel} />
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default function DiagramWidget(props: DiagramWidgetProps) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
