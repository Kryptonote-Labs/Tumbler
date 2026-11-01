import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, isWordAuthoredShape, NativeWordDocument, openWordArtifact, wordShapePath, type WordAuthoredShape } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
const shape: WordAuthoredShape = { preset: 'roundRect', width: 120, height: 60, fill: '#CCDDEE', outline: 'none', outlineWidth: 0 };
const create = (value: WordAuthoredShape) => createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', shape: value }] }] });
const read = (artifact: ReturnType<typeof create>) => {
  const drawing = [...artifact.document.drawings.values()][0];
  if (drawing?.kind !== 'shape') throw new Error('Expected editable shape');
  return drawing.shape;
};
test('rounded rectangles retain zero, custom, and maximum radii through native editing and DOCX reauthoring', () => {
  for (const cornerRadius of [0, 6, 15, 30, 100]) {
    const source = create({ ...shape, cornerRadius });
    const expected = Math.min(30, cornerRadius);
    expect(read(openWordArtifact(source.bytes())).cornerRadius).toBeCloseTo(expected);
    const model = new NativeWordDocument({ source });
    model.update(importWordContent(source).map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => run.shape ? { ...run, shape: { ...run.shape, fill: '#FF0000' } } : run) } : block));
    expect(read(openWordArtifact(model.artifact().bytes())).cornerRadius).toBeCloseTo(expected);
    expect(read(createWordArtifact({ blocks: importWordContent(source) })).cornerRadius).toBeCloseTo(expected);
  }
});
test('default and custom radii change the rendered path', () => {
  expect(Number(wordShapePath(shape).match(/A([\d.]+)/)?.[1])).toBeCloseTo(10.0002);
  expect(wordShapePath({ ...shape, cornerRadius: 6 })).toContain('A6 6');
  expect(wordShapePath({ ...shape, cornerRadius: 0 })).toContain('A0 0');
  for (const cornerRadius of [-1, NaN, Infinity]) expect(isWordAuthoredShape({ ...shape, cornerRadius })).toBe(false);
  expect(isWordAuthoredShape({ ...shape, preset: 'ellipse', cornerRadius: 6 })).toBe(false);
});
test('imported native adjustments clamp according to the preset and unknown formulas stay opaque', () => {
  const original = create(shape).document.source.source;
  for (const [formula, expected] of [['val 25000', 15], ['val -1', 0], ['val 75000', 30], ['*/ w 1 2', undefined]] as const) {
    const xml = original.replace('<a:avLst></a:avLst>', `<a:avLst><a:gd name="adj" fmla="${formula}"/></a:avLst>`);
    const artifact = openWordArtifact(buildWordDocumentFixture({ documentXml: xml }));
    if (expected === undefined) expect([...artifact.document.drawings.values()][0]?.kind).toBe('unsupported');
    else expect(read(artifact).cornerRadius).toBeCloseTo(expected);
  }
});
