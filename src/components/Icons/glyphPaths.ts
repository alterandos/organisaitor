// The drawings of the suite's small control icons, as data (24px grid, 2px round strokes), so the
// React icons (ActionIcons.tsx) and plain-DOM code (glyphDom.ts: ProseMirror widgets, the chart
// table) draw exactly the same thing. Each is a list of [element, attributes].

export type GlyphShape = [tag: 'path' | 'line' | 'circle' | 'rect', attrs: Record<string, string>][];

export const GLYPHS = {
  trash: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
    ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
    ['line', { x1: '10', y1: '11', x2: '10', y2: '17' }],
    ['line', { x1: '14', y1: '11', x2: '14', y2: '17' }],
  ],
  // An X: close a pane, dismiss, take a chip off. Not delete (that's the trash).
  close: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  // A pencil (Lucide's pencil): edit.
  edit: [
    ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
    ['path', { d: 'm15 5 4 4' }],
  ],
  // Two chain links (Lucide's link): a link, or making one.
  link: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ],
  // The links broken apart (Lucide's unlink): remove a link, keeping both ends.
  unlink: [
    ['path', { d: 'm18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71' }],
    ['path', { d: 'm5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71' }],
    ['line', { x1: '8', x2: '8', y1: '2', y2: '5' }],
    ['line', { x1: '2', x2: '5', y1: '8', y2: '8' }],
    ['line', { x1: '16', x2: '16', y1: '19', y2: '22' }],
    ['line', { x1: '19', x2: '22', y1: '16', y2: '16' }],
  ],
  // An arrow up and right (Lucide's arrow-up-right): open it, go there.
  open: [
    ['path', { d: 'M7 7h10v10' }],
    ['path', { d: 'M7 17 17 7' }],
  ],
  // Lines with an arrow in (Lucide's list-indent-increase): move it a level in.
  indent: [
    ['path', { d: 'M21 12H11' }], ['path', { d: 'M21 18H11' }], ['path', { d: 'M21 6H11' }],
    ['path', { d: 'm3 8 4 4-4 4' }],
  ],
  // ...and out (list-indent-decrease).
  outdent: [
    ['path', { d: 'M21 12H11' }], ['path', { d: 'M21 18H11' }], ['path', { d: 'M21 6H11' }],
    ['path', { d: 'm7 8-4 4 4 4' }],
  ],
  // A turning-back arrow (Lucide's rotate-ccw): back to the default.
  reset: [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
  ],
  // A painter's palette: how something is coloured.
  palette: [
    ['path', { d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' }],
    ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
  ],
  // Three shapes (Lucide's shapes): a design, how something is drawn.
  design: [
    ['path', { d: 'M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z' }],
    ['rect', { x: '3', y: '14', width: '7', height: '7', rx: '1' }],
    ['circle', { cx: '17.5', cy: '17.5', r: '3.5' }],
  ],
  // A circle half filled: where something stands (an option's status).
  status: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M12 3a9 9 0 0 1 0 18z', fill: 'currentColor' }],
  ],
  // ── Things to make (the + speed dial, Manage, filters) ──
  plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  // An Endeavour: a folder of work.
  endeavour: [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  // A Purpose: a target (it was ◎).
  purpose: [['circle', { cx: '12', cy: '12', r: '10' }], ['circle', { cx: '12', cy: '12', r: '6' }], ['circle', { cx: '12', cy: '12', r: '2' }]],
  // A reminder: an alarm clock.
  reminder: [
    ['circle', { cx: '12', cy: '13', r: '8' }], ['path', { d: 'M12 9v4l2 2' }], ['path', { d: 'M5 3 2 6' }],
    ['path', { d: 'm22 6-3-3' }], ['path', { d: 'M6.38 18.7 4 21' }], ['path', { d: 'M17.64 18.67 20 21' }],
  ],
  // A routine: the repeat arrows.
  routine: [['path', { d: 'm17 2 4 4-4 4' }], ['path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }], ['path', { d: 'm7 22-4-4 4-4' }], ['path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }]],
  // A tracker: columns of a chart.
  tracker: [['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }], ['path', { d: 'M18 17V9' }], ['path', { d: 'M13 17V5' }], ['path', { d: 'M8 17v-3' }]],
  upload: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'm17 8-5-5-5 5' }], ['path', { d: 'M12 3v12' }]],
  // A list: lines with bullets.
  list: [['path', { d: 'M3 12h.01' }], ['path', { d: 'M3 18h.01' }], ['path', { d: 'M3 6h.01' }], ['path', { d: 'M8 12h13' }], ['path', { d: 'M8 18h13' }], ['path', { d: 'M8 6h13' }]],
  notebook: [['path', { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' }]],
  sticky: [['path', { d: 'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z' }], ['path', { d: 'M15 3v4a2 2 0 0 0 2 2h4' }]],
  // Ready-made sets (tag presets): sparkles.
  preset: [['path', { d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z' }]],
} satisfies Record<string, GlyphShape>;

export type GlyphName = keyof typeof GLYPHS;
