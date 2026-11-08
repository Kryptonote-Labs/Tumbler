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

for (const resourceName of ['Outer', 'P', 'Parent', 'Pg'])
test(`tagged nested Form XObjects named ${resourceName} retain ParentTree entries and MCR stream references`, () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 100 100] >>',
    `<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /XObject << /${resourceName} 8 0 R >> >> >>`,
    pdfStream(`/${resourceName} Do`),
    '<< /Type /StructTreeRoot /K [6 0 R] /ParentTree << /Nums [0 [6 0 R]] >> >>',
    '<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K << /Type /MCR /Pg 3 0 R /Stm 7 0 R /MCID 0 >> >>',
    pdfStream('/P << /MCID 0 >> BDC 0 0 20 20 re f EMC', '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /StructParents 9 0 R'),
    pdfStream('/Inner Do', '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << /XObject << /Inner 7 0 R >> >>'),
    '0',
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document }, { document }]));
  const source = merged.source, root = dictionary(source.resolve(source.catalog.get('StructTreeRoot')));
  const nums = dictionary(source.resolve(root.get('ParentTree'))).get('Nums') as PdfValue[];
  expect(nums.filter((_, index) => index % 2 === 0)).toEqual([0, 1]);
  for (const index of [0, 1]) {
    const child = dictionary(source.resolve((source.resolve(nums[index * 2 + 1]) as PdfReference[])[0]));
    const mcrs = source.resolve(child.get('K')) as PdfValue[];
    const mcr = dictionary(source.resolve(mcrs[0]));
    const stream = source.resolve(mcr.get('Stm')) as PdfStream;
    expect(source.resolve(stream.dictionary.get('StructParents'))).toBe(index);
    expect((mcr.get('Pg') as PdfReference).key).toBe(merged.pages[index]!.reference.key);
  }
});

for (const location of ['link', 'page-open'])
for (const action of [
  '/S /JavaScript /JS (this.getField\\(field\\))',
  '/S /ResetForm /Fields [(field)]',
  '/S /SubmitForm /Fields [(field)] /F (https://example.org)',
  '/S /Hide /T (field)',
  '/S /ResetForm',
  '/S /ImportData /F (values.fdf)',
]) test(`form actions at ${location} are rejected before namespacing: ${action}`, () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 100 100] >>',
    `<< /Type /Page /Parent 2 0 R /Annots [6 0 R 7 0 R] /Contents 4 0 R ${location === 'page-open' ? `/AA << /O << ${action} >> >>` : ''} >>`,
    pdfStream(''),
    '<< /Fields [6 0 R] >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (field) /V (before) /Rect [0 0 80 20] >>',
    `<< /Type /Annot /Subtype /Link /Rect [0 30 80 50] ${location === 'link' ? `/A << ${action} >>` : ''} >>`,
  ]));
  expect(() => mergePdfDocuments([{ document }])).toThrow('not supported');
});

for (const resourceName of ['Dest', 'StructParent', 'StructParents', 'A', 'D', 'S', 'Type', 'DA', 'T', 'Title'])
test(`resource name ${resourceName} is preserved as an ordinary XObject name`, () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 100 100] >>',
    `<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /XObject << /${resourceName} 5 0 R >> >> >>`,
    pdfStream(`/${resourceName} Do`),
    pdfStream('BT /F 12 Tf 5 20 Td (HELLO) Tj ET', '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << /Font << /F 6 0 R >> >>'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document }, { document }]));
  expect(texts(merged)).toEqual(['HELLO', 'HELLO']);
});

test('whole-object Form XObject tags retain Figure alternative text and parent references', () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 100 100] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /XObject << /X 7 0 R >> >> >>',
    pdfStream('/X Do'),
    '<< /Type /StructTreeRoot /K [6 0 R] /ParentTree << /Nums [0 6 0 R] >> >>',
    '<< /Type /StructElem /S /Figure /P 5 0 R /Pg 3 0 R /Alt (Important figure description) /K << /Type /OBJR /Obj 7 0 R /Pg 3 0 R >> >>',
    pdfStream('0 0 20 20 re f', '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /StructParent 0'),
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document }, { document }]));
  const source = merged.source, root = dictionary(source.resolve(source.catalog.get('StructTreeRoot')));
  const nums = dictionary(source.resolve(root.get('ParentTree'))).get('Nums') as PdfValue[];
  expect(nums.filter((_, index) => index % 2 === 0)).toEqual([0, 1]);
  for (const index of [0, 1]) {
    const figure = dictionary(source.resolve(nums[index * 2 + 1]));
    expect(bytesText((figure.get('Alt') as PdfString).bytes)).toBe('Important figure description');
    const objr = dictionary(source.resolve((figure.get('K') as PdfValue[])[0]));
    const stream = source.resolve(objr.get('Obj')) as PdfStream;
    expect(source.resolve(stream.dictionary.get('StructParent'))).toBe(index);
    expect((objr.get('Pg') as PdfReference).key).toBe(merged.pages[index]!.reference.key);
  }
});

for (const chainArray of [false, true])
test(`named destinations resolve in additional actions and retain ${chainArray ? 'array' : 'single'} action chains`, () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /Names << /Dests << /Names [(target) [3 0 R /Fit]] >> >> >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 100 100] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Annots [5 0 R] /AA << /O 6 0 R >> >>',
    pdfStream(''),
    '<< /Type /Annot /Subtype /Link /Rect [0 0 20 20] /A 6 0 R /AA << /U 6 0 R >> >>',
    `<< /S /GoTo /D (target) /Next ${chainArray ? '[7 0 R 8 0 R]' : '7 0 R'} >>`,
    '<< /S /URI /URI (https://example.org/) >>',
    '<< /S /GoTo /D (target) >>',
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document }, { document }]));
  const source = merged.source;
  for (const page of merged.pages) {
    const annotation = dictionary(source.resolve((page.dictionary.get('Annots') as PdfReference[])[0]));
    for (const value of [annotation.get('A'), dictionary(source.resolve(annotation.get('AA'))).get('U'), dictionary(source.resolve(page.dictionary.get('AA'))).get('O')]) {
      const action = dictionary(source.resolve(value));
      expect(((source.resolve(action.get('D')) as PdfValue[])[0] as PdfReference).key).toBe(page.reference.key);
      const chain = source.resolve(action.get('Next'));
      const uri = dictionary(source.resolve(Array.isArray(chain) ? chain[0] : chain));
      expect(bytesText((uri.get('URI') as PdfString).bytes)).toBe('https://example.org/');
      if (Array.isArray(chain)) {
        const go = dictionary(source.resolve(chain[1]));
        expect(((source.resolve(go.get('D')) as PdfValue[])[0] as PdfReference).key).toBe(page.reference.key);
      }
    }
  }
});

test('action chains prune omitted page destinations while keeping other actions', () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 100 100] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [6 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
    pdfStream(''),
    '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /GoTo /D [3 0 R /Fit] /Next [<< /S /GoTo /D [4 0 R /Fit] >> << /S /URI /URI (https://example.org/) >>] >> >>',
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document, pages: [0] }]));
  const source = merged.source;
  const annotation = dictionary(source.resolve((merged.pages[0]!.dictionary.get('Annots') as PdfReference[])[0]));
  const action = dictionary(source.resolve(annotation.get('A')));
  const next = source.resolve(action.get('Next'));
  const chain = Array.isArray(next) ? next : [next];
  expect(chain).toHaveLength(1);
  expect((dictionary(source.resolve(chain[0])).get('S') as PdfName).value).toBe('URI');
});

for (const chainArray of [false, true])
for (const rootOmitted of [false, true])
test(`bookmarks and annotation chains keep downstream actions after pruning (${chainArray}, ${rootOmitted})`, () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 100 100] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [7 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
    pdfStream(''),
    `<< /S /GoTo /D [${rootOmitted ? 4 : 3} 0 R /Fit] /Next ${chainArray ? '[10 0 R 12 0 R]' : '10 0 R'} >>`,
    '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A 6 0 R >>',
    '<< /Type /Outlines /First 9 0 R /Last 9 0 R >>',
    '<< /Title (Action chain) /Parent 8 0 R /A 6 0 R >>',
    '<< /S /GoTo /D [4 0 R /Fit] /Next 11 0 R >>',
    '<< /S /URI /URI (https://example.org/first) >>',
    '<< /S /URI /URI (https://example.org/second) >>',
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document, pages: [0] }]));
  const source = merged.source;
  const annotation = dictionary(source.resolve((merged.pages[0]!.dictionary.get('Annots') as PdfReference[])[0]));
  const outlineRoot = dictionary(source.resolve(source.catalog.get('Outlines')));
  const bookmark = dictionary(source.resolve(outlineRoot.get('First')));
  function executed(value: PdfValue | undefined): string[] {
    const action = source.resolve(value);
    if (action === null) return [];
    if (Array.isArray(action)) return action.flatMap(executed);
    const info = dictionary(action), kind = (info.get('S') as PdfName).value;
    if (kind === 'GoTo') expect(((source.resolve(info.get('D')) as PdfValue[])[0] as PdfReference).key).toBe(merged.pages[0]!.reference.key);
    return [kind === 'URI' ? bytesText((info.get('URI') as PdfString).bytes) : kind, ...executed(info.get('Next'))];
  }
  const expected = [...(rootOmitted ? [] : ['GoTo']), 'https://example.org/first', ...(chainArray ? ['https://example.org/second'] : [])];
  expect(executed(annotation.get('A'))).toEqual(expected);
  expect(executed(bookmark.get('A'))).toEqual(expected);
});

for (const indirect of [false, true])
for (const chainArray of [false, true])
for (const hasTail of [false, true])
test(`pushbutton actions promote surviving successors (${indirect}, ${chainArray}, ${hasTail})`, () => {
  const action = `<< /S /GoTo /D [4 0 R /Fit] ${hasTail ? `/Next ${chainArray ? '[8 0 R 9 0 R]' : '8 0 R'}` : ''} >>`;
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [6 0 R] >> >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 100 100] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [6 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
    pdfStream(''),
    `<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T (Button) /Rect [0 0 20 20] /P 3 0 R /A ${indirect ? '7 0 R' : action} >>`,
    action,
    '<< /S /URI /URI (https://example.org/first) >>',
    '<< /S /URI /URI (https://example.org/second) >>',
  ]));
  const merged = openPdfDocument(mergePdfDocuments([{ document, pages: [0] }]));
  const source = merged.source;
  const widget = dictionary(source.resolve((merged.pages[0]!.dictionary.get('Annots') as PdfReference[])[0]));
  if (!hasTail) { expect(widget.has('A')).toBe(false); return; }
  const first = dictionary(source.resolve(widget.get('A')));
  expect((first.get('S') as PdfName).value).toBe('URI');
  expect(bytesText((first.get('URI') as PdfString).bytes)).toBe('https://example.org/first');
  if (chainArray) {
    const second = dictionary(source.resolve(first.get('Next')));
    expect((second.get('S') as PdfName).value).toBe('URI');
    expect(bytesText((second.get('URI') as PdfString).bytes)).toBe('https://example.org/second');
  } else expect(first.has('Next')).toBe(false);
  const form = dictionary(source.resolve(source.catalog.get('AcroForm')));
  const namespace = dictionary(source.resolve((form.get('Fields') as PdfReference[])[0]));
  expect(((namespace.get('Kids') as PdfReference[])[0] as PdfReference).key).toBe(((merged.pages[0]!.dictionary.get('Annots') as PdfReference[])[0] as PdfReference).key);
});

function linkedDocument() {
  return openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /Names << /Dests << /Names [(target) [4 0 R /Fit]] >> >> >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 100 100] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [6 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
    pdfStream(''),
    '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /Dest [4 0 R /Fit] /A << /S /GoTo /D (target) /Next << /S /URI /URI (https://example.org/) >> >> /AA << /U << /S /GoTo /D (target) >> >> >>',
  ]));
}

test('destinations resolve against all output blocks, including reopened sources, interleaving and repeats', () => {
  const document = linkedDocument(), reopened = openPdfDocument(document.bytes()), other = text('OTHER');
  const cases = [
    { inputs: [{ document, pages: [0] }, { document: reopened, pages: [1] }], targets: [[0, 1]] },
    { inputs: [{ document, pages: [1] }, { document: other, pages: [0] }, { document: reopened, pages: [0] }], targets: [[2, 0]] },
    { inputs: [{ document, pages: [0, 0] }, { document: other, pages: [0] }, { document: reopened, pages: [1, 1] }], targets: [[0, 3], [1, 3]] },
    { inputs: [{ document }, { document: reopened }], targets: [[0, 1], [2, 3]] },
  ];
  for (const { inputs, targets } of cases) {
    const merged = openPdfDocument(mergePdfDocuments(inputs)), source = merged.source;
    for (const [from, to] of targets) {
      const annotation = dictionary(source.resolve((merged.pages[from!]!.dictionary.get('Annots') as PdfReference[])[0]));
      const action = dictionary(source.resolve(annotation.get('A')));
      const additional = dictionary(source.resolve(dictionary(source.resolve(annotation.get('AA'))).get('U')));
      for (const value of [annotation.get('Dest'), action.get('D'), additional.get('D')]) {
        const destination = source.resolve(value) as PdfValue[];
        expect((destination[0] as PdfReference).key).toBe(merged.pages[to!]!.reference.key);
      }
      expect((dictionary(source.resolve(action.get('Next'))).get('S') as PdfName).value).toBe('URI');
    }
  }
  const omitted = openPdfDocument(mergePdfDocuments([{ document, pages: [0] }]));
  const annotation = dictionary(omitted.source.resolve((omitted.pages[0]!.dictionary.get('Annots') as PdfReference[])[0]));
  expect(annotation.has('Dest')).toBe(false);
  expect((dictionary(omitted.source.resolve(annotation.get('A'))).get('S') as PdfName).value).toBe('URI');
});

for (const indirect of [false, true])
test(`AcroForm ProcSet arrays are retained and combined without name prefixes (${indirect})`, () => {
  function withProcSet(names: string) {
    return openPdfDocument(pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 100 100] >>',
      '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Annots [6 0 R] >>',
      pdfStream(''),
      `<< /Fields [6 0 R] /DR << /ProcSet ${indirect ? '8 0 R' : `[${names}]`} /Font << /F 7 0 R >> >> /DA (/F 12 Tf 0 g) >>`,
      '<< /Type /Annot /Subtype /Widget /FT /Tx /T (field) /V (value) /Rect [0 0 20 20] /P 3 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `[${names}]`,
    ]));
  }
  const first = withProcSet('/PDF /Text'), second = withProcSet('/Text /ImageC');
  for (const inputs of [[{ document: first }], [{ document: first }, { document: second }]]) {
    const merged = openPdfDocument(mergePdfDocuments(inputs)), source = merged.source;
    const form = dictionary(source.resolve(source.catalog.get('AcroForm')));
    const resources = dictionary(source.resolve(form.get('DR')));
    expect((source.resolve(resources.get('ProcSet')) as PdfName[]).map(name => name.value)).toEqual(inputs.length === 1 ? ['PDF', 'Text'] : ['PDF', 'Text', 'ImageC']);
    expect([...dictionary(source.resolve(resources.get('Font'))).keys()]).toEqual(inputs.length === 1 ? ['source1_F'] : ['source1_F', 'source2_F']);
    expect(form.get('Fields')).toHaveLength(inputs.length);
  }
});

for (const actions of [false, true])
test(`split selections retain each page bookmark once while keeping cross-block actions (${actions})`, () => {
  const document = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 100 100] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
    pdfStream(''),
    '<< /Type /Outlines /First 7 0 R /Last 8 0 R /Count 2 >>',
    `<< /Title (First) /Parent 6 0 R /Next 8 0 R ${actions ? '/A << /S /GoTo /D [3 0 R /Fit] /Next << /S /GoTo /D [4 0 R /Fit] >> >>' : '/Dest [3 0 R /Fit]'} >>`,
    `<< /Title (Second) /Parent 6 0 R /Prev 7 0 R ${actions ? '/A << /S /GoTo /D [4 0 R /Fit] /Next << /S /URI /URI (https://example.org/) >> >>' : '/Dest [4 0 R /Fit]'} >>`,
  ]));
  const plans = [
    { inputs: [{ document, pages: [0, 1] }], titles: ['First', 'Second'], targets: [0, 1] },
    { inputs: [{ document, pages: [0] }, { document, pages: [1] }], titles: ['First', 'Second'], targets: [0, 1] },
    { inputs: [{ document, pages: [1] }, { document, pages: [0] }], titles: ['Second', 'First'], targets: [0, 1] },
    { inputs: [{ document, pages: [0] }, { document: text('OTHER'), pages: [0] }, { document, pages: [1] }], titles: ['First', 'Second'], targets: [0, 2] },
  ];
  for (const plan of plans) {
    const merged = openPdfDocument(mergePdfDocuments(plan.inputs)), source = merged.source;
    const root = dictionary(source.resolve(source.catalog.get('Outlines')));
    const titles: string[] = [], targets: string[] = [];
    let next = root.get('First');
    while (next instanceof PdfReference) {
      const item = dictionary(source.resolve(next));
      titles.push(bytesText((item.get('Title') as PdfString).bytes));
      const action = actions ? dictionary(source.resolve(item.get('A'))) : undefined;
      const dest = source.resolve(actions ? action!.get('D') : item.get('Dest')) as PdfReference[];
      targets.push(dest[0]!.key);
      if (actions && titles.at(-1) === 'First') {
        const successor = dictionary(source.resolve(action!.get('Next')));
        const secondIndex = plan.inputs[0]!.pages![0] === 1 ? 0 : merged.pages.length - 1;
        expect(((source.resolve(successor.get('D')) as PdfReference[])[0] as PdfReference).key).toBe(merged.pages[secondIndex]!.reference.key);
      }
      next = item.get('Next');
    }
    expect(titles).toEqual(plan.titles);
    expect(targets).toEqual(plan.targets.map(index => merged.pages[index]!.reference.key));
  }
});
