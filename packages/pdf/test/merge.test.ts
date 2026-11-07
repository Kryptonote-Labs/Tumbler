import { expect, test } from 'bun:test';
import { mergePdfPages, selectPdfPages, openPdfDocument, PdfInterpreter, PdfReference, PdfStream, PdfString } from '../src/index.ts';
import { dictionary } from '../src/objects.ts';
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
  expect(outlines.get('Count')).toBe(2);
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
