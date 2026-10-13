import { describe, expect, it } from 'vitest';
import { diagramToText, emptyDiagram, normalizeDiagram, type DiagramSpec } from './diagramSpec';
import { layoutDiagram } from './diagramLayout';

const spec: DiagramSpec = {
  nodes: [
    { id: 'a', label: 'Start', shape: 'oval', x: 0, y: 0 },
    { id: 'b', label: 'Is it raining?', shape: 'diamond', x: 0, y: 0 },
    { id: 'c', label: 'Take an umbrella', shape: 'box', x: 0, y: 0 },
    { id: 'd', label: 'Walk', shape: 'box', x: 10, y: 20 },
  ],
  edges: [
    { id: '1', from: 'a', to: 'b', label: '' },
    { id: '2', from: 'b', to: 'c', label: 'yes' },
    { id: '3', from: 'b', to: 'd', label: 'no' },
  ],
};

describe('diagram description', () => {
  it('whatever was stored becomes a valid diagram: unknown shapes are boxes, arrows to missing boxes go', () => {
    const n = normalizeDiagram({ nodes: [{ id: 'a', label: 'A', shape: 'star' }, { id: 'b' }], edges: [{ id: 'e', from: 'a', to: 'b' }, { from: 'a', to: 'zz' }, { from: 'a', to: 'a' }] });
    expect(n.nodes.map((x) => x.shape)).toEqual(['box', 'box']);
    expect(n.edges).toHaveLength(1);
    expect(normalizeDiagram('nonsense').nodes).toHaveLength(1);
    expect(emptyDiagram().nodes).toHaveLength(1);
  });

  it('copies as text: arrows, then boxes on their own', () => {
    expect(diagramToText({ ...spec, nodes: [...spec.nodes, { id: 'e', label: 'Alone', shape: 'box', x: 0, y: 0 }] }))
      .toBe('Start → Is it raining?\nIs it raining? → Take an umbrella (yes)\nIs it raining? → Walk (no)\nAlone');
  });
});

describe('diagram layout', () => {
  it('Free keeps the positions as dragged', () => {
    expect(layoutDiagram(spec, 'free').get('d')).toEqual({ x: 10, y: 20 });
  });

  it('Flowchart arranges top to bottom, Flow left to right, following the arrows', () => {
    const tb = layoutDiagram(spec, 'flowchart');
    expect(tb.get('a')!.y).toBeLessThan(tb.get('b')!.y);
    expect(tb.get('b')!.y).toBeLessThan(tb.get('c')!.y);
    expect(tb.get('c')!.y).toBe(tb.get('d')!.y);
    const lr = layoutDiagram(spec, 'flow');
    expect(lr.get('a')!.x).toBeLessThan(lr.get('b')!.x);
    expect(lr.get('b')!.x).toBeLessThan(lr.get('c')!.x);
  });
});
