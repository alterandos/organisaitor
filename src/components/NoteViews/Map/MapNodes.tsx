import { useContext, type CSSProperties } from 'react';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { MapHover } from './mapHover';
import { BaseEdge, Handle, Position, useStore, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { LABELS } from '@/config/labels';
import type { NoteName } from '@/utils/notes';
import type { MapItemType } from '@/utils/noteMap';
import { blobPath, type AtlasBlob } from './atlasLayout';
import { DETAIL_ZOOM, curvePath, dotScale, strokeAt } from './mapLinks';
import styles from './Map.module.css';

// What the Map draws (MapView.tsx): blobs (groups), notes (dots inside them) and items from other
// apps, and the links between them. Detail follows the zoom: islands are always named, a smaller
// blob once it's big enough on screen, a note once you're close, or when its blob is hovered.

const useZoom = () => useStore((s) => s.transform[2]);

// A label's size in the map's own units, so it reads at about `px` on screen at any zoom, but no
// bigger than its blob allows.
const labelSize = (px: number, zoom: number, max: number) => `${Math.min(max, px / zoom)}px`;

// `closed`: shown whole (its icon and how many notes it holds), its insides not drawn (mapDetail.ts).
export interface BlobData extends Record<string, unknown> { blob: AtlasBlob; dim: boolean; closed: boolean; onOpen: (blob: AtlasBlob) => void }
// `spread`: how far the note moves out from its blob's centre while the blob is hovered (its notes
// fan out to make room for their titles).
export interface NoteData extends Record<string, unknown> { noteId: string; blobId: string; name: NoteName; nameHere: NoteName; spread: { x: number; y: number }; dim: boolean; onOpen: (id: string) => void; onFocus: (id: string) => void }
export interface ItemData extends Record<string, unknown> { kind: MapItemType; label: string; done: boolean; dim: boolean; onOpen: () => void }

export function BlobNode({ data }: NodeProps<Node<BlobData>>) {
  const { blob, dim, closed } = data;
  const { blobId, setBlobId } = useContext(MapHover);
  const zoom = useZoom();
  const d = 2 * blob.r;
  // A closed blob's middle: its icon and count, sized to read on screen but never past its edge.
  const inner = Math.min(blob.r * 0.7, 26 / zoom);
  return (
    <div
      className={`${styles.blob} ${blob.depth === 1 ? styles.island : ''} ${closed ? styles.closed : ''} ${blobId === blob.id ? styles.blobHover : ''} ${dim ? styles.dim : ''} ${blob.kind === 'loose' ? styles.loose : ''}`}
      style={{ width: d, height: d, ...(blob.color ? { '--blob-color': blob.color } : {}) } as CSSProperties}
      onMouseEnter={() => setBlobId(blob.id)}
      onMouseLeave={() => { if (blobId === blob.id) setBlobId(null); }}
    >
      <svg className={styles.blobShape} width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true">
        <path d={blobPath(blob.id, blob.r)} style={{ strokeWidth: strokeAt(blob.depth === 1 ? 1.75 : 1.25, zoom) }} />
      </svg>
      {closed && blob.r * zoom >= 14 && (
        <span className={styles.blobInside} style={{ fontSize: `${inner * 0.55}px` }}>
          {blob.icon && <span className={styles.blobIcon} style={{ fontSize: `${inner}px` }}><ItemIcon icon={blob.icon} /></span>}
          <span>{blob.total}</span>
        </span>
      )}
      {/* Links to a closed blob, or bundled between blobs, end here (at the centre). */}
      <Handle type="target" position={Position.Top} className={styles.handle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />
    </div>
  );
}

// A blob's name: a pill on its top edge, drawn above everything (so the blobs and notes inside
// never cover it). An island is always named; a smaller blob once it's big enough on screen.
export function BlobLabelNode({ data }: NodeProps<Node<BlobData>>) {
  const { blob, closed, onOpen } = data;
  const zoom = useZoom();
  const { setBlobId } = useContext(MapHover);
  // An island is always named; a closed blob once it's a dot worth naming; an open one once it's big.
  if (blob.depth !== 1 && blob.r * zoom < (closed ? 14 : 36)) return null;
  const style = { fontSize: labelSize(blob.depth === 1 ? 14 : 12, zoom, Math.max(10, blob.r / 2.5)), ...(blob.color ? { '--blob-color': blob.color } : {}) } as CSSProperties;
  const className = `${styles.blobLabel} ${blob.depth === 1 ? styles.islandLabel : ''}`;
  const text = <>{blob.icon ? <><ItemIcon icon={blob.icon} />{' '}</> : ''}{blob.label}</>;
  // A closed blob's name is a button (reached with the arrow keys like the notes): Enter opens it.
  if (closed) {
    return (
      <button type="button" data-view-tile="" className={`${className} ${styles.blobLabelBtn}`} style={style}
        aria-label={LABELS.noteMap.openBlob(blob.label, blob.total)} onMouseEnter={() => setBlobId(blob.id)}
        onClick={(e) => { e.stopPropagation(); onOpen(blob); }}>
        {text}
      </button>
    );
  }
  return <span className={className} style={style} onMouseEnter={() => setBlobId(blob.id)}>{text}</span>;
}

export function NoteNode({ data }: NodeProps<Node<NoteData>>) {
  const zoom = useZoom();
  const { blobId, setBlobId, noteKey, setNoteKey, linked } = useContext(MapHover);
  const key = `note:${data.noteId}`;
  const inHovered = blobId === data.blobId;
  // Hovering a note: it and the notes it links to are named, the rest fades.
  const pointed = noteKey === key || (!!noteKey && !!linked.get(noteKey)?.has(key));
  const faded = !!noteKey && !pointed;
  // Its title alone where its blob already says which notebook it's in (its blob hovered, or close
  // up); with its notebook when it's named because a hovered note links to it from elsewhere.
  const label = pointed && noteKey !== key ? data.name.full : (inHovered && !noteKey) || pointed || zoom >= DETAIL_ZOOM ? data.nameHere.full : null;
  return (
    <div
      className={`${styles.note} ${data.dim ? styles.dim : ''} ${faded ? styles.faded : ''}`}
      style={{ '--dot-scale': dotScale(zoom), ...(inHovered && !noteKey ? { transform: `translate(${data.spread.x}px, ${data.spread.y}px)` } : {}) } as CSSProperties}
      onMouseEnter={() => { setBlobId(data.blobId); setNoteKey(key); }}
      onMouseLeave={() => { if (noteKey === key) setNoteKey(null); }}
    >
      <Handle type="target" position={Position.Top} className={styles.handle} isConnectable={false} />
      <button
        type="button"
        data-view-tile=""
        className={styles.noteDot}
        aria-label={data.name.full}
        title={data.name.path ? `${data.name.title} · ${data.name.path}` : data.name.title}
        onClick={(e) => { e.stopPropagation(); data.onOpen(data.noteId); }}
        onFocus={() => data.onFocus(data.noteId)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>
      </button>
      {label && <span className={styles.noteLabel} style={{ fontSize: labelSize(12, zoom, 40) }}>{label}</span>}
      <Handle type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />
    </div>
  );
}

export function ItemNode({ id, data }: NodeProps<Node<ItemData>>) {
  const zoom = useZoom();
  const { noteKey, linked } = useContext(MapHover);
  const pointed = !!noteKey && !!linked.get(noteKey)?.has(id);
  return (
    <div className={`${styles.item} ${data.done ? styles.itemDone : ''} ${data.dim ? styles.dim : ''} ${noteKey && !pointed ? styles.faded : ''}`}
      style={{ '--dot-scale': dotScale(zoom) } as CSSProperties}>
      <Handle type="target" position={Position.Top} className={styles.handle} isConnectable={false} />
      <button type="button" className={styles.itemDot} aria-label={data.label} title={data.label} onClick={(e) => { e.stopPropagation(); data.onOpen(); }}>
        <span aria-hidden="true">{ITEM_TYPE_ICON[data.kind]}</span>
      </button>
      {(pointed || zoom >= DETAIL_ZOOM) && <span className={styles.noteLabel} style={{ fontSize: labelSize(11, zoom, 30) }}>{data.label}</span>}
      <Handle type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />
    </div>
  );
}

// A link: a gentle curve, thin and faint (the same width at any zoom), an item's dashed. A bundled
// link (zoomed out: one per pair of blobs, mapLinks.ts) runs from blob edge to blob edge, thicker
// for more links. Hovering a note lights up its links and fades the rest.
export interface LinkData extends Record<string, unknown> {
  weight: number; item: boolean; dim: boolean; bundle: boolean;
  blobs: string[];              // the blobs at its ends (a fanned-out blob's links fade)
  ends: string[];               // its ends' keys (a hovered note's links light up)
  trimFrom: number; trimTo: number;
}

export function LinkEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const d = data as LinkData;
  const { blobId, noteKey } = useContext(MapHover);
  const zoom = useZoom();
  const hot = !!noteKey && d.ends.includes(noteKey);
  const fanned = !noteKey && !!blobId && !d.bundle && d.blobs.includes(blobId);
  const quiet = d.dim || fanned || (!!noteKey && !hot);
  // On screen: a link 1–2px, a bundle 2–6px by how many links it carries (hovered, a little more).
  const px = (d.bundle ? Math.min(6, 1.5 + Math.sqrt(d.weight) * 1.2) : Math.min(2, 1 + d.weight * 0.25)) + (hot ? 0.75 : 0);
  const width = strokeAt(px, zoom);
  return (
    <BaseEdge id={id} path={curvePath(sourceX, sourceY, targetX, targetY, d.trimFrom, d.trimTo)}
      className={`${d.item ? styles.itemLink : d.bundle ? styles.bundleLink : styles.link} ${hot ? styles.linkHot : ''} ${quiet ? styles.linkDim : ''}`}
      style={{ strokeWidth: width }} />
  );
}
