import { describe, expect, it } from 'vitest';
import { computeDragResult, type DragGeometry } from './timeGridDrag';

function geo(overrides: Partial<DragGeometry> = {}): DragGeometry {
  return {
    mode:             'move',
    originalStartMin: 9 * 60,
    originalEndMin:   10 * 60,
    originalColIndex: 2,
    grabOffsetMin:    0,
    columnCount:      7,
    snapStep:         15,
    minDurationMin:   15,
    ...overrides,
  };
}

describe('computeDragResult — move', () => {
  it('shifts start/end by the same amount, preserving duration', () => {
    const r = computeDragResult(geo(), 11 * 60, 2);
    expect(r.startMin).toBe(11 * 60);
    expect(r.endMin).toBe(12 * 60);
  });

  it('snaps the new start to the nearest step', () => {
    const r = computeDragResult(geo({ snapStep: 15 }), 9 * 60 + 7, 2);
    expect(r.startMin).toBe(9 * 60); // 547 -> nearest 15 is 540
  });

  it('accounts for grabOffsetMin so the grabbed point stays under the pointer', () => {
    // grabbed 20 minutes into the block (9:20); pointer now at 11:20 -> block should start at 11:00
    const r = computeDragResult(geo({ grabOffsetMin: 20 }), 11 * 60 + 20, 2);
    expect(r.startMin).toBe(11 * 60);
    expect(r.endMin).toBe(12 * 60);
  });

  it('clamps to the start of the day', () => {
    const r = computeDragResult(geo(), -500, 2);
    expect(r.startMin).toBe(0);
    expect(r.endMin).toBe(60);
  });

  it('clamps to the end of the day, preserving duration', () => {
    const r = computeDragResult(geo({ originalStartMin: 23 * 60, originalEndMin: 24 * 60 }), 30 * 60, 2);
    expect(r.endMin).toBe(24 * 60);
    expect(r.startMin).toBe(23 * 60);
  });

  it('clamps the column index to the valid range', () => {
    expect(computeDragResult(geo(), 10 * 60, -3).colIndex).toBe(0);
    expect(computeDragResult(geo(), 10 * 60, 99).colIndex).toBe(6);
  });
});

describe('computeDragResult — resize-start', () => {
  it('moves only the start, snapped, leaving end untouched', () => {
    const r = computeDragResult(geo({ mode: 'resize-start' }), 8 * 60 + 37, 2);
    expect(r.startMin).toBe(8 * 60 + 30); // nearest 15
    expect(r.endMin).toBe(10 * 60);
  });

  it('never lets start cross end minus the minimum duration', () => {
    const r = computeDragResult(geo({ mode: 'resize-start', minDurationMin: 30 }), 9 * 60 + 55, 2);
    expect(r.startMin).toBe(9 * 60 + 30); // 10:00 - 30min minimum
  });

  it('never resizes past the start of the day', () => {
    const r = computeDragResult(geo({ mode: 'resize-start' }), -100, 2);
    expect(r.startMin).toBe(0);
  });

  it('keeps the original column index (resize never changes day)', () => {
    const r = computeDragResult(geo({ mode: 'resize-start', originalColIndex: 4 }), 8 * 60, 1);
    expect(r.colIndex).toBe(4);
  });
});

describe('computeDragResult — resize-end', () => {
  it('moves only the end, snapped, leaving start untouched', () => {
    const r = computeDragResult(geo({ mode: 'resize-end' }), 11 * 60 + 7, 2);
    expect(r.endMin).toBe(11 * 60);
    expect(r.startMin).toBe(9 * 60);
  });

  it('never lets end cross start plus the minimum duration', () => {
    const r = computeDragResult(geo({ mode: 'resize-end', minDurationMin: 30 }), 9 * 60 + 5, 2);
    expect(r.endMin).toBe(9 * 60 + 30);
  });

  it('never resizes past the end of the day', () => {
    const r = computeDragResult(geo({ mode: 'resize-end' }), 30 * 60, 2);
    expect(r.endMin).toBe(24 * 60);
  });
});
