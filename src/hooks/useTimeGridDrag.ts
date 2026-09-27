import { useCallback, useRef, useState, type RefObject } from 'react';
import { yToMinutes, type HourLayout } from '@/utils/timeGrid';
import { computeDragResult, type DragMode, type DragResult } from '@/utils/timeGridDrag';

// Shared drag-to-move / drag-to-resize interaction for any hourly time grid built on
// utils/timeGrid.ts's layout math — used by CalendarView's week/day views (events & reminders)
// and ScheduleWeekGridPreview's block editor (AddScheduleModal). One hook instance can drive
// every draggable block on a page; `key` identifies which block a given gesture/preview belongs
// to, and geometry (`layout`, `columnsRef`, `columnCount`) is supplied per-gesture in `start()`
// rather than fixed at hook-creation time, since a single CalendarView renders both a week grid
// (columnCount=7) and a day grid (columnCount=1) depending on the active view.

export interface TimeGridDragPreview extends DragResult { key: string; mode: DragMode }

interface StartArgs {
  key:             string;
  mode:            DragMode;
  startMin:        number;
  endMin:          number;
  colIndex:        number;
  layout:          HourLayout;
  columnsRef:      RefObject<HTMLElement | null>; // container whose width splits evenly into columnCount columns
  columnCount:     number;
  snapStep?:       number;
  minDurationMin?: number;
}

export function useTimeGridDrag(onCommit: (key: string, result: DragResult) => void) {
  const [preview, setPreview] = useState<TimeGridDragPreview | null>(null);
  const previewRef = useRef<TimeGridDragPreview | null>(null);
  const geoRef = useRef<{
    key: string;
    layout: HourLayout;
    columnsRef: RefObject<HTMLElement | null>;
    columnCount: number;
    snapStep: number;
    minDurationMin: number;
    mode: DragMode;
    originalStartMin: number;
    originalEndMin: number;
    originalColIndex: number;
    grabOffsetMin: number;
  } | null>(null);
  const suppressClickKeyRef = useRef<string | null>(null);
  // Tracks exactly which `pointerup` listener function is currently attached, so
  // handlePointerUp can remove it without referencing its own (still-being-assigned) `const`
  // binding — a self-reference react-hooks/immutability flags as a stale-closure risk.
  const attachedUpListenerRef = useRef<((e: PointerEvent) => void) | null>(null);

  const pointerToGridCoords = useCallback((geo: NonNullable<typeof geoRef.current>, clientX: number, clientY: number) => {
    const rect = geo.columnsRef.current?.getBoundingClientRect();
    const minute = yToMinutes(clientY - (rect?.top ?? 0), geo.layout);
    const colIndex = geo.columnCount <= 1 || !rect || rect.width === 0
      ? geo.originalColIndex
      : Math.floor(((clientX - rect.left) / rect.width) * geo.columnCount);
    return { minute, colIndex };
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const geo = geoRef.current;
    if (!geo) return;
    const { minute, colIndex } = pointerToGridCoords(geo, e.clientX, e.clientY);
    const result = computeDragResult(
      {
        mode: geo.mode,
        originalStartMin: geo.originalStartMin,
        originalEndMin: geo.originalEndMin,
        originalColIndex: geo.originalColIndex,
        grabOffsetMin: geo.grabOffsetMin,
        columnCount: geo.columnCount,
        snapStep: geo.snapStep,
        minDurationMin: geo.minDurationMin,
      },
      minute,
      colIndex,
    );
    const next = { key: geo.key, mode: geo.mode, ...result };
    previewRef.current = next;
    setPreview(next);
  }, [pointerToGridCoords]);

  const handlePointerUp = useCallback(() => {
    document.removeEventListener('pointermove', handlePointerMove);
    if (attachedUpListenerRef.current) document.removeEventListener('pointerup', attachedUpListenerRef.current);
    attachedUpListenerRef.current = null;
    const finalPreview = previewRef.current;
    const geo = geoRef.current;
    geoRef.current = null;
    previewRef.current = null;
    setPreview(null);
    if (!finalPreview || !geo) return;
    suppressClickKeyRef.current = geo.key;
    // No-op drag (dropped back where it started, same day) still shouldn't suppress the click —
    // otherwise a plain click that jitters a pixel or two would silently fail to open the pane.
    const unchanged = finalPreview.startMin === geo.originalStartMin
      && finalPreview.endMin === geo.originalEndMin
      && finalPreview.colIndex === geo.originalColIndex;
    if (unchanged) { suppressClickKeyRef.current = null; return; }
    onCommit(geo.key, { startMin: finalPreview.startMin, endMin: finalPreview.endMin, colIndex: finalPreview.colIndex });
  }, [handlePointerMove, onCommit]);

  const start = useCallback((e: React.PointerEvent, args: StartArgs) => {
    if (e.button !== 0) return; // left-click / primary touch only
    e.preventDefault();
    e.stopPropagation();
    const rect = args.columnsRef.current?.getBoundingClientRect();
    const pointerMinuteNow = yToMinutes(e.clientY - (rect?.top ?? 0), args.layout);
    geoRef.current = {
      key: args.key,
      layout: args.layout,
      columnsRef: args.columnsRef,
      columnCount: args.columnCount,
      snapStep: args.snapStep ?? 15,
      minDurationMin: args.minDurationMin ?? 15,
      mode: args.mode,
      originalStartMin: args.startMin,
      originalEndMin: args.endMin,
      originalColIndex: args.colIndex,
      grabOffsetMin: args.mode === 'move' ? pointerMinuteNow - args.startMin : 0,
    };
    attachedUpListenerRef.current = handlePointerUp;
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove, handlePointerUp]);

  const startMove = useCallback((e: React.PointerEvent, args: Omit<StartArgs, 'mode'>) => start(e, { ...args, mode: 'move' }), [start]);
  const startResize = useCallback(
    (e: React.PointerEvent, edge: 'start' | 'end', args: Omit<StartArgs, 'mode'>) =>
      start(e, { ...args, mode: edge === 'start' ? 'resize-start' : 'resize-end' }),
    [start],
  );

  // A drag that actually changed something ends with the browser still firing a trailing click
  // on the block (pointerup -> click is native behaviour) — callers check this in their own
  // onClick before opening the item, and it self-resets after one check.
  const consumeSuppressedClick = useCallback((key: string): boolean => {
    if (suppressClickKeyRef.current !== key) return false;
    suppressClickKeyRef.current = null;
    return true;
  }, []);

  return { preview, startMove, startResize, consumeSuppressedClick };
}
