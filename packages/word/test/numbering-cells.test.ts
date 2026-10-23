import { expect, test } from 'bun:test';
import { NativeWordDocument, type WordContentBlock } from '../src/index.ts';
import { numberingStoryFixture } from './numbering-story-fixture.ts';

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));
const paragraph = (text: string): WordContentBlock => ({ kind: 'paragraph', runs: [{ text }] });
const table = (blocks: readonly WordContentBlock[]): WordContentBlock => ({ kind: 'table', rows: [[{ blocks }]] });
const cases: readonly { name: string; cell: readonly WordContentBlock[]; expected: string[] }[] = [
  { name: 'empty', cell: [], expected: ['1.', '2.'] },
  { name: 'image', cell: [{ kind: 'image', bytes: png, contentType: 'image/png', width: 12, height: 12 }], expected: ['1.', '2.'] },
  { name: 'nested table', cell: [table([paragraph('inner')])], expected: ['1.', '2.', '3.'] },
];
for (const immutableContent of [false, true]) for (const { name, cell, expected } of cases) {
  test(`implicit ${name} cell paragraphs advance numbering, immutable=${immutableContent}`, () => {
    const source = numberingStoryFixture(0, 0, true);
    const model = new NativeWordDocument({ source, immutableContent });
    const content = [table(cell)];
    for (const input of [content, content, [...content, paragraph('after')]]) {
      model.update(input);
      const markers = [...model.listMarkers.values()].map(marker => marker.text);
      expect(markers).toEqual(input.length === 1 ? expected.slice(0, -1) : expected);
      const exported = model.artifact().document;
      expect([...exported.numbering.markers(exported).values()].map(marker => marker.text)).toEqual(markers);
    }
  });
}
