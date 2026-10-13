import { useMemo, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { useUIStore } from '@/store/uiStore';
import { useNoteViews } from '@/store/noteViews';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListViews } from '@/store/listViews';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { buildNoteMap, type MapItemInput, type MapNode } from '@/utils/noteMap';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { MapIcon } from '@/components/Icons';
import type { CrossAppRef } from '@/types';
import styles from './MapView.module.css';

// The Notes Map, a Place (Quick Access, the Notes header): every note that links to another, joined
// by its links, thicker for more of them; optionally the tasks, events and lists linked to them.
// "Around the open note" shows only what's within two links of it. Click anything to open it; Esc
// goes back. Its own chunk (React Flow and dagre load the first time it's opened). Read-only in v1.

const MAX_NODES = 150;
const NODE_H = 36;
const nodeWidth = (n: MapNode) => Math.min(220, Math.max(90, n.label.length * 7 + 44));

interface MapData extends Record<string, unknown> { node: MapNode }

function MapNodeView({ data }: NodeProps<Node<MapData>>) {
  const n = data.node;
  const icon = n.kind === 'note' ? ITEM_TYPE_ICON.note : ITEM_TYPE_ICON[n.kind];
  return (
    <div
      className={`${styles.node} ${n.kind === 'note' ? styles.noteNode : styles.itemNode} ${n.focus ? styles.focus : ''} ${n.done ? styles.done : ''}`}
      style={{ width: nodeWidth(n), height: NODE_H }}
      title={LABELS.noteMap.nodeTitle(n.label || LABELS.mobileNotes.untitled, n.degree)}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} isConnectable={false} />
      <span aria-hidden="true">{icon}</span>
      <span className={styles.label}>{n.label || LABELS.mobileNotes.untitled}</span>
      <Handle type="source" position={Position.Right} className={styles.handle} isConnectable={false} />
    </div>
  );
}

const NODE_TYPES = { map: MapNodeView };

const refsTo = (refs: CrossAppRef[] | undefined) => (refs ?? []).filter((r) => r.type === 'note').map((r) => r.id);

function layout(nodes: MapNode[], edges: { from: string; to: string }[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: nodeWidth(n), height: NODE_H });
  for (const e of edges) g.setEdge(e.from, e.to);
  dagre.layout(g);
  return new Map(nodes.map((n) => { const p = g.node(n.id); return [n.id, { x: p.x - nodeWidth(n) / 2, y: p.y - NODE_H / 2 }]; }));
}

function MapCanvas() {
  const close = useUIStore((s) => s.closeNotesMap);
  const openNote = useUIStore((s) => s.openNote);
  const openNoteId = useUIStore((s) => s.editingNoteId ?? s.notesLastEditingNoteId);
  const views = useNoteViews();
  const tasks = useTaskStore((s) => s.tasks);
  const events = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const lists = useListViews();
  const [around, setAround] = useState(false);
  const [includeItems, setIncludeItems] = useState(false);
  const L = LABELS.noteMap;

  useEscapeClose(close);

  const items = useMemo<MapItemInput[]>(() => {
    if (!includeItems) return [];
    const out: MapItemInput[] = [];
    for (const t of Object.values(tasks)) if (!t.archived) out.push({ type: 'task', id: t.id, title: t.title, done: t.completed, noteIds: refsTo(t.crossAppRefs) });
    for (const e of Object.values(events)) if (!e.archivedAt) out.push({ type: 'event', id: e.id, title: e.title, done: false, noteIds: refsTo(e.crossAppRefs) });
    for (const r of Object.values(reminders)) if (!r.archivedAt) out.push({ type: 'reminder', id: r.id, title: r.title, done: false, noteIds: refsTo(r.crossAppRefs) });
    for (const d of Object.values(deadlines)) if (!d.archivedAt) out.push({ type: 'deadline', id: d.id, title: d.title, done: false, noteIds: refsTo(d.crossAppRefs) });
    for (const l of Object.values(lists)) out.push({ type: 'list', id: l.id, title: l.name, done: false, noteIds: refsTo(l.crossAppRefs) });
    return out.filter((i) => i.noteIds.length > 0);
  }, [includeItems, tasks, events, reminders, deadlines, lists]);

  const focusNoteId = around ? openNoteId : null;
  const map = useMemo(
    () => buildNoteMap(Object.values(views), items, { includeItems, focusNoteId, depth: 2, maxNodes: MAX_NODES }),
    [views, items, includeItems, focusNoteId],
  );

  const { rfNodes, rfEdges } = useMemo(() => {
    const pos = layout(map.nodes, map.edges);
    const rfNodes: Node<MapData>[] = map.nodes.map((n) => ({ id: n.id, type: 'map', position: pos.get(n.id)!, data: { node: n }, draggable: true, connectable: false }));
    const rfEdges: Edge[] = map.edges.map((e) => ({
      id: e.id, source: e.from, target: e.to,
      className: e.kind === 'item' ? styles.itemEdge : styles.noteEdge,
      style: { strokeWidth: Math.min(5, 1 + e.weight * 0.75) },
    }));
    return { rfNodes, rfEdges };
  }, [map]);

  const open = (n: MapNode) => {
    if (n.kind === 'note') { close(); openNote(n.refId); }
    else openArtifactTarget(n.kind, n.refId);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}><MapIcon className={styles.titleIcon} />{L.title}</span>
        <div className={styles.scope} role="group">
          <button type="button" aria-pressed={!around} className={!around ? styles.on : undefined} onClick={() => setAround(false)}>{L.all}</button>
          <button type="button" aria-pressed={around} className={around ? styles.on : undefined} onClick={() => setAround(true)} disabled={!openNoteId} title={openNoteId ? undefined : L.aroundNone}>{L.around}</button>
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={includeItems} onChange={(e) => setIncludeItems(e.target.checked)} />
          {L.items}
        </label>
        {map.total > map.nodes.length && <span className={styles.note}>{L.truncated(map.nodes.length, map.total)}</span>}
        <button type="button" className={styles.closeBtn} onClick={close} title={L.back} aria-label={L.back}>×</button>
      </div>
      {map.nodes.length === 0 ? (
        <p className={styles.empty}>{L.empty}</p>
      ) : (
        <div className={styles.canvas}>
          <ReactFlow
            key={`${around}:${includeItems}:${focusNoteId}`}
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onNodeClick={(_e, node) => open((node.data as MapData).node)}
            nodesConnectable={false}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} />
            <Controls position="top-right" showInteractive={false} fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }} />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}

export default function MapView() {
  return <ReactFlowProvider><MapCanvas /></ReactFlowProvider>;
}
