// Pure math behind the calendar's drag-to-move / drag-to-resize interaction (CalendarView's
// week/day time grid, and ScheduleWeekGridPreview's block editor) — kept separate from the DOM
// pointer-event wiring (see hooks/useTimeGridDrag.ts) so the actual snapping/clamping logic is
// unit-testable without simulating real pointer events, matching this codebase's "verify the
// algorithm in isolation first" convention (see backupRetention.ts / expandScheduleBlock).

export type DragMode = 'move' | 'resize-start' | 'resize-end';

// timeGrid.ts's own snapMinutes() clamps its result to `24*60 - step`, on the assumption that
// what it snaps is always a START time that needs room for at least one step before midnight —
// wrong here for resize-end, whose snapped value IS allowed to reach 24:00 itself. Round only;
// the day-boundary clamp below is this module's own job.
function snapToStep(minutes: number, step: number): number {
  return Math.round(minutes / step) * step;
}

export interface DragGeometry {
  mode:             DragMode;
  originalStartMin: number;
  originalEndMin:   number;
  originalColIndex: number;
  grabOffsetMin:    number; // move only: minute offset between the block's start and where the pointer grabbed it
  columnCount:      number;
  snapStep:         number;
  minDurationMin:   number;
}

export interface DragResult { startMin: number; endMin: number; colIndex: number }

export function computeDragResult(geo: DragGeometry, pointerMinute: number, pointerColIndex: number): DragResult {
  const colIndex = Math.max(0, Math.min(geo.columnCount - 1, pointerColIndex));

  if (geo.mode === 'move') {
    const duration = geo.originalEndMin - geo.originalStartMin;
    const startMin = Math.max(0, Math.min(24 * 60 - duration, snapToStep(pointerMinute - geo.grabOffsetMin, geo.snapStep)));
    return { startMin, endMin: startMin + duration, colIndex };
  }

  if (geo.mode === 'resize-start') {
    const startMin = Math.max(0, Math.min(geo.originalEndMin - geo.minDurationMin, snapToStep(pointerMinute, geo.snapStep)));
    return { startMin, endMin: geo.originalEndMin, colIndex: geo.originalColIndex };
  }

  // resize-end
  const endMin = Math.min(24 * 60, Math.max(geo.originalStartMin + geo.minDurationMin, snapToStep(pointerMinute, geo.snapStep)));
  return { startMin: geo.originalStartMin, endMin, colIndex: geo.originalColIndex };
}
