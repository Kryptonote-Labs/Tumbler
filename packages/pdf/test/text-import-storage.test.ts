import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { PdfTextModel, defaultPdfTextStyle, type PdfTextSeed } from '../src/index.ts';

test('glyph spacing survives compact collaborative import, edits and undo', () => {
  const count = 1000;
  const seed: PdfTextSeed = {
    id: 'source:page:0',
    page: 0,
    x: 20,
    y: 20,
    width: 500,
    lineHeight: 15,
    style: defaultPdfTextStyle,
    sources: [{ instance: 'page', object: '4:0', start: 0, end: 30, mode: 0, displacement: 600 }],
    delta: Array.from({ length: count }, (_, i) => ({
      insert: String.fromCharCode(65 + (i % 26)),
      attributes: { ...defaultPdfTextStyle, bold: i >= count / 2 },
    })),
    spacing: Array.from({ length: count - 1 }, (_, i) => ({ left: i, right: i + 1, gap: 0.25 })),
  };
  const first = new PdfTextModel();
  const recovered = new PdfTextModel();
  try {
    first.initialize([seed]);
    const update = Y.encodeStateAsUpdate(first.doc);
    // Bound the persisted overhead of importing a thousand individually positioned glyphs.
    expect(update.byteLength).toBeLessThan(300_000);
    Y.applyUpdate(recovered.doc, update);
    expect(recovered.seed(seed.id)).toEqual(seed);
    expect(recovered.text(seed.id).toDelta()).toEqual(first.text(seed.id).toDelta());
    expect(recovered.contentDirty(seed.id)).toBe(false);
    expect(recovered.styleAt(seed.id, count)).toMatchObject({ bold: true });
    recovered.replace(seed.id, 10, 20, 'replacement');
    expect(recovered.contentDirty(seed.id)).toBe(true);
    recovered.undo.undo();
    expect(recovered.text(seed.id).toDelta()).toEqual(first.text(seed.id).toDelta());
  } finally {
    first.doc.destroy();
    recovered.doc.destroy();
  }
});
