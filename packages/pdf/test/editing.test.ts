import { test, expect } from 'bun:test';
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
  pdfTextContent,
} from '../src/index.ts';
const fonts = new PdfEditingFonts();
for (const family of ['Sans', 'Serif', 'Mono'])
  for (const style of ['Regular', 'Bold', 'Italic', 'BoldItalic'])
    fonts.add(
      `${family}-${style}`,
      new Uint8Array(
        await Bun.file(
          new URL(`./fixtures/editing-fonts/LiberationSans-${style}.ttf`, import.meta.url),
        ).arrayBuffer(),
      ),
    );
const source = process.env.TUMBLER_PDF_EDIT_SOURCE
  ? await Bun.file(process.env.TUMBLER_PDF_EDIT_SOURCE).bytes()
  : await Bun.file(new URL('./fixtures/basic-text.pdf', import.meta.url)).bytes();
test('import, continue, format and export existing text with an independent source revision', () => {
  const pdf = openPdfDocument(source),
    model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const id = model.ids(0)[0]!;
  expect(model.text(id).length).toBeGreaterThan(0);
  expect(model.dirty(id)).toBe(false);
  model.replace(id, model.text(id).length, model.text(id).length, '\nA new line with café.');
  model.format(id, 0, 3, { bold: true, italic: true, underline: true });
  const output = exportEditedPdf(pdf, model, fonts);
  expect(output.subarray(0, source.length)).toEqual(source);
  const reopened = openPdfDocument(output);
  expect(new PdfInterpreter(reopened).page(0).text).toContain('A new line with café.');
  expect(layoutPdfText(model, id, fonts).carets.at(-1)!.y).toBeGreaterThan(model.seed(id).y);
});
test('concurrent text and formatting converge, including selective undo', () => {
  const a = new PdfTextModel();
  a.initialize(importPdfText(openPdfDocument(source)));
  const b = new PdfTextModel();
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  const id = a.ids()[0]!,
    baseA = Y.encodeStateVector(a.doc),
    baseB = Y.encodeStateVector(b.doc);
  a.replace(id, 0, 0, 'Alex ');
  b.replace(id, b.text(id).length, b.text(id).length, ' Codex');
  b.format(id, 0, 3, { bold: true });
  const ua = Y.encodeStateAsUpdate(a.doc, baseB),
    ub = Y.encodeStateAsUpdate(b.doc, baseA);
  Y.applyUpdate(a.doc, ub);
  Y.applyUpdate(b.doc, ua);
  expect(a.text(id).toDelta()).toEqual(b.text(id).toDelta());
  a.undo.undo();
  expect(a.text(id).toString()).toContain('Codex');
  expect(a.text(id).toString()).not.toStartWith('Alex');
});

function positionedPage(content: string) {
  return pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>',
    pdfStream(content),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]);
}
test('removing a TJ operation preserves numeric kerning and the next text origin', () => {
  const pdf = openPdfDocument(
    positionedPage('BT /F 12 Tf 20 150 Td [(Old) -250 ( text)] TJ (Untouched) Tj ET'),
  );
  const model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const id = model.ids(0)[0]!;
  // Separate the two showing operations into independent editable regions.
  const seed = model.seed(id),
    first = seed.sources[0]!;
  const original = new PdfInterpreter(pdf).page(0).elements.filter((e) => e.kind === 'glyph');
  const suffix = original.filter((e) => e.source.start !== first.start);
  model.doc.transact(
    () => model.regions.get(id)!.set('seed', { ...seed, sources: [first] }),
    'import',
  );
  model.replace(id, 0, model.text(id).length, 'Replacement');
  const output = new PdfInterpreter(openPdfDocument(exportEditedPdf(pdf, model, fonts))).page(0);
  const retained = output.elements
    .filter((e) => e.kind === 'glyph')
    .filter((e) => e.font.baseName === 'Helvetica');
  expect(retained.map((e) => e.glyph.unicode).join('')).toBe('Untouched');
  retained[0]!.state.transform.forEach((value, i) =>
    expect(value).toBeCloseTo(suffix[0]!.state.transform[i]!, 8),
  );
  expect(output.text).not.toContain('Old');
});
test('editing one shared Form instance preserves the other instance', () => {
  const pdf = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /XObject << /X 5 0 R >> >> /Contents 4 0 R >>',
      pdfStream('q 1 0 0 1 20 150 cm /X Do Q q 1 0 0 1 20 70 cm /X Do Q'),
      pdfStream(
        'BT /F 12 Tf 0 0 Td (Shared) Tj ET',
        '/Type /XObject /Subtype /Form /BBox [0 -20 200 20] /Resources << /Font << /F 6 0 R >> >>',
      ),
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ]),
  );
  const model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  expect(model.ids().length).toBe(2);
  const id = model.ids()[0]!;
  model.replace(id, 0, 6, 'Changed');
  const page = new PdfInterpreter(openPdfDocument(exportEditedPdf(pdf, model, fonts))).page(0);
  expect(page.text).toContain('Shared');
  expect(page.text).toContain('Changed');
  expect(page.elements.filter((e) => e.kind === 'glyph' && e.glyph.unicode === 'S').length).toBe(1);
});
test('undoing local text in a new region retains a remote contribution', () => {
  const a = new PdfTextModel();
  a.add({
    id: 'new',
    page: 0,
    x: 20,
    y: 40,
    width: 100,
    lineHeight: 15,
    style: {
      bold: false,
      italic: false,
      underline: false,
      size: 12,
      family: 'Sans',
      color: '#000000',
    },
    sources: [],
    delta: [],
  });
  a.replace('new', 0, 0, 'Alex');
  const b = new PdfTextModel();
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  b.replace('new', 4, 4, ' Codex');
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
  a.undo.undo();
  expect(a.text('new').toString()).toBe(' Codex');
});
test('continued paragraphs push later text and create real PDF pages without losing the final line', () => {
  const pdf = openPdfDocument(
    positionedPage(
      'BT /F 12 Tf 20 150 Td (Heading) Tj ET BT /F 12 Tf 20 100 Td (Following paragraph) Tj ET',
    ),
  );
  const model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const first = model.ids()[0]!;
  const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join('\n');
  model.replace(first, 7, 7, '\n' + lines);
  const reopened = openPdfDocument(exportEditedPdf(pdf, model, fonts));
  expect(reopened.pages.length).toBeGreaterThan(1);
  const interpreter = new PdfInterpreter(reopened),
    text = reopened.pages.map((p) => interpreter.page(p.index).text).join('\n');
  expect(text).toContain('Line 40');
  expect(text).toContain('Following paragraph');
  for (const page of reopened.pages)
    for (const glyph of interpreter.page(page.index).elements.filter((e) => e.kind === 'glyph')) {
      expect(glyph.textMatrix[5]).toBeGreaterThanOrEqual(0);
      expect(glyph.textMatrix[5]).toBeLessThanOrEqual(page.height);
    }
});

test('source fonts without naming or post tables retain their encoding and original glyph metrics', async () => {
  const program = await Bun.file(
    new URL('./fixtures/editing-fonts/LiberationSans-Regular.ttf', import.meta.url),
  ).bytes();
  const table = new DataView(program.buffer, program.byteOffset, program.byteLength);
  for (let i = 0; i < table.getUint16(4); i++) {
    const offset = 12 + i * 16,
      tag = new TextDecoder().decode(program.subarray(offset, offset + 4));
    if (tag === 'name' || tag === 'post')
      program.set(new TextEncoder().encode(tag === 'name' ? 'zz01' : 'zz02'), offset);
  }
  const full = fonts.get({
    bold: false,
    italic: false,
    underline: false,
    size: 48,
    family: 'Sans',
    color: '#000000',
  });
  const widths = Array.from(
    { length: 95 },
    (_, i) => (full.font.glyphForCodePoint(i + 32).advanceWidth * 1000) / full.font.unitsPerEm,
  );
  const pdf = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>',
      pdfStream('BT /F 48 Tf 30 200 Td [(H) 75 (ello)] TJ ET'),
      `<< /Type /Font /Subtype /TrueType /BaseFont /ABCDEF+LiberationSans-Regular /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [${widths.join(' ')}] /FontDescriptor 6 0 R >>`,
      '<< /Type /FontDescriptor /FontName /ABCDEF+LiberationSans-Regular /Flags 32 /FontBBox [-500 -500 2000 2000] /Ascent 900 /Descent -200 /CapHeight 700 /ItalicAngle 0 /StemV 80 /FontFile2 7 0 R >>',
      pdfStream(program),
    ]),
  );
  const scoped = fonts.fork(pdf),
    model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const id = model.ids()[0]!,
    before = layoutPdfText(model, id, scoped);
  const original = scoped.shape('H', model.seed(id).style);
  expect(original.face.source).toBeDefined();
  expect(original.face.family).toBe('liberationsans');
  model.replace(id, 5, 5, 'W');
  const after = layoutPdfText(model, id, scoped);
  expect(after.glyphs.slice(0, 5)).toEqual(before.glyphs);
  const positions = pdfTextContent(new PdfInterpreter(pdf).page(0)).items.filter(
    (item) => item.kind === 'glyph',
  );
  for (let i = 0; i < 5; i++)
    expect(before.glyphs[i]!.x).toBeCloseTo(positions[i]!.transform[4], 5);
  expect(scoped.shape('W', model.seed(id).style).face.source).toBeUndefined();
  const output = exportEditedPdf(pdf, model, scoped),
    scene = new PdfInterpreter(openPdfDocument(output)).page(0);
  expect(scene.text).toBe('HelloW');
  const sourceGlyphs = new PdfInterpreter(pdf).page(0).elements.filter((e) => e.kind === 'glyph');
  const editedGlyphs = scene.elements.filter((e) => e.kind === 'glyph');
  for (let i = 0; i < 5; i++) {
    expect(editedGlyphs[i]!.glyph.path).toBe(sourceGlyphs[i]!.glyph.path);
    expect(editedGlyphs[i]!.fontSize).toBe(sourceGlyphs[i]!.fontSize);
    expect(editedGlyphs[i]!.glyph.width).toBeCloseTo(sourceGlyphs[i]!.glyph.width, 5);
  }
  model.doc.destroy();
});
