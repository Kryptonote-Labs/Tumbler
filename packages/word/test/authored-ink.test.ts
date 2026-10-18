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
