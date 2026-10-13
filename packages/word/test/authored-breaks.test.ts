import { expect, test } from 'bun:test';
import { NativeWordDocument, importWordContent, createWordArtifact } from '../src/index.ts';
test('authored page breaks create new pages and survive imported export', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Before' }, { text: '\u2028', breakType: 'page' }, { text: 'After' }] }] });
  const blocks = importWordContent(source);
  expect(blocks[0]).toMatchObject({ runs: [{ text: 'Before' }, { text: '\u2028', breakType: 'page' }, { text: 'After' }] });
  const native = new NativeWordDocument({ source });
  const first = blocks[0]!; if (first.kind !== 'paragraph') throw Error('paragraph');
  native.update([{ ...first, runs: [{ ...first.runs[0]!, text: 'Changed' }, ...first.runs.slice(1)] }]);
  expect(native.layout({ measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) }).pages).toHaveLength(2);
  expect(importWordContent(native.artifact())[0]).toMatchObject({ runs: [{ text: 'Changed' }, { text: '\u2028', breakType: 'page' }, { text: 'After' }] });
});


test('line and column breaks survive imported edits and reject conflicting run kinds', () => {
  for (const breakType of ['line', 'column'] as const) {
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Before' }, { text: '\u2028', breakType }, { text: 'After' }] }] });
    const block = importWordContent(source)[0]!;
    if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
    const model = new NativeWordDocument({ source });
    model.update([{ ...block, runs: [{ ...block.runs[0]!, text: 'Edited' }, ...block.runs.slice(1)] }]);
    expect(importWordContent(model.artifact())[0]).toMatchObject({ runs: [{ text: 'Edited' }, { text: '\u2028', breakType }, { text: 'After' }] });
  }
  const runs = [{ text: '\u2028', breakType: 'page' as const, field: 'PAGE' as const }];
  expect(() => createWordArtifact({ paragraphs: [{ runs }] })).toThrow('cannot also');
  expect(() => new NativeWordDocument().update([{ kind: 'paragraph', runs }])).toThrow('cannot also');
});
