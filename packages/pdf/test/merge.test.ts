import { expect, test } from 'bun:test';
import { mergePdfPages, selectPdfPages, openPdfDocument, PdfInterpreter, PdfName, PdfReference, PdfStream, PdfString, type PdfValue } from '../src/index.ts';
import { dictionary } from '../src/objects.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';
import { mergeFixture } from './merge-fixtures.ts';
import { extractionFixture } from './extraction-fixture.ts';

const a = openPdfDocument(mergeFixture('Alpha')), b = openPdfDocument(mergeFixture('Beta', 1));

test('merge keeps selected page order, streams, geometry and isolated resource identities', () => {
  const output = openPdfDocument(mergePdfPages([{ document: a, pages: [1, 0] }, { document: b }, { document: a, pages: [1] }]));
  const originals = [a.pages[1]!, a.pages[0]!, b.pages[0]!, b.pages[1]!, a.pages[1]!];
  const owners = [a, a, b, b, a];
  expect(output.pages).toHaveLength(5);
  output.pages.forEach((page, index) => {
    const original = originals[index]!, owner = owners[index]!;
    expect(output.contents(page)).toEqual(owner.contents(original));
    expect([page.mediaBox, page.cropBox, page.rotation, page.userUnit]).toEqual([original.mediaBox, original.cropBox, original.rotation, original.userUnit]);
    const fonts = dictionary(output.source.resolve(page.resources.get('Font')));
    const originalFonts = dictionary(owner.source.resolve(original.resources.get('Font')));
    expect(dictionary(output.source.resolve(fonts.get('F'))).get('BaseFont')).toEqual(dictionary(owner.source.resolve(originalFonts.get('F'))).get('BaseFont'));
    for (const category of ['XObject', 'ExtGState']) {
      expect(dictionary(output.source.resolve(page.resources.get(category))).size).toBe(dictionary(owner.source.resolve(original.resources.get(category))).size);
    }
  });
  expect(output.source.revisions).toHaveLength(1);
  expect(a.bytes()).toEqual(mergeFixture('Alpha'));
});

test('forms, links, tags, layers and bookmarks retain their owners across sources', () => {
  const output = openPdfDocument(mergePdfPages([{ document: a }, { document: b }]));
  const resolve = (value: Parameters<typeof output.source.resolve>[0]) => output.source.resolve(value);
  const form = dictionary(resolve(output.source.catalog.get('AcroForm')));
  const fields = resolve(form.get('Fields')) as PdfReference[];
  expect(fields).toHaveLength(2);
  const fieldNames: string[] = [];
  fields.forEach((wrapper, index) => {
    const group = dictionary(resolve(wrapper));
    const children = resolve(group.get('Kids')) as PdfReference[];
    const field = dictionary(resolve(children[0]));
    fieldNames.push(new TextDecoder().decode((group.get('T') as PdfString).bytes));
    expect(field.get('Parent')).toEqual(wrapper);
    expect(new TextDecoder().decode((field.get('V') as PdfString).bytes)).toBe(index ? 'Beta value' : 'Alpha value');
    expect(new TextDecoder().decode((field.get('DA') as PdfString).bytes)).toContain(`/M${index}_F`);
    expect(dictionary(resolve(dictionary(resolve(form.get('DR'))).get('Font'))).has(`M${index}_F`)).toBe(true);
  });
  expect(new Set(fieldNames).size).toBe(2);
  for (const index of [0, 2]) {
    const annots = resolve(output.pages[index]!.dictionary.get('Annots')) as PdfReference[];
    const dest = resolve(dictionary(resolve(annots[1])).get('Dest')) as PdfReference[];
    expect(dest[0]).toEqual(output.pages[index + 1]!.reference);
  }
  expect(output.pages.map((p) => p.dictionary.get('StructParents'))).toEqual([0, undefined, 1, undefined]);
  const tags = dictionary(resolve(output.source.catalog.get('StructTreeRoot')));
  const nums = resolve(dictionary(resolve(tags.get('ParentTree'))).get('Nums')) as unknown[];
  expect([nums[0], nums[2]]).toEqual([0, 1]);
  const children = resolve(tags.get('K')) as PdfReference[];
  expect(children).toHaveLength(2);
  for (const child of children) expect(dictionary(resolve(child)).get('P')).toEqual(output.source.catalog.get('StructTreeRoot'));
  const layers = dictionary(resolve(output.source.catalog.get('OCProperties')));
  expect(resolve(layers.get('OCGs'))).toHaveLength(2);
  expect(resolve(dictionary(resolve(layers.get('D'))).get('OFF'))).toHaveLength(2);
  const outlines = dictionary(resolve(output.source.catalog.get('Outlines')));
  expect(outlines.get('Count')).toBe(4);
});

test('repeated pages have distinct widget identities and omitted link targets are removed', () => {
  const output = openPdfDocument(mergePdfPages([{ document: a, pages: [0, 0] }]));
  expect(output.pages).toHaveLength(2);
  const annots = output.pages.map((p) => output.source.resolve(p.dictionary.get('Annots')) as PdfReference[]);
  expect(annots[0]![0]).not.toEqual(annots[1]![0]);
  for (const refs of annots) expect(dictionary(output.source.resolve(refs[1])).has('Dest')).toBe(false);
});

test('embedded TrueType programs and Unicode mappings survive merge', async () => {
  const input = openPdfDocument(await extractionFixture('é'));
  const output = openPdfDocument(mergePdfPages([{ document: input }, { document: input }]));
  expect(new PdfInterpreter(output).page(0).text).toBe('é');
  expect(new PdfInterpreter(output).page(1).text).toBe('é');
  for (const page of output.pages) {
    const font = dictionary(output.source.resolve(dictionary(output.source.resolve(page.resources.get('Font'))).get('F')));
    const descriptor = dictionary(output.source.resolve(font.get('FontDescriptor')));
    expect(output.source.resolve(descriptor.get('FontFile2'))).toBeInstanceOf(PdfStream);
  }
});

test('selection grammar supports ranges, reverse order and duplicates with bounded validation', () => {
  expect(selectPdfPages(' 3, 2-1, 3 ', 3)).toEqual([2, 1, 0, 2]);
  for (const value of ['', '0', '-1', '1.5', '4', '1,,2', 'all', '1-9999999999999999999'])
    expect(() => selectPdfPages(value, 3)).toThrow();
  for (const pages of [[], [-1], [2], [0.5], [NaN]]) expect(() => mergePdfPages([{ document: a, pages }])).toThrow();
  expect(() => mergePdfPages([])).toThrow();
});

test('links resolve across repeated and interleaved source selections to the first target occurrence', () => {
  for (const parts of [[{ document: a, pages: [0, 0, 1] }], [{ document: a, pages: [0] }, { document: b }, { document: a, pages: [1] }]]) {
    const output = openPdfDocument(mergePdfPages(parts));
    const expected = output.pages.at(-1)!.reference;
    for (const page of output.pages.filter((page) => output.source.resolve(page.dictionary.get('Annots')) !== null)) {
      const annots = output.source.resolve(page.dictionary.get('Annots'));
      if (!Array.isArray(annots)) continue;
      const link = dictionary(output.source.resolve(annots[1]));
      const dest = output.source.resolve(link.get('Dest'));
      if (page === output.pages[0] || parts.length === 1) expect((dest as PdfReference[])[0]).toEqual(expected);
    }
  }
});

test('form resource ProcSet arrays remain valid when form defaults are combined', () => {
  const output = openPdfDocument(mergePdfPages([{ document: openPdfDocument(pdfFixture([
 '<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>',
 '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Annots [6 0 R] /Contents 4 0 R /Resources << >> >>',
 pdfStream(''),
 '<< /Fields [6 0 R] /DR << /ProcSet [/PDF /Text] /Font << /Helv 7 0 R >> >> /DA (/Helv 16 Tf 0 g) /NeedAppearances true >>',
 '<< /Type /Annot /Subtype /Widget /FT /Tx /T (test) /V (Hello) /Rect [20 20 180 70] /P 3 0 R >>',
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
])) }]));
  const form = dictionary(output.source.resolve(output.source.catalog.get('AcroForm')));
  const dr = dictionary(output.source.resolve(form.get('DR')));
  expect(dr.get('ProcSet')).toHaveLength(2);
});

test('tagged Form XObjects keep distinct reverse parent lookups', () => {
  const source = openPdfDocument(pdfFixture([
 '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked true >> >>',
 '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /Fm 5 0 R >> >> /Contents 4 0 R >>',
 pdfStream('/Fm Do'),
 pdfStream('/P << /MCID 0 >> BDC 10 10 80 80 re f EMC','/Type /XObject /Subtype /Form /BBox [0 0 100 100] /StructParents 7 /Resources << >>'),
 '<< /Type /StructTreeRoot /K [7 0 R] /ParentTree << /Nums [7 [7 0 R]] >> /ParentTreeNextKey 8 >>',
 '<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K << /Type /MCR /Pg 3 0 R /Stm 5 0 R /MCID 0 >> /Alt (Accessible box) >>'
]));
  const output = openPdfDocument(mergePdfPages([{ document: source }, { document: source }]));
  const keys = output.pages.map((page) => {
    const form = output.source.resolve(dictionary(output.source.resolve(page.resources.get('XObject'))).get('Fm')) as PdfStream;
    return form.dictionary.get('StructParents');
  });
  expect(keys).toEqual([7, 15]);
  const root = dictionary(output.source.resolve(output.source.catalog.get('StructTreeRoot')));
  const nums = dictionary(output.source.resolve(root.get('ParentTree'))).get('Nums') as PdfValue[];
  expect([nums[0], nums[2]]).toEqual(keys);
  expect(nums[1]).toHaveLength(1); expect(nums[3]).toHaveLength(1);
});

test('equivalent indirect accessibility class attributes merge while actual conflicts fail', () => {
  const make = (placement: string) => openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R /StructParents 0 >>',
    pdfStream('/P << /MCID 0 >> BDC 10 10 80 80 re f EMC'),
    '<< /Type /StructTreeRoot /K [6 0 R] /ParentTree << /Nums [0 [6 0 R]] >> /ClassMap << /Box 7 0 R >> >>',
    '<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 /C /Box >>',
    `<< /O /Layout /Placement /${placement} >>`,
  ]));
  const document = make('Block');
  expect(openPdfDocument(mergePdfPages([{ document }, { document }])).pages).toHaveLength(2);
  expect(() => mergePdfPages([{ document }, { document: make('Inline') }])).toThrow('Conflicting PDF accessibility ClassMap');
});

test('named link destinations and GoTo actions resolve across separately opened source parts', () => {
  const bytes = pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /Names << /Dests << /Names [(target) [4 0 R /XYZ null 30 0]] >> >> >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 100 100] /Resources << >> >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [7 0 R 8 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>',
    pdfStream(''), pdfStream(''),
    '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /Dest (target) >>',
    '<< /Type /Annot /Subtype /Link /Rect [10 0 20 10] /A << /S /GoTo /D (target) >> >>',
  ]);
  const output = openPdfDocument(mergePdfPages([{ document: openPdfDocument(bytes), pages: [0] }, { document: openPdfDocument(bytes), pages: [1, 1] }]));
  const annotations = output.source.resolve(output.pages[0]!.dictionary.get('Annots')) as PdfReference[];
  const direct = dictionary(output.source.resolve(annotations[0])).get('Dest') as PdfValue[];
  const action = dictionary(output.source.resolve(dictionary(output.source.resolve(annotations[1])).get('A')));
  expect(direct).toEqual([output.pages[1]!.reference, new PdfName('XYZ'), null, 30, 0]);
  expect(action.get('D')).toEqual(direct);
});

test('restored links across source occurrences cannot shift another source accessibility keys', () => {
  const source = openPdfDocument(Uint8Array.from(Buffer.from(Buffer.from(mergeFixture('Alpha')).toString('latin1').replace('/Dest [4 0 R', '/Dest [3 0 R'), 'latin1')));
  const output = openPdfDocument(mergePdfPages([{ document: source }, { document: source }]));
  expect(output.pages.map((page) => page.dictionary.get('StructParents'))).toEqual([0, undefined, 1, undefined]);
  const tags = dictionary(output.source.resolve(output.source.catalog.get('StructTreeRoot')));
  const nums = dictionary(output.source.resolve(tags.get('ParentTree'))).get('Nums') as PdfValue[];
  expect([nums[0], nums[2]]).toEqual([0, 1]);
});

test('indirect integer structure-parent keys are remapped per source', () => {
  const source = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /MediaBox [0 0 100 100] /Resources << >> >>',
    '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /StructParents 7 0 R >>',
    pdfStream('/P << /MCID 0 >> BDC 10 10 20 20 re f EMC'),
    '<< /Type /StructTreeRoot /K [6 0 R] /ParentTree << /Nums [0 [6 0 R]] >> >>',
    '<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>',
    '0',
  ]));
  const output = openPdfDocument(mergePdfPages([{ document: source }, { document: source }]));
  expect(output.pages.map((page) => output.source.resolve(page.dictionary.get('StructParents')))).toEqual([0, 1]);
});
