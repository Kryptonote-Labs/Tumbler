import { expect, test } from 'bun:test';
import { createWordArtifact, NativeWordDocument, openWordArtifact, wordInkPoints, type WordAuthoredInk } from '../src/index.ts';

const ink: WordAuthoredInk = { points: [[0, 0, .2], [40, 25, .8], [100, 60, .5]], width: 100, height: 60, size: 2, color: '#2455aa', layout: 'front', x: 72, y: 90, horizontalRelativeTo: 'page', verticalRelativeTo: 'page', moveWithText: false };
test('authored pen and highlighter are native editable ink with calibrated pressure', () => {
  const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', ink }, { text: '\uFFFC', ink: { ...ink, highlighter: true } }] }] });
  const drawings = [...openWordArtifact(artifact.bytes()).document.drawings.values()];
  expect(drawings).toHaveLength(2);
  expect(drawings[0]!.ink!.traces[0]!.points).toEqual(ink.points.map(p => [Math.round(p[0] * 2540 / 72), Math.round(p[1] * 2540 / 72), Math.round(p[2] * 1023)]));
  expect(drawings.every(d => d.kind === 'image' && d.inkRendering === 'vector')).toBe(true);
  expect(drawings[0]!.anchor?.horizontalOffsetPoints).toBe(72);
  expect(drawings[0]!.inkSource!.partName.value).not.toBe(drawings[1]!.inkSource!.partName.value);
});
test.each([false, true])('new collaborative ink keeps geometry and point edits through materialization, source=%s', existing => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Hello' }] }] });
  const model = new NativeWordDocument(existing ? { source } : {});
  model.update([{ kind: 'paragraph', runs: [{ text: 'Hello' }, { text: '\uFFFC', ink, drawing: { width: 150, height: 80, x: 100, y: 120, layout: 'front', horizontalRelativeTo: 'page', verticalRelativeTo: 'page' }, inkTraces: [{ traceIndex: 0, points: [[-5, 0, 205], [1411, 882, 818], [3528, 2117, 512]] }] }] }]);
  const preview = model.drawingAt(5)!;
  const drawing = [...model.artifact().document.drawings.values()][0]!;
  expect(drawing.widthPoints).toBe(150);
  expect(drawing.anchor?.horizontalOffsetPoints).toBe(100);
  expect(drawing.ink!.traces[0]!.points[0]).toEqual([-5, 0, 205]);
  wordInkPoints(preview).forEach((p, i) => {
    expect(p.x).toBeCloseTo(wordInkPoints(drawing)[i]!.x, 3);
    expect(p.y).toBeCloseTo(wordInkPoints(drawing)[i]!.y, 3);
  });
});
test('dots and straight axes render, malformed authoring fails before creating a package', () => {
  for (const points of [[[0, 0, .5]], [[0, 0, .5], [0, 10, .5]]] as const) {
    const a = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', ink: { ...ink, points, width: 72 / 2540, height: points.length === 1 ? 72 / 2540 : 10 } }] }] });
    expect([...a.document.drawings.values()][0]!.inkRenderingDiagnostics).toBeUndefined();
  }
  expect(() => createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', ink: { ...ink, points: [[0, 0, 2]] } }] }] })).toThrow();
});

test('multi-stroke drawings keep eyes small and all coordinates together through export', () => {
  const grouped: WordAuthoredInk = {
    width: 120, height: 120,
    strokes: [
      { color: '#ffaa00', size: 2, points: [[10, 60, 1], [60, 10, 1], [110, 60, 1], [60, 110, 1], [10, 60, 1]] },
      { color: '#202020', size: 3, points: [[40, 40, 1]] },
      { color: '#202020', size: 3, points: [[80, 40, 1]] },
      { color: '#202020', size: 2, points: [[35, 70, 1], [60, 90, 1], [85, 70, 1]] },
    ],
  };
  const model = new NativeWordDocument();
  model.update([{ kind: 'paragraph', runs: [{ text: '\uFFFC', ink: grouped }] }]);
  const artifact = openWordArtifact(model.artifact().bytes());
  const drawings = [...artifact.document.drawings.values()];
  expect(drawings).toHaveLength(1);
  for (const drawing of [model.drawingAt(0)!, drawings[0]!]) {
    expect(drawing.placement).toBe('inline');
    expect(drawing.widthPoints).toBe(120);
    expect(drawing.ink!.traces).toHaveLength(4);
    expect(drawing.inkRenderingDiagnostics).toBeUndefined();
    const actual = wordInkPoints(drawing);
    const expected = grouped.strokes.flatMap(s => s.points);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i]![0], 1);
      expect(p.y).toBeCloseTo(expected[i]![1], 1);
    });
  }
});

test('a single dot in a shared frame retains its offset without stretching', () => {
  const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', ink: {
    width: 100, height: 100,
    strokes: [{ color: '#202020', size: 3, points: [[30, 40, 1]] }],
  } }] }] });
  const drawing = [...artifact.document.drawings.values()][0]!;
  const [dot] = wordInkPoints(drawing);
  expect(dot!.x).toBeCloseTo(30, 1);
  expect(dot!.y).toBeCloseTo(40, 1);
  expect(drawing.inkRenderingDiagnostics).toBeUndefined();
});
