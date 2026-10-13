import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, NativeWordDocument, WORD_SHAPE_PRESETS, type WordAuthoredShape } from '../src/index.ts';
test('editable shapes retain geometry, fill, outline and text through authored and imported edits', () => {
  for (const preset of WORD_SHAPE_PRESETS) {
    const shape: WordAuthoredShape = { preset, width: 120, height: 60, fill: '#CCDDEE', outline: '#112233', outlineWidth: 1, text: 'Hello' };
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', shape }, { text: ' beside' }] }] });
    const first = importWordContent(source)[0]!;
    if (first.kind !== 'paragraph') throw Error('paragraph');
    expect(first.runs[0]!.shape).toMatchObject(shape);
    const model = new NativeWordDocument({ source });
    model.update([{ ...first, runs: [{ ...first.runs[0]!, shape: { ...shape, width: 200, fill: '#FF0000' } }, ...first.runs.slice(1)] }]);
    expect(importWordContent(model.artifact())[0]).toMatchObject({ runs: [{ shape: { ...shape, width: 200, fill: '#FF0000' } }, { text: ' beside' }] });
    expect([...model.drawings.values()][0]).toMatchObject({ kind: 'shape', widthPoints: 200 });
  }
});
