import { expect, test } from 'bun:test';
import { deflateSync } from 'node:zlib';
import { openPdfDocument, mergePdfDocuments, parsePdfPageSelection, PdfInterpreter, PdfName, PdfReference, PdfStream, PdfString, type PdfValue } from '../src/index.ts';
import { dictionary, bytesText } from '../src/objects.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';

const text = (label: string, font = 'Helvetica') => openPdfDocument(pdfFixture([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 3 /Kids [3 0 R 4 0 R 5 0 R] /MediaBox [0 0 200 300] /CropBox [10 20 190 280] /Rotate 90 /Resources << /Font << /F 6 0 R >> >> >>',
  '<< /Type /Page /Parent 2 0 R /Contents 7 0 R >>',
  '<< /Type /Page /Parent 2 0 R /Contents 8 0 R /UserUnit 2 >>',
  '<< /Type /Page /Parent 2 0 R /Contents 9 0 R >>',
  `<< /Type /Font /Subtype /Type1 /BaseFont /${font} >>`,
  ...[1, 2, 3].map((i) => pdfStream(deflateSync(`BT /F 12 Tf 20 200 Td (${label}${i}) Tj ET`), '/Filter /FlateDecode')),
]));
const texts = (doc: ReturnType<typeof openPdfDocument>) => new PdfInterpreter(doc).document.pages.map((p) => new PdfInterpreter(doc).page(p.index).text);

test('merge accepts every-page defaults, written order, interleaving, repeats, independent resource names and inherited geometry', () => {
  const a = text('A'), b = text('B', 'Courier');
  const originalA = a.bytes(), originalB = b.bytes();
  const bytes = mergePdfDocuments([{ document: a, pages: [2, 0] }, { document: b, pages: [1] }, { document: a, pages: [1, 1, 2] }]);
  const merged = openPdfDocument(bytes);
  expect(texts(merged)).toEqual(['A3', 'A1', 'B2', 'A2', 'A2', 'A3']);
  expect(merged.pages.map((p) => [p.mediaBox, p.cropBox, p.rotation, p.userUnit])).toEqual([a.pages[2], a.pages[0], b.pages[1], a.pages[1], a.pages[1], a.pages[2]].map((p) => [p!.mediaBox, p!.cropBox, p!.rotation, p!.userUnit]));
  expect(merged.source.revisions).toHaveLength(1);
  expect(a.bytes()).toEqual(originalA); expect(b.bytes()).toEqual(originalB);
  expect(texts(openPdfDocument(mergePdfDocuments([{ document: a }, { document: b }])))).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  for (const [i, original] of [a.pages[2], a.pages[0], b.pages[1], a.pages[1], a.pages[1], a.pages[2]].entries()) {
    const doc = i === 2 ? b : a;
    const before = doc.source.resolve(original!.dictionary.get('Contents')) as PdfStream;
    const after = merged.source.resolve(merged.pages[i]!.dictionary.get('Contents')) as PdfStream;
    expect(after.encoded).toEqual(before.encoded);
  }
});

test('page selection retains repetitions and descending ranges and rejects all invalid input before expanding', () => {
  expect(parsePdfPageSelection('3, 2-1,1,2-3', 3)).toEqual([2, 1, 0, 0, 1, 2]);
  for (const selection of ['', '0', '-1', '1,', '1.2', 'all', '2--1', '4', '1-9999999999999', 'NaN', '1e2', '1 2'])
    expect(() => parsePdfPageSelection(selection, 3)).toThrow();
  expect(() => parsePdfPageSelection('1', 0)).toThrow();
  const document = text('A');
  expect(() => mergePdfDocuments([])).toThrow();
  for (const pages of [[], [-1], [3], [NaN], [1.5]]) expect(() => mergePdfDocuments([{ document, pages }])).toThrow();
});

function form(font = 'Helvetica', signature = false) {
  return openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 200 300] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Annots [7 0 R] >>',
    pdfStream(''),
    `<< /Type /Font /Subtype /Type1 /BaseFont /${font} >>`,
    '<< /Fields [7 0 R] /DR << /Font << /F 5 0 R >> >> /DA (/F 12 Tf 0 g) /Q 1 /NeedAppearances false >>',
    `<< /Type /Annot /Subtype /Widget /FT /${signature ? 'Sig' : 'Tx'} /T (same) /V (current value) /Rect [10 20 100 40] /P 3 0 R /AP << /N 8 0 R >> >>`,
    pdfStream('0 0 20 20 re f', '/Type /XObject /Subtype /Form /BBox [0 0 100 20] /Resources << >>'),
  ]));
}

test('interactive forms keep distinct widgets, parent trees, field values and encoded appearances with colliding names and fonts', () => {
  const merged = openPdfDocument(mergePdfDocuments([{ document: form(), pages: [0, 0] }, { document: form('Courier') }]));
  const source = merged.source, acro = dictionary(source.resolve(source.catalog.get('AcroForm')));
  const fields = acro.get('Fields') as PdfReference[];
  expect(fields).toHaveLength(3);
  const dr = dictionary(source.resolve(acro.get('DR'))), fonts = dictionary(source.resolve(dr.get('Font')));
  expect([...fonts.keys()]).toEqual(['source1_F', 'source2_F', 'source3_F']);
  fields.forEach((ref, i) => {
    const root = dictionary(source.resolve(ref)), widgetRef = (root.get('Kids') as PdfReference[])[0]!;
    const widget = dictionary(source.resolve(widgetRef));
    expect(bytesText((root.get('T') as PdfString).bytes)).toBe(`source${i + 1}`);
    expect(bytesText((root.get('DA') as PdfString).bytes)).toBe(`/source${i + 1}_F 12 Tf 0 g`);
    expect(bytesText((widget.get('V') as PdfString).bytes)).toBe('current value');
    expect((widget.get('Parent') as PdfReference).key).toBe(ref.key);
    expect((widget.get('P') as PdfReference).key).toBe(merged.pages[i]!.reference.key);
    const annots = source.resolve(merged.pages[i]!.dictionary.get('Annots')) as PdfReference[];
    expect(annots[0]!.key).toBe(widgetRef.key);
    const appearance = dictionary(source.resolve(widget.get('AP'))).get('N');
    expect(bytesText(source.stream(appearance))).toBe('0 0 20 20 re f');
  });
  expect(() => mergePdfDocuments([{ document: form('Helvetica', true) }])).toThrow('signature');
});

function tagged() {
  return openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /Lang (en) >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 200 300] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /StructParents 0 >>',
    pdfStream('/P << /MCID 0 >> BDC 10 10 20 20 re f EMC'),
    '<< /Type /StructTreeRoot /K [6 0 R] /ParentTree << /Nums [0 [6 0 R]] >> /IDTree << /Names [(identifier) 6 0 R] >> >>',
    '<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 /Alt (Description) /ID (identifier) >>',
  ]));
}

test('tagged PDF reverse page maps, structure ownership, language and identifiers remain disjoint', () => {
  const merged = openPdfDocument(mergePdfDocuments([{ document: tagged() }, { document: tagged() }]));
  const source = merged.source, root = dictionary(source.resolve(source.catalog.get('StructTreeRoot')));
  const groups = root.get('K') as PdfReference[];
  expect(groups).toHaveLength(2);
  const parentTree = dictionary(source.resolve(root.get('ParentTree'))).get('Nums') as PdfValue[];
  expect(parentTree[0]).toBe(0); expect(parentTree[2]).toBe(1);
  expect(merged.pages.map((p) => p.dictionary.get('StructParents'))).toEqual([0, 1]);
  groups.forEach((ref, i) => {
    const group = dictionary(source.resolve(ref));
    expect((group.get('P') as PdfReference).key).toBe((source.catalog.get('StructTreeRoot') as PdfReference).key);
    expect((group.get('S') as PdfName).value).toBe('Document');
    expect(bytesText((group.get('Lang') as PdfString).bytes)).toBe('en');
    const child = dictionary(source.resolve((group.get('K') as PdfReference[])[0]));
    expect((child.get('P') as PdfReference).key).toBe(ref.key);
    expect((child.get('Pg') as PdfReference).key).toBe(merged.pages[i]!.reference.key);
    expect(bytesText((child.get('ID') as PdfString).bytes)).toBe(`source${i + 1}:identifier`);
  });
});

test('layer visibility and outline destinations survive independent source catalogs and reordered pages', () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [6 0 R] /D << /BaseState /OFF /Order [6 0 R] >> >> /Outlines 7 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 100 100] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Resources << /Properties << /Layer 6 0 R >> >> /Annots [9 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
    pdfStream('/OC /Layer BDC 10 10 20 20 re f EMC'),
    '<< /Type /OCG /Name (Invisible layer) >>',
    '<< /Type /Outlines /First 8 0 R /Last 8 0 R /Count 1 >>',
    '<< /Title (Second page) /Parent 7 0 R /Dest [4 0 R /Fit] >>',
    '<< /Type /Annot /Subtype /Link /P 3 0 R /Rect [10 10 20 20] /Dest [4 0 R /Fit] >>',
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document, pages: [1, 0] }, { document }]));
  const source = merged.source, oc = dictionary(source.resolve(source.catalog.get('OCProperties')));
  expect(oc.get('OCGs')).toHaveLength(2);
  const config = dictionary(source.resolve(oc.get('D')));
  expect(config.get('ON')).toEqual([]); expect(config.get('OFF')).toHaveLength(2);
  const firstPage = merged.pages[1]!;
  const annot = dictionary(source.resolve((firstPage.dictionary.get('Annots') as PdfReference[])[0]));
  expect(((annot.get('Dest') as PdfReference[])[0] as PdfReference).key).toBe(merged.pages[0]!.reference.key);
  const outlines = dictionary(source.resolve(source.catalog.get('Outlines')));
  const first = dictionary(source.resolve(outlines.get('First'))), last = dictionary(source.resolve(outlines.get('Last')));
  expect(((first.get('Dest') as PdfReference[])[0] as PdfReference).key).toBe(merged.pages[0]!.reference.key);
  expect(((last.get('Dest') as PdfReference[])[0] as PdfReference).key).toBe(merged.pages[3]!.reference.key);
  expect((first.get('Next') as PdfReference).key).toBe((outlines.get('Last') as PdfReference).key);
});

for (const fixture of ['basic-text', 'positioned-text', 'compressed-content', 'object-streams', 'incremental-revision', 'unicode-map', 'truetype-extraction', 'graphics', 'image-only', 'inline-image', 'shared-form', 'annotation', 'inherited-page', 'linearized', 'tagged-order', 'split-content-state', 'chromium-typography', 'encrypted-aes128', 'encrypted-aes256', 'encrypted-rc4'])
  test(`merge retains parsed content and page geometry for ${fixture}`, async () => {
    const bytes = await Bun.file(new URL(`./fixtures/${fixture}.pdf`, import.meta.url)).bytes();
    const document = openPdfDocument(bytes, fixture.startsWith('encrypted-') ? { password: 'fixture-password' } : {});
    const indices = document.pages.map((_, i) => i).reverse();
    const merged = openPdfDocument(mergePdfDocuments([{ document, pages: indices }, { document }]));
    expect(merged.source.encrypted).toBe(false);
    expect(merged.pages).toHaveLength(document.pages.length * 2);
    [...indices, ...document.pages.map((_, i) => i)].forEach((index, i) => {
      expect(merged.contents(merged.pages[i]!)).toEqual(document.contents(document.pages[index]!));
      expect(merged.pages[i]!.mediaBox).toEqual(document.pages[index]!.mediaBox);
      expect(merged.pages[i]!.cropBox).toEqual(document.pages[index]!.cropBox);
      expect(merged.pages[i]!.rotation).toEqual(document.pages[index]!.rotation);
    });
  });

test('indirect page and annotation structure indices retain disjoint reverse mappings', () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 200 300] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /StructParents 7 0 R /Annots [8 0 R] >>',
    pdfStream('/P << /MCID 0 >> BDC 10 10 20 20 re f EMC'),
    '<< /Type /StructTreeRoot /K [6 0 R] /ParentTree << /Nums [0 [6 0 R] 1 6 0 R] >> >>',
    '<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K [0 << /Type /OBJR /Obj 8 0 R /Pg 3 0 R >>] >>',
    '0',
    '<< /Type /Annot /Subtype /Text /P 3 0 R /Rect [0 0 10 10] /StructParent 9 0 R >>',
    '1',
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document }, { document }]));
  const source = merged.source;
  expect(merged.pages.map(page => source.resolve(page.dictionary.get('StructParents')))).toEqual([0, 2]);
  const annotations = merged.pages.map(page => dictionary(source.resolve((source.resolve(page.dictionary.get('Annots')) as PdfReference[])[0])));
  expect(annotations.map(annotation => source.resolve(annotation.get('StructParent')))).toEqual([1, 3]);
  const root = dictionary(source.resolve(source.catalog.get('StructTreeRoot')));
  const nums = dictionary(source.resolve(root.get('ParentTree'))).get('Nums') as PdfValue[];
  expect(nums.filter((_, index) => index % 2 === 0)).toEqual([0, 1, 2, 3]);
  expect((source.resolve(nums[1]) as PdfReference[])[0]!.key).not.toBe((source.resolve(nums[5]) as PdfReference[])[0]!.key);
});
