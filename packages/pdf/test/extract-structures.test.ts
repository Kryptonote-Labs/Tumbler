import { test, expect } from 'bun:test';
import {
  openPdfDocument,
  extractPdfPages,
  PdfReference,
  PdfStream,
  PdfString,
} from '../src/index.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';

test('tagged extraction preserves selected structure and its reverse parent map without excluded semantic text', () => {
  const source = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R /MarkInfo << /Marked true >> /Lang (en) >>',
      '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 200 300] /Resources << >> >>',
      '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /StructParents 0 >>',
      '<< /Type /Page /Parent 2 0 R /Contents 6 0 R /StructParents 1 >>',
      pdfStream('/P << /MCID 0 >> BDC 10 10 20 20 re f EMC'),
      pdfStream('/P << /MCID 0 >> BDC 30 30 20 20 re f EMC'),
      '<< /Type /StructTreeRoot /K [8 0 R 9 0 R] /ParentTree 10 0 R >>',
      '<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 /Alt (Selected description) >>',
      '<< /Type /StructElem /S /P /P 7 0 R /Pg 4 0 R /K 0 /Alt (SECRET DESCRIPTION) >>',
      '<< /Nums [0 [8 0 R] 1 [9 0 R]] >>',
    ]),
  );
  const bytes = extractPdfPages(source, [0]),
    output = openPdfDocument(bytes);
  expect(new TextDecoder().decode(bytes)).not.toContain('SECRET DESCRIPTION');
  const root = output.source.resolve(output.source.catalog.get('StructTreeRoot'));
  expect(root).toBeInstanceOf(Map);
  if (!(root instanceof Map)) throw new Error('Missing structure');
  expect(root.get('K')).toHaveLength(1);
  const tree = output.source.resolve(root.get('ParentTree'));
  expect(tree).toBeInstanceOf(Map);
  if (!(tree instanceof Map)) throw new Error('Missing parent tree');
  expect(tree.get('Nums')).toHaveLength(2);
  expect(output.pages[0]!.dictionary.get('StructParents')).toBe(0);
});

test('form extraction prunes unselected widgets while retaining inherited field values and appearance streams', () => {
  const source = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R /AcroForm 7 0 R >>',
      '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 200 300] /Resources << >> >>',
      '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [9 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /Contents 6 0 R /Annots [10 0 R] >>',
      pdfStream(''),
      pdfStream(''),
      '<< /Fields [8 0 R] /NeedAppearances false >>',
      '<< /FT /Tx /T (Shared field) /V (Current value) /Kids [9 0 R 10 0 R] >>',
      '<< /Type /Annot /Subtype /Widget /Parent 8 0 R /P 3 0 R /Rect [10 10 100 30] /AP << /N 11 0 R >> >>',
      '<< /Type /Annot /Subtype /Widget /Parent 8 0 R /P 4 0 R /Rect [10 10 100 30] /AP << /N 12 0 R >> /TU (SECRET WIDGET LABEL) >>',
      pdfStream(
        '10 10 20 20 re f',
        '/Type /XObject /Subtype /Form /BBox [0 0 100 30] /Resources << >>',
      ),
      pdfStream(
        '% SECRET APPEARANCE\n30 30 20 20 re f',
        '/Type /XObject /Subtype /Form /BBox [0 0 100 30] /Resources << >>',
      ),
    ]),
  );
  const bytes = extractPdfPages(source, [0]),
    output = openPdfDocument(bytes),
    text = new TextDecoder().decode(bytes);
  expect(text).not.toContain('SECRET WIDGET LABEL');
  expect(text).not.toContain('SECRET APPEARANCE');
  const form = output.source.resolve(output.source.catalog.get('AcroForm'));
  if (!(form instanceof Map)) throw new Error('Missing form');
  const fields = form.get('Fields');
  expect(fields).toHaveLength(1);
  if (!Array.isArray(fields)) throw new Error('Missing fields');
  const field = output.source.resolve(fields[0]);
  if (!(field instanceof Map)) throw new Error('Missing field');
  expect(field.get('Kids')).toHaveLength(1);
});

test('extraction copies encoded content without requiring a supported rendering filter', () => {
  const source = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 4 0 R >>',
      pdfStream('opaque content bytes', '/Filter /FutureCodec'),
    ]),
  );
  const output = openPdfDocument(extractPdfPages(source, [0]));
  const stream = output.source.resolve(output.pages[0]!.dictionary.get('Contents'));
  expect(stream).toBeInstanceOf(PdfStream);
  if (!(stream instanceof PdfStream)) throw new Error('Missing stream');
  expect(new TextDecoder().decode(stream.encoded)).toBe('opaque content bytes');
});

test('bookmarks and named links retain selected destinations and prune excluded targets', () => {
  const source = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R /Outlines 7 0 R /Names << /Dests << /Names [(selected) [3 0 R /Fit] (excluded) [4 0 R /Fit]] >> >> >>',
      '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 200 300] /Resources << >> >>',
      '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [10 0 R 11 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>',
      pdfStream('10 10 20 20 re f'),
      pdfStream('% SECRET PAGE\n30 30 20 20 re f'),
      '<< /Type /Outlines /First 8 0 R /Last 9 0 R /Count 2 >>',
      '<< /Title (Selected bookmark) /Parent 7 0 R /Next 9 0 R /Dest (selected) >>',
      '<< /Title (SECRET BOOKMARK) /Parent 7 0 R /Prev 8 0 R /Dest (excluded) >>',
      '<< /Type /Annot /Subtype /Link /P 3 0 R /Rect [0 0 20 20] /A << /S /GoTo /D (selected) >> >>',
      '<< /Type /Annot /Subtype /Link /P 3 0 R /Rect [20 20 40 40] /A << /S /GoTo /D (excluded) >> >>',
    ]),
  );
  const bytes = extractPdfPages(source, [0]),
    output = openPdfDocument(bytes),
    text = new TextDecoder().decode(bytes);
  const outlineRoot = output.source.resolve(output.source.catalog.get('Outlines'));
  if (!(outlineRoot instanceof Map)) throw new Error('Missing outline');
  const first = output.source.resolve(outlineRoot.get('First'));
  if (!(first instanceof Map)) throw new Error('Missing bookmark');
  const title = first.get('Title');
  expect(title).toBeInstanceOf(PdfString);
  if (!(title instanceof PdfString)) throw new Error('Missing title');
  expect(new TextDecoder().decode(title.bytes)).toBe('Selected bookmark');
  expect(text).not.toContain('SECRET BOOKMARK');
  expect(text).not.toContain('SECRET PAGE');
  const outlines = output.source.resolve(output.source.catalog.get('Outlines'));
  if (!(outlines instanceof Map)) throw new Error('Missing bookmarks');
  expect(outlines.get('Count')).toBe(1);
});

test('page-only rotation and deletion do not decode opaque content streams', async () => {
  const { PdfTextModel, PdfEditingFonts, exportEditedPdf } = await import('../src/index.ts');
  const source = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 5 0 R >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 6 0 R >>',
      pdfStream('opaque selected content', '/Filter /FutureCodec'),
      pdfStream('opaque excluded content', '/Filter /FutureCodec'),
    ]),
  );
  const model = new PdfTextModel();
  model.pages.rotate(source.pages, [source.pages[0]!.id], 90);
  model.pages.remove(source.pages, [source.pages[1]!.id]);
  const bytes = exportEditedPdf(source, model, new PdfEditingFonts()),
    output = openPdfDocument(bytes);
  expect(output.pages).toHaveLength(1);
  expect(output.pages[0]!.rotation).toBe(90);
  expect(new TextDecoder().decode(bytes)).not.toContain('opaque excluded content');
});

test('deletion prunes links to old page objects outside the current page tree', async () => {
  const { PdfTextModel, PdfEditingFonts, exportEditedPdf } = await import('../src/index.ts');
  const source = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R /Names << /Dests << /Names [(deleted) [4 0 R /Fit]] >> >> >>',
      '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 200 300] /Resources << >> >>',
      '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [7 0 R 8 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>',
      pdfStream('10 10 20 20 re f'),
      pdfStream('% DELETED SECRET PAGE CONTENT\n30 30 20 20 re f'),
      '<< /Type /Annot /Subtype /Link /P 3 0 R /Rect [0 0 10 10] /Dest [4 0 R /Fit] >>',
      '<< /Type /Annot /Subtype /Link /P 3 0 R /Rect [10 10 20 20] /A << /S /GoTo /D (deleted) >> >>',
    ]),
  );
  const model = new PdfTextModel();
  model.pages.remove(source.pages, [source.pages[1]!.id]);
  const bytes = exportEditedPdf(source, model, new PdfEditingFonts()),
    output = openPdfDocument(bytes);
  expect(output.pages).toHaveLength(1);
  expect(new TextDecoder().decode(bytes)).not.toContain('DELETED SECRET PAGE CONTENT');
  const annotations = output.source.resolve(output.pages[0]!.dictionary.get('Annots'));
  if (!Array.isArray(annotations)) throw new Error('Missing annotations');
  for (const value of annotations) {
    const annotation = output.source.resolve(value);
    if (!(annotation instanceof Map)) throw new Error('Missing annotation');
    expect(annotation.has('Dest')).toBe(false);
    expect(annotation.has('A')).toBe(false);
  }
});

for (const name of ['encrypted-rc4', 'encrypted-aes128', 'encrypted-aes256'])
  test(`extracting authenticated ${name} pages writes readable unencrypted stream payloads`, async () => {
    const { PdfInterpreter } = await import('../src/index.ts');
    const data = await Bun.file(new URL(`./fixtures/${name}.pdf`, import.meta.url)).bytes();
    const source = openPdfDocument(data, { password: 'fixture-password' }),
      output = openPdfDocument(extractPdfPages(source, [0]));
    expect(output.source.trailer.has('Encrypt')).toBe(false);
    expect(new PdfInterpreter(output).page(0).text).toBe(new PdfInterpreter(source).page(0).text);
  });
