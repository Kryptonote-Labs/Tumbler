import { expect, test } from 'bun:test';
import { NativeWordDocument, canvasWordTextMeasurer, layoutWordDocument, openWordArtifact, wordFontKerning } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

function source(text: string, width: number, threshold = 24) {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:sz w:val="24"/><w:kern w:val="${threshold}"/></w:rPr>${text}</w:r></w:p><w:sectPr><w:pgSz w:w="${(width + 20) * 20}" w:h="4000"/><w:pgMar w:left="200" w:right="200" w:top="200" w:bottom="200"/></w:sectPr></w:body></w:document>` }));
}
const measurer = { measure(text: string, format: Parameters<typeof wordFontKerning>[0]) {
  const pairs = wordFontKerning(format) === 'normal' ? [...text.matchAll(/(?=AV|VA)/g)].length : 0;
  return { width: text.length * 10 - pairs * 2, ascent: 8, descent: 2 };
} };
for (const { threshold, expected } of [{ threshold: 24, expected: ['AVA'] }, { threshold: 26, expected: ['AV', 'A'] }, { threshold: 0, expected: ['AV', 'A'] }]) {
  test(`kerning threshold ${threshold} controls wrapping in package and native layout`, () => {
    const artifact = source('<w:t>AVA</w:t>', 26, threshold);
    for (const layout of [layoutWordDocument(artifact.document, measurer), new NativeWordDocument({ source: artifact }).layout(measurer)])
      expect(layout.pages[0]!.columns[0]!.lines.map(line => line.fragments.map(fragment => fragment.text).join(''))).toEqual(expected);
  });
}
test('a forced wrap discards kerning from the previous line', () => {
  const layout = layoutWordDocument(source('<w:t>AVAV</w:t>', 18).document, measurer);
  const lines = layout.pages[0]!.columns[0]!.lines;
  expect(lines.map(line => line.width)).toEqual([18, 18]);
  expect(lines.map(line => line.fragments[0]!.text)).toEqual(['AV', 'AV']);
});
test('kerning positions consecutive text nodes within one run', () => {
  const artifact = source('<w:t>A</w:t><w:t>V</w:t>', 18);
  for (const layout of [layoutWordDocument(artifact.document, measurer), new NativeWordDocument({ source: artifact }).layout(measurer)]) {
  const line = layout.pages[0]!.columns[0]!.lines[0]!;
  expect(line.width).toBe(18);
  expect(line.fragments.map(fragment => [fragment.text, fragment.x - line.x, fragment.width])).toEqual([['AV', 0, 18]]);
  }
});
test('canvas measurement caches kerning modes separately', () => {
  const context = { font: '', direction: 'ltr' as const, fontKerning: 'none' as 'none' | 'normal', measureText: () => ({ width: context.fontKerning === 'normal' ? 18 : 20 }) };
  const artifact = source('<w:t>AV</w:t>', 30);
  const format = artifact.document.styles.resolveStyledRun('Normal');
  const measure = canvasWordTextMeasurer(context);
  expect(measure.measure('AV', format).width).toBe(15);
  expect(measure.measure('AV', { ...format, kerningPoints: 1 }).width).toBe(13.5);
  expect(measure.measure('AV', { ...format, kerningPoints: 20 }).width).toBe(15);
});

test('overlapping ligatures use consistent whole-prefix advances', () => {
  const artifact = source('<w:t>ffi</w:t>', 12.2);
  const widths: Record<string, number> = { f: 4.44140625, i: 3.837890625, ff: 8.525390625, fi: 8.00390625, ffi: 12.36328125 };
  const measure = { measure(text: string) { return { width: widths[text] ?? text.length * 6, ascent: 8, descent: 2 }; } };
  for (const layout of [layoutWordDocument(artifact.document, measure), new NativeWordDocument({ source: artifact }).layout(measure)]) {
    const lines = layout.pages[0]!.columns[0]!.lines;
    expect(lines.map(line => line.fragments.map(fragment => fragment.text).join(''))).toEqual(['ff', 'i']);
    expect(lines.every(line => line.width <= 12.2)).toBe(true);
  }
});

test('compatible imported text nodes paint as one shaping span', () => {
  const artifact = source('<w:t>f</w:t><w:t>f</w:t><w:t>i</w:t>', 20);
  const widths: Record<string, number> = { f: 4.44140625, i: 3.837890625, ff: 8.525390625, ffi: 12.36328125 };
  const measure = { measure(text: string) { return { width: widths[text] ?? text.length * 6, ascent: 8, descent: 2 }; } };
  for (const layout of [layoutWordDocument(artifact.document, measure), new NativeWordDocument({ source: artifact }).layout(measure)]) {
    const line = layout.pages[0]!.columns[0]!.lines[0]!;
    expect(line.fragments).toHaveLength(1);
    expect(line.fragments[0]!.text).toBe('ffi');
    expect(line.fragments[0]!.width).toBeCloseTo(widths.ffi!);
  }
});

for (const alignment of ['right', 'center', 'decimal'] as const) test(`${alignment} tab lookahead uses shaped advances`, () => {
  const artifact = source('<w:tab/><w:t>AV</w:t>', 150);
  const original = artifact.document.source.source;
  const doc = openWordArtifact(buildWordDocumentFixture({ documentXml: original.replace('<w:p>', `<w:p><w:pPr><w:tabs><w:tab w:val="${alignment}" w:pos="2000"/></w:tabs></w:pPr>`) }));
  for (const layout of [layoutWordDocument(doc.document, measurer), new NativeWordDocument({ source: doc }).layout(measurer)]) {
    const line = layout.pages[0]!.columns[0]!.lines[0]!;
    const text = line.fragments.find(fragment => fragment.kind === 'text')!;
    const anchor = text.x - line.x + text.width * (alignment === 'center' ? 0.5 : 1);
    expect(anchor).toBeCloseTo(100);
  }
});
