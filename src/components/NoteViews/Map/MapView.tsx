import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Edge, type Node, type ReactFlowState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNotesBrowse } from '@/hooks/useNotesBrowse';
import { useNoteMapLinks } from '@/hooks/useNoteMapLinks';
import { notesNav } from '@/services/notesNav';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { LABELS } from '@/config/labels';
import { withViewTransition } from '@/utils/viewTransition';
import type { NoteGroup } from '@/utils/notesBrowse';
import type { MapItemType } from '@/utils/noteMap';
import { ViewBar } from '../ViewBar';
import { NoteLevel } from '../NoteLevel';
import { moveFocusInGrid } from '../gridFocus';
import { atlasLayout, type AtlasBlob } from './atlasLayout';
import { BlobLabelNode, BlobNode, DividerNode, ItemNode, LinkEdge, NoteNode, type BlobData, type ItemData, type LinkData, type NoteData } from './MapNodes';
import { LINKS_ZOOM, standInLinks } from './mapLinks';
import { blobShown, noteStandIn, openBlobs } from './mapDetail';
import { MapHover } from './mapHover';
import styles from './Map.module.css';

// The Map (rebuilt 2026-10-17 with the user): the notes as a map you pan and zoom. Each group (a
// notebook, Endeavour, Purpose or tag: the Group by) is a soft blob sized by what it holds,
// its own groups smaller blobs inside, its notes dots inside (atlasLayout). Zooming in shows more
// (smaller blobs' names, then the notes' titles); hovering a blob shows its notes' titles. Links
// between notes (and, when asked, to tasks, events and lists) are curves over it. Clicking a blob
// goes into it (the shared "where you are", so the Tree and the Mosaic follow); clicking a note
// opens it (NoteLevel). Built on the browse model (CLAUDE.md "Notes views").

const NODE_TYPES = { blob: BlobNode, label: BlobLabelNode, note: NoteNode, item: ItemNode, divider: DividerNode };
const EDGE_TYPES = { link: LinkEdge };
const FIT = { padding: 0.12, duration: 400 };
const ITEM_R = 11;
// How far a hovered blob's notes move out from its centre (a fraction of their distance from it).
const SPREAD = 0.55;

function MapCanvas() {
  const b = useNotesBrowse();
  const rf = useReactFlow();
  const L = LABELS.notesViews;
  const M = LABELS.noteMap;
  const [showLinks, setShowLinks] = useState(true);
  const [includeItems, setIncludeItems] = useState(false);
  const [around, setAround] = useState(false);
  const [hoverBlob, setHoverBlob] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Zoomed out, links are bundled between blobs (mapLinks.ts); this only changes when the zoom
  // crosses the line, so the links aren't rebuilt on every step of a zoom.
  const bundled = useStore((s) => s.transform[2] < LINKS_ZOOM);
  const [hoverNote, setHoverNote] = useState<string | null>(null);

  const here: NoteGroup | null = b.focusPath[b.focusPath.length - 1] ?? null;
  const looseLabel = L.unfiled(L.groupings[b.grouping]);
  const atlas = useMemo(() => atlasLayout(b.roots, b.loose, looseLabel, b.notebookOf), [b.roots, b.loose, looseLabel, b.notebookOf]);
  const noteList = useMemo(() => Object.values(b.notes), [b.notes]);
  const focusNoteId = around ? b.lastNoteId : null;
  const links = useNoteMapLinks(noteList, includeItems, focusNoteId);

  // Which blobs are open (mapDetail.ts), from the zoom and what is in view. Worked out on every
  // move, but the map is only rebuilt when the open set changes.
  const openKey = useStore(useCallback((s: ReactFlowState) => [...openBlobs(atlas.blobs, {
    x: s.transform[0], y: s.transform[1], zoom: s.transform[2], width: s.width, height: s.height,
  })].sort().join('|'), [atlas]));
  const open = useMemo(() => new Set(openKey ? openKey.split('|') : []), [openKey]);

  const goTo = (groupId: string | null) => notesNav.focusGroup(groupId);
  const openNote = (noteId: string) => withViewTransition('zoom-in', () => notesNav.openNote(noteId));
  const zoomTo = (x: AtlasBlob) => rf.fitBounds({ x: x.x - x.r, y: x.y - x.r, width: 2 * x.r, height: 2 * x.r }, FIT);

  const { nodes, edges } = useMemo(() => {
    const near = around ? new Set(links.nodes.map((n) => n.id)) : null;
    const dimNote = (id: string) => !!near && !near.has(`note:${id}`);
    const pos = new Map<string, (typeof atlas.notes)[number]>(atlas.notes.map((n) => [`note:${n.noteId}`, n]));
    const blobOf = new Map(atlas.blobs.map((bl) => [bl.id, bl] as const));
    const nodes: Node[] = [];
    // Blobs inside an open blob (and the islands): open ones show what is inside, closed ones are
    // whole. Clicking one goes into it: a group becomes the shared focus (and is zoomed to); any
    // other blob is zoomed to until it opens.
    const shown = atlas.blobs.filter((bl) => blobShown(bl, open));
    for (const bl of shown) {
      const data: BlobData = {
        blob: bl, dim: !!near, closed: !open.has(bl.id),
        onOpen: (x: AtlasBlob) => { if (x.groupId) goTo(x.groupId); else zoomTo(x); },
      };
      nodes.push({ id: `blob:${bl.id}`, type: 'blob', position: { x: bl.x - bl.r, y: bl.y - bl.r }, zIndex: bl.depth, draggable: false, selectable: false, focusable: false, data });
      nodes.push({ id: `label:${bl.id}`, type: 'label', position: { x: bl.x, y: bl.y - bl.r }, zIndex: 300, draggable: false, selectable: false, focusable: false, data });
    }
    if (atlas.divider) {
      const d = atlas.divider;
      nodes.push({ id: 'divider', type: 'divider', position: { x: d.x1, y: d.y }, zIndex: 0, draggable: false, selectable: false, focusable: false, data: { width: d.x2 - d.x1 } });
    }
    const visibleNotes = new Set<string>();
    for (const n of atlas.notes) {
      if (!open.has(n.blobId)) continue;
      visibleNotes.add(`note:${n.noteId}`);
      const blob = blobOf.get(n.blobId);
      const hereNotebook = blob && (blob.kind === 'notebook' || (blob.kind === 'group' && b.grouping === 'notebook')) ? blob.sourceId : null;
      nodes.push({
        id: `note:${n.noteId}`, type: 'note', position: { x: n.x - n.r, y: n.y - n.r }, zIndex: 100, draggable: false, selectable: false, focusable: false,
        style: { width: 2 * n.r, height: 2 * n.r },
        data: {
          noteId: n.noteId, blobId: n.blobId, name: b.nameOf(n.noteId), nameHere: b.nameOf(n.noteId, hereNotebook), dim: dimNote(n.noteId),
          spread: blob ? { x: (n.x - blob.x) * SPREAD, y: (n.y - blob.y) * SPREAD } : { x: 0, y: 0 },
          onOpen: openNote, onFocus: (id: string) => { const p = pos.get(`note:${id}`); if (p) rf.setCenter(p.x, p.y, { zoom: Math.max(rf.getZoom(), 1.6), duration: 250 }); },
        } satisfies NoteData,
      });
    }
    // Items from other apps sit just outside the first drawn note they link to.
    const placedItems = new Map<string, number>();
    for (const it of links.nodes) {
      if (it.kind === 'note') continue;
      const edge = links.edges.find((e) => e.kind === 'item' && (e.from === it.id || e.to === it.id) && visibleNotes.has(e.from === it.id ? e.to : e.from));
      const noteKey = edge ? (edge.from === it.id ? edge.to : edge.from) : null;
      const at = noteKey ? pos.get(noteKey) : undefined;
      if (!at || !noteKey) continue;
      const k = placedItems.get(noteKey) ?? 0;
      placedItems.set(noteKey, k + 1);
      const angle = -Math.PI / 4 + k * (Math.PI / 3);
      const dist = at.r + ITEM_R * 2.4;
      nodes.push({
        id: it.id, type: 'item', position: { x: at.x + Math.cos(angle) * dist - ITEM_R, y: at.y + Math.sin(angle) * dist - ITEM_R }, zIndex: 110,
        draggable: false, selectable: false, focusable: false, style: { width: 2 * ITEM_R, height: 2 * ITEM_R },
        data: { kind: it.kind as MapItemType, label: it.label, done: it.done, dim: !!near && !near.has(it.id), onOpen: () => openArtifactTarget(it.kind as MapItemType, it.refId) } satisfies ItemData,
      });
    }
    const present = new Set(nodes.map((n) => n.id));
    // What each end of a link attaches to: a drawn note (zoomed out, its blob, unless the link is
    // the hovered note's), a drawn item, or the closed blob a hidden note is in.
    const standIn = (key: string, l: { from: string; to: string }) => {
      const note = pos.get(key);
      if (!note) return present.has(key) ? key : undefined;
      const at = noteStandIn(note, blobOf, open);
      const own = !!hoverNote && (l.from === hoverNote || l.to === hoverNote);
      return at.startsWith('note:') && bundled && !own ? `blob:${note.blobId}` : at;
    };
    const isItem = (k: string) => !k.startsWith('note:') && !k.startsWith('blob:');
    const edges: Edge[] = !showLinks ? [] : standInLinks(links.edges, standIn).map((l) => {
      const blobAt = (k: string) => (k.startsWith('blob:') ? blobOf.get(k.slice(5)) : undefined);
      const fromBlob = blobAt(l.from);
      const toBlob = blobAt(l.to);
      return {
        type: 'link', selectable: false, focusable: false, id: l.id, source: l.from, target: l.to, zIndex: l.bundle ? 50 : 90,
        data: {
          weight: l.weight, item: isItem(l.from) || isItem(l.to), bundle: l.bundle, dim: !!near && !(near.has(l.from) && near.has(l.to)),
          blobs: [fromBlob?.id ?? pos.get(l.from)?.blobId, toBlob?.id ?? pos.get(l.to)?.blobId].filter((x): x is string => !!x),
          ends: [l.from, l.to], trimFrom: fromBlob?.r ?? 0, trimTo: toBlob?.r ?? 0,
        } satisfies LinkData,
      };
    });
    return { nodes, edges };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rf and the handlers are stable for what they do here
  }, [atlas, links, showLinks, around, open, bundled, bundled && hoverNote, b.nameOf, b.grouping]);
  // Who links to whom, for lighting up a hovered note's links and naming its neighbours.
  const linked = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of links.edges) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [links.edges]);

  // Where you are: the group you went into (here, from a click, the trail or back), else the whole map.
  const focusBlob = here ? atlas.blobs.find((bl) => bl.groupId === here.id) : undefined;
  useEffect(() => {
    const t = setTimeout(() => {
      if (focusBlob) rf.fitBounds({ x: focusBlob.x - focusBlob.r, y: focusBlob.y - focusBlob.r, width: 2 * focusBlob.r, height: 2 * focusBlob.r }, FIT);
      else rf.fitView(FIT);
    }, 30);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the place or the layout changes
  }, [focusBlob?.id, atlas.size]);
  // Around the open note: fit what's around it.
  useEffect(() => {
    if (!around || !links.nodes.length) return;
    const ids = links.nodes.map((n) => n.id);
    const t = setTimeout(() => rf.fitView({ ...FIT, nodes: ids.map((id) => ({ id })) }), 30);
    return () => clearTimeout(t);
  }, [around, links.nodes, rf]);

  const onKey = (e: ReactKeyboardEvent) => moveFocusInGrid(e, canvasRef.current);

  return (
    <div className={styles.map}>
      <ViewBar browse={b} onGoTo={goTo}>
        <label className={styles.toggle}><input type="checkbox" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} />{M.links}</label>
        <label className={styles.toggle}><input type="checkbox" checked={includeItems} onChange={(e) => setIncludeItems(e.target.checked)} />{M.items}</label>
        <button type="button" className={styles.aroundBtn} aria-pressed={around} disabled={!b.lastNoteId} title={b.lastNoteId ? M.aroundHint : M.aroundNone}
          onClick={() => setAround((a) => !a)}>{M.around}</button>
      </ViewBar>
      {atlas.blobs.length === 0 ? (
        <p className={styles.empty}>{Object.keys(b.notes).length === 0 && !b.filter.tagIds.length ? L.emptyAll : L.noMatch}</p>
      ) : (
        <div ref={canvasRef} className={styles.canvas} onKeyDown={onKey} aria-label={M.canvasLabel}>
          <MapHover.Provider value={{ blobId: hoverBlob, setBlobId: setHoverBlob, noteKey: hoverNote, setNoteKey: setHoverNote, linked }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              disableKeyboardA11y
              // A click handler on the canvas is what keeps nodes that can't be selected or dragged
              // answering the pointer (React Flow turns their pointer events off otherwise). Notes
              // and items handle their own clicks (buttons); a blob's is here.
              onNodeClick={(_e, node) => { if (node.type === 'blob' || node.type === 'label') (node.data as BlobData).onOpen((node.data as BlobData).blob); }}
              onlyRenderVisibleElements
              minZoom={0.05}
              maxZoom={4}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={28} size={1} />
              <Controls position="top-right" showInteractive={false} fitViewOptions={FIT} className={styles.controls} />
            </ReactFlow>
          </MapHover.Provider>
        </div>
      )}
    </div>
  );
}

function MapWithNote() {
  const b = useNotesBrowse();
  const here = b.focusPath[b.focusPath.length - 1] ?? null;
  if (b.openNoteId) return <NoteLevel browse={b} here={here} backTo={LABELS.noteMap.backToMap} />;
  return <ReactFlowProvider><MapCanvas /></ReactFlowProvider>;
}

export default function MapView() {
  return <MapWithNote />;
}
