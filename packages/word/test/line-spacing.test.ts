import { expect, test } from 'bun:test';
import { layoutWordDocument, openWordArtifact, type WordTextMeasurer } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
// Liberation Serif metrics and advances recorded with LibreOffice 25.2 at 96 DPI.
const cases = [
  { size: 11, ascent: 10.25, descent: 2.4, single: 12.65, multiple: 14.5 },
  { size: 18, ascent: 16.8, descent: 3.9, single: 20.7, multiple: 23.8 },
  { size: 24, ascent: 22.4, descent: 5.2, single: 27.6, multiple: 31.7 },
];

function document(size: number, spacing: number, count = 3, pageHeight = 16838) {
  const properties = `<w:rFonts w:ascii="Liberation Serif"/><w:sz w:val="${size * 2}"/>`;
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${word}"><w:body>
    ${Array.from({ length: count }, (_, i) => `<w:p><w:pPr><w:spacing w:line="${spacing}" w:lineRule="auto"/><w:rPr>${properties}</w:rPr></w:pPr>${i === 1 ? '' : `<w:r><w:rPr>${properties}</w:rPr><w:t>Line ${i}</w:t></w:r>`}</w:p>`).join('')}
    <w:sectPr><w:pgSz w:w="11906" w:h="${pageHeight}"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr>
  </w:body></w:document>` })).document;
}

for (const metrics of cases) {
  const measurer: WordTextMeasurer = { measure: (text) => ({ width: text.length * 5, ascent: metrics.ascent, descent: metrics.descent }) };
  test(`${metrics.size} pt automatic spacing preserves the first baseline and advances through blank paragraphs`, () => {
    for (const [spacing, advance] of [[240, metrics.single], [276, metrics.multiple], [480, metrics.single * 2]] as const) {
      const lines = layoutWordDocument(document(metrics.size, spacing), measurer).pages[0]!.columns[0]!.lines;
      expect(lines).toHaveLength(3);
      expect(lines[1]!.fragments).toHaveLength(0);
      lines.forEach((line, i) => {
        expect(line.height).toBeCloseTo(advance, 8);
        expect(line.baseline).toBeCloseTo(72 + metrics.ascent + i * advance, 8);
      });
    }
  });
}

test('twip-rounded spacing lets the last line fit at the bottom margin', () => {
  const measurer: WordTextMeasurer = { measure: () => ({ width: 5, ascent: 10.25, descent: 2.4 }) };
  // 30 lines at 14.5 pt exactly fill 435 pt between the margins.
  const layout = layoutWordDocument(document(11, 276, 30, (72 * 2 + 435) * 20), measurer);
  expect(layout.pages).toHaveLength(1);
  expect(layout.pages[0]!.columns[0]!.lines).toHaveLength(30);
});
