import { expect, test } from 'bun:test';
import { createWordArtifact, NativeWordDocument, type WordAuthoredImage } from '../src/index.ts';

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));

for (const imported of [false, true]) {
  test(`${imported ? 'imported' : 'authored'} images keep media identity through geometry edits and replace it for new bytes`, () => {
    const image: WordAuthoredImage = {
      bytes: png, contentType: 'image/png', width: 72, height: 36, layout: 'front', x: 0, y: 0,
    };
    const source = imported ? createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', image }] }] }) : undefined;
    const original = source && [...source.document.drawings.values()][0];
    const model = new NativeWordDocument(source ? { source } : {});
    const update = (changes: Partial<WordAuthoredImage>) => {
      model.update([{
        kind: 'paragraph',
        runs: [{
          text: '\uFFFC',
          ...(original ? { source: original.elementId } : {}),
          image: { ...image, bytes: original?.kind === 'image' ? original.bytes : image.bytes, ...changes },
        }],
      }]);
      const drawing = [...model.drawings.values()][0];
      if (drawing?.kind !== 'image') throw new Error('Expected image');
      return drawing;
    };
    const before = update({});
    if (original?.kind === 'image') expect(before.partName).toBe(original.partName);
    for (const changes of [{ x: 1 }, { y: 10 }, { width: 80 }, { layout: 'behind' as const }]) {
      const after = update(changes);
      expect(after.partName).toBe(before.partName);
      expect(after.bytes).toBe(before.bytes);
    }
    const replacement = update({ bytes: before.bytes.slice() });
    expect(replacement.partName.value).not.toBe(before.partName.value);
    const exported = [...model.artifact().document.drawings.values()][0];
    if (exported?.kind !== 'image') throw new Error('Expected exported image');
    expect(exported.bytes).toEqual(replacement.bytes);
  });
}

test('explicit image coordinate bases survive native layout, export, and a base-only edit', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', image: { bytes: png, contentType: 'image/png', width: 72, height: 36, layout: 'front', x: 100, y: 40 } }] }] });
  const original = [...source.document.drawings.values()][0]!;
  if (original.kind !== 'image') throw new Error('Expected image');
  const document = new NativeWordDocument({ source });
  for (const verticalRelativeTo of ['line', 'page', 'paragraph'] as const) {
    document.update([{ kind: 'paragraph', runs: [{ text: '\uFFFC', source: original.elementId, image: {
      bytes: original.bytes, contentType: 'image/png', width: 72, height: 36, layout: 'front', wrap: 'none',
      horizontalRelativeTo: 'page', verticalRelativeTo, x: 100, y: 40,
    } }] }]);
    const native = [...document.drawings.values()][0]!;
    expect(native.anchor).toMatchObject({ horizontalRelativeTo: 'page', verticalRelativeTo, horizontalOffsetPoints: 100, verticalOffsetPoints: 40 });
    expect([...document.artifact().document.drawings.values()][0]?.anchor).toEqual(native.anchor);
  }
});
