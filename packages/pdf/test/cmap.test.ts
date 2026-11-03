import { expect, test } from 'bun:test';
import { openPdfDocument, PdfInterpreter, pdfTextContent } from '../src/index.ts';
import { PdfCMap } from '../src/cmap.ts';
import { PdfSyntax } from '../src/syntax.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';

const bytes = (value: string) => new TextEncoder().encode(value);

function mappedDocument(metadata: string, mappings: string) {
  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin begincmap
${metadata}
/CMapName /Test def /CMapType 2 def
1 begincodespacerange <00> <ff> endcodespacerange
${mappings}
endcmap CMapName currentdict /CMap defineresource pop end end`;
  return openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>',
      pdfStream('BT /F 14 Tf 24 110 Td (ABC) Tj ET'),
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 6 0 R >>',
      pdfStream(cmap),
    ]),
  );
}

for (const metadata of [
  '/CIDSystemInfo << /Registry (Test) /Ordering (UCS) /Supplement 0 >>def',
  '/CIDSystemInfo 3 dict dup begin /Registry (Test) def /Ordering (UCS) def /Supplement 0 def end def',
  '/CIDSystemInfo << /Registry (Test) def /Ordering (UCS) def /Supplement 0 def >> def',
]) {
  test(`page text survives CMap metadata: ${metadata}`, () => {
    const document = mappedDocument(
      metadata,
      '3 beginbfchar <41> <0041> <42> <00660069> <43> <d83dde00> endbfchar',
    );
    const scene = new PdfInterpreter(document).page(0);
    expect(scene.text).toBe('Afi😀');
    expect(
      pdfTextContent(scene)
        .items.map((item) => item.text)
        .join(''),
    ).toBe('Afi😀');
    expect(scene.elements.filter((element) => element.kind === 'glyph')).toHaveLength(3);
  });
}

test('unused surrogate ranges do not prevent page rendering or valid Unicode extraction', () => {
  const document = mappedDocument(
    '/CIDSystemInfo << /Registry (Test) def >> def',
    `
1 beginbfrange <00> <02> <d800> endbfrange
3 beginbfchar <41> <0041> <42> <0042> <43> <0043> endbfchar`,
  );
  expect(new PdfInterpreter(document).page(0).text).toBe('ABC');
  const cmap = new PdfCMap(bytes('2 beginbfchar <41> <d800> <42> <dc00> endbfchar'));
  expect([...cmap.unicode.values()]).toEqual(['�', '�']);
});

test('CMap dictionary metadata does not introduce mappings or confuse strings with delimiters', () => {
  const cmap = new PdfCMap(
    bytes(`<< /Nested << /Label (>> def) /Data <3e3e> >>
1 beginbfchar <41> <0058> endbfchar >>
1 beginbfchar <41> <0041> endbfchar`),
  );
  expect([...cmap.unicode.values()]).toEqual(['A']);
});

test('recovery stays inside CMaps and retains malformed structure checks', () => {
  expect(() => new PdfSyntax(bytes('<< /Registry (Test) def >>')).value()).toThrow();
  expect(() => new PdfCMap(bytes('<< /Registry (Test)'))).toThrow('Unterminated CMap dictionary');
  expect(() => new PdfCMap(bytes('>>'))).toThrow('Unbalanced CMap dictionary');
  expect(() => new PdfCMap(bytes('1 beginbfchar <41> <00> endbfchar'))).toThrow(
    'complete UTF-16BE',
  );
});
