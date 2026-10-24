import { expect, test } from 'bun:test';
import { createWordArtifact, layoutWordDocument, openWordArtifact } from '@tumblerjs/word';
import { buildWordDocumentFixture } from '../../word/test/document-fixture.ts';
import { wordDisplaySurfaces } from '../src/word-display-surfaces.ts';
import { wordDisplayInkSvg } from '../src/word-display-ink.ts';
import { wordDisplayColour } from '../src/word-display-colour.ts';
import { wordTextCss } from '../src/word-font-metrics.ts';

const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const paragraph = (text: string, shading: string) => `<w:p><w:pPr>${shading}</w:pPr><w:r><w:rPr><w:color w:val="FFFF00"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
function layout(body: string) {
  return layoutWordDocument(openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:body>${body}</w:body></w:document>` })).document, measure);
}

test('separate XML stories with matching paragraph IDs retain their own backgrounds', () => {
  const body = layout(paragraph('Body', '<w:shd w:fill="156082"/>')).pages[0]!.columns[0]!.lines[0]!;
  const header = layout(paragraph('Header', '')).pages[0]!.columns[0]!.lines[0]!;
  expect(body.paragraphElementId).toBe(header.paragraphElementId);
  const surfaces = wordDisplaySurfaces([body], [], '#ffffff');
  wordDisplaySurfaces([header], [], '#ffffff', surfaces);
  expect(surfaces.get(body)).toBe('#156082');
  expect(surfaces.get(header)).toBe('#ffffff');
  expect(wordTextCss(body.fragments[0]!.format, surfaces.get(body))).toContain(wordDisplayColour('#FFFF00', '#156082'));
});

test('explicitly clear paragraph and nested cell shading reveal the ancestor cell', () => {
  const nested = `<w:tbl><w:tr><w:tc><w:tcPr><w:shd w:val="nil"/></w:tcPr>${paragraph('Nested', '<w:shd w:val="nil"/>')}</w:tc></w:tr></w:tbl>`;
  const page = layout(`<w:tbl><w:tr><w:tc><w:tcPr><w:shd w:fill="156082"/></w:tcPr>${paragraph('Outer', '<w:shd w:val="nil"/>')}${nested}</w:tc></w:tr></w:tbl>`).pages[0]!;
  const surfaces = wordDisplaySurfaces([], page.columns[0]!.tables, '#ffffff');
  expect(surfaces.size).toBeGreaterThanOrEqual(2);
  for (const [line, surface] of surfaces) {
    expect(surface).toBe('#156082');
    for (const run of line.fragments) expect(wordTextCss(run.format, surface)).toContain(wordDisplayColour('#FFFF00', '#156082'));
  }
});

test('vector ink uses the original visible background without changing source bytes', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', ink: { points: [[0, 0, 0.5], [20, 10, 0.5]], width: 20, height: 10, color: '#ffff00', size: 2 } }] }] });
  const drawing = [...source.document.drawings.values()][0]!;
  const bytes = source.bytes();
  const svg = wordDisplayInkSvg(drawing, '#000000');
  expect(svg).toContain('light-dark(#ffff00,#7a7a32)');
  expect(wordDisplayInkSvg(drawing, '#ffffff')).not.toBe(svg);
  expect(source.bytes()).toEqual(bytes);
});
