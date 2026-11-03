import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';
import {
  openPdfDocument,
  PdfTextModel,
  importPdfText,
  PdfEditingFonts,
  exportEditedPdf,
  PdfInterpreter,
  layoutPdfText,
  layoutPdfTextFlow,
  defaultPdfTextStyle,
  movePdfTextCaret,
  pdfTextContent,
} from '../src/index.ts';
const fonts = new PdfEditingFonts();
fonts.add(
  'Sans-Regular',
  await Bun.file(
    new URL('./fixtures/editing-fonts/LiberationSans-Regular.ttf', import.meta.url),
  ).bytes(),
);
function document(content: string) {
  return openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>',
      pdfStream(content),
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ]),
  );
}
test('editing a mixed-colour paragraph preserves the colour of every unchanged glyph', () => {
  const pdf = document('BT /F 12 Tf 20 150 Td 1 0 0 rg (Red) Tj 0 0 1 rg (Blue) Tj ET'),
    model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const id = model.ids()[0]!;
  model.replace(id, 7, 7, '!');
  const original = new PdfInterpreter(pdf).page(0).elements.filter((e) => e.kind === 'glyph');
  const edited = new PdfInterpreter(openPdfDocument(exportEditedPdf(pdf, model, fonts)))
    .page(0)
    .elements.filter((e) => e.kind === 'glyph');
  expect(edited.map((e) => e.glyph.unicode).join('')).toBe('RedBlue!');
  expect(edited.slice(0, 7).map((e) => e.state.fill)).toEqual(original.map((e) => e.state.fill));
  expect(edited[7]!.state.fill).toBe(original[6]!.state.fill);
  model.doc.destroy();
});

test('larger text increases line spacing, paragraph height and following paragraph displacement', () => {
  const pdf = document(
      'BT /F 12 Tf 20 150 Td (First) Tj 0 -15 Td (Second) Tj ET BT /F 12 Tf 20 80 Td (Following) Tj ET',
    ),
    model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const [id, following] = model.ids();
  const before = layoutPdfText(model, id!, fonts);
  model.format(id!, 0, model.text(id!).length, { size: 48 });
  const after = layoutPdfText(model, id!, fonts);
  const first = after.glyphs.find((g) => g.text === 'F')!,
    second = after.glyphs.find((g) => g.text === 'S')!;
  expect(second.y - first.y).toBe(60);
  expect(after.height).toBe(120);
  const flow = layoutPdfTextFlow(model, fonts, pdf.pages);
  const tail = flow.regions.find((region) => region.id === following)!;
  const logicalY = tail.glyphs[0]!.y + flow.pages[tail.page]!.continuation * 104;
  expect(logicalY).toBeCloseTo(model.seed(following!).y + after.height - before.height, 6);
  const output = openPdfDocument(exportEditedPdf(pdf, model, fonts)),
    interpreter = new PdfInterpreter(output);
  expect(output.pages.map((page) => interpreter.page(page.index).text).join('\n')).toContain(
    'Following',
  );
  model.doc.destroy();
});

test('text placed near the top of a continuation page stays visible on that page in layout and export', () => {
  const pdf = document('BT /F 12 Tf 20 150 Td (Original) Tj ET'),
    model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  for (const continuation of [1, 2])
    model.add({
      id: 'placed-' + continuation,
      page: 0,
      continuation,
      x: 20,
      y: 40 + continuation * 104,
      width: 200,
      lineHeight: 15,
      style: defaultPdfTextStyle,
      sources: [],
      delta: [{ insert: 'Placed ' + continuation, attributes: defaultPdfTextStyle }],
    });
  // Older headless callers may supply an off-page logical baseline without an explicit anchor.
  model.add({
    id: 'legacy',
    page: 0,
    x: 20,
    y: 260,
    width: 200,
    lineHeight: 15,
    style: defaultPdfTextStyle,
    sources: [],
    delta: [{ insert: 'Legacy', attributes: defaultPdfTextStyle }],
  });
  const flow = layoutPdfTextFlow(model, fonts, pdf.pages);
  for (const continuation of [1, 2]) {
    const fragment = flow.regions.find((region) => region.id === 'placed-' + continuation)!;
    expect(fragment.page).toBe(continuation);
    expect(fragment.glyphs[0]!.y).toBe(40);
  }
  expect(flow.regions.find((region) => region.id === 'legacy')!.page).toBe(1);
  const output = openPdfDocument(exportEditedPdf(pdf, model, fonts)),
    interpreter = new PdfInterpreter(output);
  expect(output.pages.length).toBe(3);
  for (const continuation of [1, 2])
    expect(interpreter.page(continuation).text).toContain('Placed ' + continuation);
  for (const page of output.pages)
    for (const glyph of interpreter.page(page.index).elements.filter((e) => e.kind === 'glyph')) {
      expect(glyph.textMatrix[5]).toBeGreaterThanOrEqual(0);
      expect(glyph.textMatrix[5]).toBeLessThanOrEqual(page.height);
    }
  model.doc.destroy();
});

test('vertical caret navigation crosses continuation boundaries in both directions', () => {
  const pdf = document('BT /F 12 Tf 20 150 Td (Start) Tj ET'),
    model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const id = model.ids()[0]!;
  model.replace(
    id,
    0,
    model.text(id).length,
    Array.from({ length: 30 }, (_, i) => 'Line ' + i).join('\n'),
  );
  const layout = layoutPdfText(model, id, fonts),
    flow = layoutPdfTextFlow(model, fonts, pdf.pages);
  const first = flow.regions.find((region) => region.id === id && region.page === 0)!;
  const last = first.carets.at(-1)!;
  const next = movePdfTextCaret(layout, last.offset, 1)!;
  expect(next.offset).toBeGreaterThan(last.offset);
  expect(
    flow.regions
      .find((region) => region.id === id && region.page === 1)!
      .carets.some((c) => c.offset === next.offset),
  ).toBe(true);
  const previous = movePdfTextCaret(layout, next.offset, -1)!;
  expect(first.carets.some((c) => c.offset === previous.offset)).toBe(true);
  model.replace(id, 0, model.text(id).length, 'Small\nLarge');
  model.format(id, 6, 11, { size: 48 });
  expect(movePdfTextCaret(layoutPdfText(model, id, fonts), 0, 1)!.offset).toBe(6);
  model.doc.destroy();
});

function embeddedText(content: string) {
  const full = fonts.get(defaultPdfTextStyle),
    widths = Array.from(
      { length: 95 },
      (_, i) => (full.font.glyphForCodePoint(i + 32).advanceWidth * 1000) / full.font.unitsPerEm,
    );
  return openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>',
      pdfStream(content),
      `<< /Type /Font /Subtype /TrueType /BaseFont /LiberationSans-Regular /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [${widths.join(' ')}] /FontDescriptor 6 0 R >>`,
      '<< /Type /FontDescriptor /FontName /LiberationSans-Regular /Flags 32 /FontBBox [-500 -500 2000 2000] /Ascent 900 /Descent -200 /CapHeight 700 /ItalicAngle 0 /StemV 80 /FontFile2 7 0 R >>',
      pdfStream(full.bytes),
    ]),
  );
}
test('source spacing stays with each surviving letter occurrence through concurrent edits and undo', () => {
  const pdf = embeddedText('BT /F 24 Tf 30 200 Td [(A) 100 (V A) 300 (V)] TJ ET'),
    model = new PdfTextModel(),
    peer = new PdfTextModel();
  fonts.importDocument(pdf);
  model.initialize(importPdfText(pdf));
  Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(model.doc));
  const id = model.ids()[0]!,
    original = pdfTextContent(new PdfInterpreter(pdf).page(0)).items.filter(
      (item) => item.kind === 'glyph',
    );
  model.replace(id, 5, 5, '!');
  peer.replace(id, 0, 0, 'P ');
  const a = Y.encodeStateAsUpdate(model.doc),
    b = Y.encodeStateAsUpdate(peer.doc);
  Y.applyUpdate(model.doc, b);
  Y.applyUpdate(peer.doc, a);
  const layout = layoutPdfText(model, id, fonts);
  expect(layout.glyphs).toEqual(layoutPdfText(peer, id, fonts).glyphs);
  const retained = layout.glyphs.slice(2, 7);
  for (let i = 0; i < 5; i++)
    expect(retained[i]!.x - retained[0]!.x).toBeCloseTo(
      original[i]!.transform[4] - original[0]!.transform[4],
      5,
    );
  const exported = pdfTextContent(
    new PdfInterpreter(openPdfDocument(exportEditedPdf(pdf, model, fonts))).page(0),
  )
    .items.filter((item) => item.kind === 'glyph')
    .slice(2, 7);
  for (let i = 0; i < 5; i++)
    expect(exported[i]!.transform[4] - exported[0]!.transform[4]).toBeCloseTo(
      original[i]!.transform[4] - original[0]!.transform[4],
      5,
    );
  model.undo.stopCapturing();
  model.replace(id, 3, 3, 'X');
  const split = layoutPdfText(model, id, fonts).glyphs;
  expect(split[4]!.x - split[2]!.x).toBeCloseTo(
    fonts.measure('A', split[2]!.style) + fonts.measure('X', split[3]!.style),
    5,
  );
  model.undo.undo();
  expect(layoutPdfText(model, id, fonts).glyphs).toEqual(layout.glyphs);
  model.doc.destroy();
  peer.doc.destroy();
});

test('changing an imported font family selects the requested face and undo restores the source font', async () => {
  fonts.add(
    'Mono-Regular',
    await Bun.file(
      new URL('./fixtures/editing-fonts/LiberationMono-Regular.ttf', import.meta.url),
    ).bytes(),
  );
  const pdf = embeddedText('BT /F 24 Tf 30 200 Td (AV) Tj ET'),
    model = new PdfTextModel();
  fonts.importDocument(pdf);
  model.initialize(importPdfText(pdf));
  const id = model.ids()[0]!,
    source = fonts.shape('A', model.styleAt(id, 0)).face;
  model.format(id, 0, 2, { family: 'Mono' });
  expect(fonts.shape('A', model.styleAt(id, 0)).face.key).toBe('Mono-Regular');
  const glyphs = new PdfInterpreter(openPdfDocument(exportEditedPdf(pdf, model, fonts)))
    .page(0)
    .elements.filter((e) => e.kind === 'glyph');
  expect(glyphs.every((glyph) => glyph.font.baseName === 'LiberationMono')).toBe(true);
  model.undo.undo();
  expect(fonts.shape('A', model.styleAt(id, 0)).face.key).toBe(source.key);
  model.doc.destroy();
});
