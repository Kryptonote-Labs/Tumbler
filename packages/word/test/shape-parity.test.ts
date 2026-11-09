import { expect, test } from 'bun:test';
import {
  createWordArtifact,
  importWordContent,
  NativeWordDocument,
  type WordAuthoredShape,
} from '../src/index.ts';
const gradientFrom = (color: string) => ({ kind: 'gradient' as const, type: 'linear' as const, stops: [{ offset: 0, color }, { offset: 1, color: '#ffffff' }] });

const shape: WordAuthoredShape = {
  preset: 'rect',
  width: 120,
  height: 60,
  fill: '#4472c4',
  outline: '#000000',
  outlineWidth: 1,
  layout: 'front',
  x: 90,
  y: 120,
  zOrder: 7,
};

test('Word gradients retain stops, opacity, direction and focus through native edits and export', () => {
  for (const type of ['linear', 'radial', 'rectangular'] as const) {
    const gradient = {
      ...gradientFrom('#4472c4'),
      type,
      angle: 45,
      center: [0.25, 0.75] as [number, number],
      stops: [
        { offset: 0, color: '#123456', opacity: 0.3 },
        { offset: 1, color: '#abcdef' },
      ],
    };
    const source = createWordArtifact({
      paragraphs: [{ runs: [{ text: '\uFFFC', shape: { ...shape, gradient } }] }],
    });
    const content = importWordContent(source);
    const first = content[0];
    if (first?.kind !== 'paragraph') throw new Error('Missing shape paragraph');
    expect(first.runs[0]?.shape?.gradient).toMatchObject({
      type,
      stops: [
        { offset: 0, color: '#123456', opacity: 0.3 },
        { offset: 1, color: '#abcdef', opacity: 1 },
      ],
    });
    expect(first.runs[0]?.shape?.zOrder).toBe(7);
    const model = new NativeWordDocument({ source });
    model.update([
      { ...first, runs: [{ ...first.runs[0]!, shape: { ...first.runs[0]!.shape!, width: 160 } }] },
    ]);
    expect([...model.drawings.values()][0]?.anchor?.zOrder).toBe(7);
    const saved = importWordContent(model.artifact())[0];
    if (saved?.kind !== 'paragraph') throw new Error('Missing saved paragraph');
    expect(saved.runs[0]?.shape?.gradient).toEqual(first.runs[0]?.shape?.gradient);
    expect(saved.runs[0]?.shape?.width).toBe(160);
  }
});

test('radial canvas gradients reach the last stop at the bounding-box edge, matching SVG', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { paintDrawingGradient } = await import('@tumblerjs/ooxml');
  const ctx = createCanvas(200, 100).getContext('2d');
  ctx.fillStyle = paintDrawingGradient(ctx, { kind: 'radial', angle: 0, scaled: true, center: [0.5,0.5], stops: [{offset:0,color:'#ff0000'}, {offset:1,color:'#0000ff'}] }, '#ffffff', 200, 100) as CanvasGradient;
  ctx.fillRect(0,0,200,100);
  const edge = ctx.getImageData(100,0,1,1).data;
  expect(edge[2]).toBeGreaterThan(245);
  expect(edge[0]).toBeLessThan(10);
});
