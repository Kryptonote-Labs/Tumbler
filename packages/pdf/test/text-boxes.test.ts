import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { readdir } from 'node:fs/promises';
import {
  openPdfDocument,
  PdfInterpreter,
  PdfTextModel,
  PdfEditingFonts,
  importPdfText,
  exportEditedPdf,
  pdfTextContent,
  placePdfScene,
  layoutPdfTextFlow,
} from '../src/index.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';

const fonts = new PdfEditingFonts();
for (const family of ['Sans', 'Serif', 'Mono'])
  for (const style of ['Regular', 'Bold', 'Italic', 'BoldItalic'])
    fonts.add(
      `${family}-${style}`,
      await Bun.file(
        new URL(`./fixtures/editing-fonts/LiberationSans-${style}.ttf`, import.meta.url),
      ).bytes(),
    );
function setup(bytes: Uint8Array) {
  const document = openPdfDocument(bytes),
    model = new PdfTextModel();
  model.initialize(importPdfText(document));
  return { document, model, fonts: fonts.fork(document) };
}
const original = (content: string, page = '') =>
  pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [5 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    pdfStream(content),
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R ${page} >>`,
  ]);
function text(value: string, x = 24, y = 110, size = 14) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${value}) Tj ET`;
}

test('row-interleaved columns, same-baseline table cells and headings form separate tight boxes', () => {
  const { model } = setup(
    original(
      [
        text('Heading', 24, 145, 18),
        text('Left one', 24, 110, 10),
        text('Right one', 140, 110, 10),
        text('Left two', 24, 97, 10),
        text('Right two', 140, 97, 10),
        text('Cell A', 24, 55, 10),
        text('Cell B', 140, 55, 10),
      ].join('\n'),
    ),
  );
  expect(model.ids().map((id) => model.text(id).toString())).toEqual([
    'Heading',
    'Left one\nLeft two',
    'Right one\nRight two',
    'Cell A',
    'Cell B',
  ]);
  for (const id of model.ids()) expect(model.seed(id).bounds!.width).toBeLessThan(100);
});

for (const [name, content, page] of [
  ['ordinary', `${text('Move me')}\n${text('Stay put', 24, 50)}`, ''],
  ['rotated text', 'BT /F1 14 Tf 0 1 -1 0 80 30 Tm (Rotate) Tj ET', ''],
  ['scaled CTM', 'q 1.5 0.2 0.3 0.7 7 9 cm BT /F1 12 Tf 20 80 Td (Scaled) Tj (Next) Tj ET Q', ''],
  [
    'quote operators',
    'BT /F1 12 Tf 15 TL 24 130 Td (First) Tj (Second) \' 3 0.5 (Third) " (End) Tj ET',
    '',
  ],
  ['kerning and spaces', 'BT /F1 12 Tf 24 100 Td [(A) 40 (B) -200 (C)] TJ (Later) Tj ET', ''],
  [
    'rotated cropped page',
    text('Crop rotate', 30, 95),
    '/CropBox [10 10 230 150] /Rotate 90 /UserUnit 2',
  ],
] as const)
  test(`moving ${name} preserves source glyphs, transforms and neighbouring text`, () => {
    const f = setup(original(content, page)),
      id = f.model.ids()[0]!;
    const source = new PdfInterpreter(f.document).page(0);
    f.model.move(id, 17, 23);
    const placed = placePdfScene(source, f.model);
    const output = exportEditedPdf(f.document, f.model, f.fonts);
    const scene = new PdfInterpreter(openPdfDocument(output)).page(0);
    const before = pdfTextContent(source).items.filter((i) => i.kind === 'glyph');
    const after = pdfTextContent(scene).items.filter((i) => i.kind === 'glyph');
    const preview = pdfTextContent(placed).items.filter((i) => i.kind === 'glyph');
    expect(after.map((i) => i.text)).toEqual(before.map((i) => i.text));
    const owned = new Set(
      f.model.seed(id).sources.map((s) => `${s.instance}/${s.object}/${s.start}`),
    );
    for (const [index, item] of before.entries()) {
      const target = after[index]!,
        rendered = preview[index]!;
      const moved = owned.has(
        `${item.source.instance}/${item.source.object.key}/${item.source.start}`,
      );
      for (let n = 0; n < 6; n++) {
        const expected = item.transform[n]! + (moved ? (n === 4 ? 17 : n === 5 ? 23 : 0) : 0);
        expect(target.transform[n]!).toBeCloseTo(expected, 4);
        expect(rendered.transform[n]!).toBeCloseTo(expected, 4);
      }
    }
    f.model.undo.undo();
    expect(exportEditedPdf(f.document, f.model, f.fonts)).toEqual(f.document.bytes());
  });

test('moving, resizing, hiding and undoing boxes do not displace surrounding paragraphs', () => {
  const f = setup(original(`${text('First', 24, 125)}\n${text('Second', 24, 70)}`));
  const [id, other] = f.model.ids();
  const before = layoutPdfTextFlow(f.model, f.fonts, f.document.pages);
  f.model.place(id!, { x: 45, y: 55, width: 25 });
  const after = layoutPdfTextFlow(f.model, f.fonts, f.document.pages);
  expect(after.regions.find((r) => r.id === other)).toEqual(
    before.regions.find((r) => r.id === other),
  );
  expect(after.pages).toHaveLength(1);
  f.model.undo.stopCapturing();
  f.model.hide(id!);
  expect(
    new PdfInterpreter(openPdfDocument(exportEditedPdf(f.document, f.model, f.fonts))).page(0).text,
  ).not.toContain('First');
  f.model.undo.undo();
  expect(f.model.placement(id!)?.hidden).not.toBe(true);
  f.model.undo.undo();
  expect(f.model.placement(id!)).toBeUndefined();
});

test('position and concurrent text edits converge independently', () => {
  const a = setup(original(text('Hello'))).model,
    b = new PdfTextModel();
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  const id = a.ids()[0]!;
  a.move(id, 35, 45);
  b.replace(id, 0, 0, 'Edited ');
  const au = Y.encodeStateAsUpdate(a.doc),
    bu = Y.encodeStateAsUpdate(b.doc);
  Y.applyUpdate(a.doc, bu);
  Y.applyUpdate(b.doc, au);
  expect(a.geometry(id)).toEqual(b.geometry(id));
  expect(a.text(id).toString()).toBe('Edited Hello');
  expect(b.text(id).toString()).toBe('Edited Hello');
});

const fixtures = new URL('./fixtures/', import.meta.url);
for (const file of await readdir(fixtures)) {
  if (
    !file.endsWith('.pdf') ||
    file.startsWith('encrypted') ||
    ['broken-xref.pdf', 'truncated.pdf'].includes(file)
  )
    continue;
  test(`all detected boxes move and export without losing text in ${file}`, async () => {
    const f = setup(await Bun.file(new URL(file, fixtures)).bytes());
    const scenes = f.document.pages.map((p) => new PdfInterpreter(f.document).page(p.index));
    const before = scenes.map((s) => pdfTextContent(s).items.filter((i) => i.kind === 'glyph'));
    for (const id of f.model.ids()) f.model.move(id, 9, 11);
    const result = openPdfDocument(exportEditedPdf(f.document, f.model, f.fonts));
    expect(result.pages).toHaveLength(f.document.pages.length);
    for (const page of result.pages) {
      const after = pdfTextContent(new PdfInterpreter(result).page(page.index)).items.filter(
        (i) => i.kind === 'glyph',
      );
      expect(after.map((i) => i.text)).toEqual(before[page.index]!.map((i) => i.text));
      const sources = new Set(
        f.model
          .ids(page.index)
          .flatMap((id) =>
            f.model.seed(id).sources.map((s) => `${s.instance}/${s.object}/${s.start}`),
          ),
      );
      for (const [i, item] of before[page.index]!.entries()) {
        const moved = sources.has(
          `${item.source.instance}/${item.source.object.key}/${item.source.start}`,
        );
        expect(after[i]!.transform[4]).toBeCloseTo(item.transform[4] + (moved ? 9 : 0), 3);
        expect(after[i]!.transform[5]).toBeCloseTo(item.transform[5] + (moved ? 11 : 0), 3);
      }
    }
  });
}

test('moving one occurrence in nested reused Forms preserves every other occurrence', () => {
  const bytes = pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [5 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    pdfStream('q 1 0 0 1 15 80 cm /Outer Do Q q 1 0 0 1 130 35 cm /Outer Do Q'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /XObject << /Outer 7 0 R >> >> /Contents 4 0 R >>',
    pdfStream(
      'BT /F1 12 Tf (Nested) Tj ET',
      '/Type /XObject /Subtype /Form /BBox [0 0 80 30] /Resources << /Font << /F1 3 0 R >> >>',
    ),
    pdfStream(
      '/Inner Do',
      '/Type /XObject /Subtype /Form /BBox [0 0 80 30] /Resources << /XObject << /Inner 6 0 R >> >>',
    ),
  ]);
  const f = setup(bytes),
    id = f.model.ids()[0]!;
  expect(f.model.ids()).toHaveLength(2);
  const before = pdfTextContent(new PdfInterpreter(f.document).page(0)).items.filter(
    (i) => i.kind === 'glyph',
  );
  f.model.move(id, 12, 17);
  const after = pdfTextContent(
    new PdfInterpreter(openPdfDocument(exportEditedPdf(f.document, f.model, f.fonts))).page(0),
  ).items.filter((i) => i.kind === 'glyph');
  expect(after.map((i) => i.text)).toEqual(before.map((i) => i.text));
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.transform[4]).toBeCloseTo(before[i]!.transform[4] + (i < 6 ? 12 : 0), 4);
    expect(after[i]!.transform[5]).toBeCloseTo(before[i]!.transform[5] + (i < 6 ? 17 : 0), 4);
  }
});

if (process.env.TUMBLER_PDF_ORACLE_PYTHON)
  test('PDFium preserves text advances across consecutive showing and quote operators', async () => {
    const source = original(
      'BT /F1 12 Tf 24 130 Td (First) Tj (Second) Tj 15 TL (Third) \' 2 0.5 (Fourth) " [(Last) -100 (word)] TJ ET',
    );
    const f = setup(source);
    for (const id of f.model.ids()) f.model.move(id, 9, 11);
    const output = exportEditedPdf(f.document, f.model, f.fonts);
    const process = Bun.spawn(
      [
        Bun.env.TUMBLER_PDF_ORACLE_PYTHON!,
        new URL('./move-text-oracle.py', import.meta.url).pathname,
      ],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
    );
    await process.stdin.write(
      JSON.stringify({
        source: Buffer.from(source).toString('base64'),
        output: Buffer.from(output).toString('base64'),
        translations: [[9, -11]],
      }),
    );
    await process.stdin.end();
    const error = await new Response(process.stderr).text();
    expect({ exit: await process.exited, error }).toEqual({ exit: 0, error: '' });
  });

test('Type3 glyph procedures move with their text and retain source ownership for hiding', async () => {
  const f = setup(await Bun.file(new URL('./fixtures/unicode-map.pdf', import.meta.url)).bytes());
  const source = new PdfInterpreter(f.document).page(0),
    id = f.model.ids()[0]!;
  f.model.move(id, 9, 11);
  const moved = placePdfScene(source, f.model);
  const paths = source.elements.filter((e) => e.kind === 'path'),
    placed = moved.elements.filter((e) => e.kind === 'path');
  expect(paths.length).toBeGreaterThan(0);
  for (const [i, path] of paths.entries()) {
    expect(placed[i]!.state.transform[4]).toBeCloseTo(path.state.transform[4] + 9, 5);
    expect(placed[i]!.state.transform[5]).toBeCloseTo(path.state.transform[5] - 11, 5);
    for (const [j, command] of path.path.entries())
      if (command.transform) {
        expect(placed[i]!.path[j]!.transform![4]).toBeCloseTo(command.transform[4] + 9, 5);
        expect(placed[i]!.path[j]!.transform![5]).toBeCloseTo(command.transform[5] - 11, 5);
      }
    expect(
      f.model
        .seed(id)
        .sources.some(
          (s) => s.instance === placed[i]!.source.instance && s.start === placed[i]!.source.start,
        ),
    ).toBe(true);
  }
});

test('undoing a duplicate removes copied text while retaining a peer contribution', () => {
  const a = setup(original(text('Hello'))).model,
    b = new PdfTextModel();
  a.duplicate(a.ids()[0]!, 'copy');
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  b.replace('copy', 5, 5, ' peer');
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
  a.undo.undo();
  expect(a.text('copy').toString()).toBe(' peer');
});

test('moving and resizing a continuation box keeps its page and visible origin', () => {
  const f = setup(original(text('Original'))),
    style = f.model.seed(f.model.ids()[0]!).style;
  f.model.add({
    id: 'continued',
    page: 0,
    continuation: 1,
    x: 24,
    y: 180,
    width: 180,
    lineHeight: 17.5,
    style,
    sources: [],
    delta: [],
  });
  f.model.replace('continued', 0, 0, 'Continued');
  const before = layoutPdfTextFlow(f.model, f.fonts, f.document.pages);
  expect(before.pages).toHaveLength(2);
  expect(before.regions.find((r) => r.id === 'continued')!.glyphs[0]!.y).toBe(100);
  f.model.move('continued', 10, 10);
  f.model.place('continued', { width: 150 });
  const after = layoutPdfTextFlow(f.model, f.fonts, f.document.pages),
    region = after.regions.find((r) => r.id === 'continued')!;
  expect(after.pages).toHaveLength(2);
  expect(region.page).toBe(1);
  expect(region.glyphs[0]!.x).toBe(34);
  expect(region.glyphs[0]!.y).toBe(110);
  const output = openPdfDocument(exportEditedPdf(f.document, f.model, f.fonts));
  expect(output.pages).toHaveLength(2);
  expect(new PdfInterpreter(output).page(1).text).toContain('Continued');
});

test('detaching a reflowed paragraph uses its rendered origin without jumping', () => {
  const f = setup(original(`${text('First', 24, 130)}\n${text('Second', 24, 85)}`)),
    [first, second] = f.model.ids();
  f.model.replace(first!, 5, 5, '\nLine 1\nLine 2\nLine 3');
  const before = layoutPdfTextFlow(f.model, f.fonts, f.document.pages).regions.find(
    (r) => r.id === second,
  )!;
  expect(before.glyphs[0]!.y).toBeGreaterThan(f.model.seed(second!).y);
  f.model.move(second!, 0, 10, before.origin);
  const after = layoutPdfTextFlow(f.model, f.fonts, f.document.pages).regions.find(
    (r) => r.id === second,
  )!;
  expect(after.glyphs[0]!.y).toBe(before.glyphs[0]!.y + 10);
});

test('nested Forms inside Type3 procedures move and hide with their owning text', () => {
  const source = pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [5 0 R] >>',
    '<< /Type /Font /Subtype /Type3 /FontBBox [0 0 600 800] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /A 6 0 R >> /Encoding << /Type /Encoding /Differences [65 /A] >> /FirstChar 65 /LastChar 65 /Widths [600] /Resources << /XObject << /X 7 0 R >> >> >>',
    pdfStream('BT /F1 12 Tf 24 100 Td (A) Tj ET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>',
    pdfStream('600 0 d0 /X Do'),
    pdfStream(
      '0 0 600 800 re f',
      '/Type /XObject /Subtype /Form /BBox [0 0 600 800] /Resources << >>',
    ),
  ]);
  const f = setup(source),
    id = f.model.ids()[0]!,
    scene = new PdfInterpreter(f.document).page(0);
  const original = scene.elements.find((e) => e.kind === 'path')!;
  f.model.move(id, 9, 11);
  const path = placePdfScene(scene, f.model).elements.find((e) => e.kind === 'path')!;
  expect(path.state.transform[4]).toBe(original.state.transform[4] + 9);
  expect(path.state.transform[5]).toBe(original.state.transform[5] - 11);
  f.model.hide(id);
  const hidden = placePdfScene(scene, f.model).elements.find((e) => e.kind === 'path')!;
  expect(
    f.model
      .seed(id)
      .sources.some(
        (s) => s.instance === hidden.source.instance && s.start === hidden.source.start,
      ),
  ).toBe(true);
});

test('detaching text pushed onto a continuation retains its page and exported text', () => {
  const f = setup(original(`${text('First', 24, 130)}\n${text('Second', 24, 85)}`)),
    [first, second] = f.model.ids();
  f.model.replace(
    first!,
    5,
    5,
    '\n' + Array.from({ length: 20 }, (_, i) => `Line ${i}`).join('\n'),
  );
  const before = layoutPdfTextFlow(f.model, f.fonts, f.document.pages).regions.find(
    (r) => r.id === second,
  )!;
  expect(before.origin.continuation).toBeGreaterThan(0);
  f.model.move(second!, 0, 10, before.origin);
  const after = layoutPdfTextFlow(f.model, f.fonts, f.document.pages).regions.find(
    (r) => r.id === second,
  )!;
  expect(after.page).toBe(before.page);
  expect(after.glyphs[0]!.y).toBe(before.glyphs[0]!.y + 10);
  const output = openPdfDocument(exportEditedPdf(f.document, f.model, f.fonts));
  expect(new PdfInterpreter(output).page(after.page).text).toContain('Second');
});

test('nudging a long paragraph preserves all continuation pages and lines', () => {
  const f = setup(original(text('Paragraph', 24, 130))),
    id = f.model.ids()[0]!;
  f.model.replace(id, 9, 9, '\n' + Array.from({ length: 20 }, (_, i) => `Line ${i}`).join('\n'));
  const before = layoutPdfTextFlow(f.model, f.fonts, f.document.pages);
  expect(before.pages.length).toBeGreaterThan(1);
  f.model.move(id, 1, 0, before.regions[0]!.origin);
  const after = layoutPdfTextFlow(f.model, f.fonts, f.document.pages);
  expect(after.pages).toHaveLength(before.pages.length);
  const output = openPdfDocument(exportEditedPdf(f.document, f.model, f.fonts)),
    reader = new PdfInterpreter(output);
  const visible = output.pages.map((p) => reader.page(p.index).text).join('\n');
  expect([...visible.matchAll(/Line \d+/g)].map((m) => m[0])).toEqual(
    Array.from({ length: 20 }, (_, i) => `Line ${i}`),
  );
});

test('moving original multiline text across the page edge preserves every line', () => {
  const f = setup(
      original([text('First', 24, 90), text('Second', 24, 70), text('Third', 24, 50)].join('\n')),
    ),
    id = f.model.ids()[0]!;
  expect(f.model.ids()).toHaveLength(1);
  f.model.move(id, 0, 60);
  const output = openPdfDocument(exportEditedPdf(f.document, f.model, f.fonts)),
    reader = new PdfInterpreter(output);
  expect(output.pages).toHaveLength(2);
  expect(
    output.pages
      .map((p) => pdfTextContent(reader.page(p.index)).text)
      .join('\n')
      .replace(/\s+/g, ' '),
  ).toContain('First Second Third');
});

test('duplicating a displaced paragraph uses its visible origin', () => {
  const f = setup(original(`${text('First', 24, 130)}\n${text('Second', 24, 85)}`)),
    [first, second] = f.model.ids();
  f.model.replace(first!, 5, 5, '\nOne\nTwo\nThree');
  const before = layoutPdfTextFlow(f.model, f.fonts, f.document.pages).regions.find(
    (r) => r.id === second,
  )!;
  f.model.duplicate(second!, 'copy', before.origin);
  const copy = layoutPdfTextFlow(f.model, f.fonts, f.document.pages).regions.find(
    (r) => r.id === 'copy',
  )!;
  expect(copy.glyphs[0]!.y).toBe(before.glyphs[0]!.y + 12);
  expect(copy.glyphs[0]!.x).toBe(before.glyphs[0]!.x + 12);
});
