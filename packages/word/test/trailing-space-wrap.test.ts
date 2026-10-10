import { expect, test } from 'bun:test';
import { layoutWordDocument, NativeWordDocument, openWordArtifact, type WordTextMeasurer } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const measurer: WordTextMeasurer = { measure: text => ({ width: text.length * 10, ascent: 8, descent: 2 }) };

function fixture(text: string | readonly string[], setting?: string, width = 50) {
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${word}"><w:body><w:p>${(typeof text === 'string' ? [text] : text).map(run => `<w:r><w:t xml:space="preserve">${run}</w:t></w:r>`).join('')}</w:p><w:sectPr><w:pgSz w:w="${(width + 40) * 20}" w:h="4000"/><w:pgMar w:top="400" w:bottom="400" w:left="400" w:right="400"/></w:sectPr></w:body></w:document>`,
    ...(setting === undefined ? {} : {
      relationships: [{ id: 'settings', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', target: 'settings.xml' }],
      parts: [{ itemName: 'word/settings.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml', xml: `<w:settings xmlns:w="${word}"><w:compat>${setting}</w:compat></w:settings>` }],
    }),
  }));
}

function lines(artifact: ReturnType<typeof fixture>) {
  return layoutWordDocument(artifact.document, measurer).pages.flatMap(page => page.columns.flatMap(column => column.lines));
}

function textOf(line: ReturnType<typeof lines>[number]) {
  return line.fragments.map(fragment => fragment.text).join('');
}

test('a space beyond the margin does not move a fitting word to the next line', () => {
  for (const width of [50, 59.95]) {
    const result = lines(fixture('AB CD E', undefined, width));
    expect(result.map(textOf)).toEqual(['AB CD', 'E']);
    expect(result.map(line => [line.startOffset, line.endOffset])).toEqual([[0, 6], [6, 7]]);
    expect(result[0]!.width).toBe(50);
    expect(result[1]!.x).toBe(20);
  }
});

test('unbounded trailing spaces retain offsets without adding lines or painted width', () => {
  const spaces = ' '.repeat(30);
  for (const suffix of ['', 'E']) {
    const result = lines(fixture(`AB CD${spaces}${suffix}`));
    expect(result.map(textOf)).toEqual(suffix ? ['AB CD', 'E'] : ['AB CD']);
    expect(result[0]!.endOffset).toBe(35);
    expect(result[0]!.fragments.at(-1)!.endOffset).toBe(5);
    expect(result.at(-1)!.endOffset).toBe(35 + suffix.length);
  }
});

test('a word that exceeds the available width still moves to the next line', () => {
  const result = lines(fixture('AB CDE F'));
  expect(result.map(textOf)).toEqual(['AB', 'CDE F']);
  expect(result.map(line => [line.startOffset, line.endOffset])).toEqual([[0, 3], [3, 8]]);
});

test('explicitly disabled wrapTrailSpaces keeps the default in package and native layout', () => {
  for (const value of ['0', 'false', 'off']) {
    const artifact = fixture('AB CD       E', `<w:wrapTrailSpaces w:val="${value}"/>`);
    expect(lines(artifact).map(textOf)).toEqual(['AB CD', 'E']);
    const native = new NativeWordDocument({ source: artifact });
    expect(native.layout(measurer).pages[0]!.columns[0]!.lines.map(textOf)).toEqual(['AB CD', 'E']);
  }
});

test('enabled wrapTrailSpaces wraps runs of spaces instead of hanging them', () => {
  for (const setting of ['<w:wrapTrailSpaces/>', '<w:wrapTrailSpaces w:val="1"/>', '<w:wrapTrailSpaces w:val="true"/>', '<w:wrapTrailSpaces w:val="on"/>']) {
    const artifact = fixture('AB          E', setting);
    const result = lines(artifact);
    expect(result.map(textOf)).toEqual(['AB', '', '  E']);
    expect(result.map(line => [line.startOffset, line.endOffset])).toEqual([[0, 5], [5, 10], [10, 13]]);
    const native = new NativeWordDocument({ source: artifact });
    expect(native.layout(measurer).pages[0]!.columns[0]!.lines.map(textOf)).toEqual(result.map(textOf));
  }
});


test('spaces split across runs remain attached to the preceding logical line', () => {
  const result = lines(fixture(['AB ', 'CD', '  ', ' ', 'E']));
  expect(result.map(textOf)).toEqual(['AB CD', 'E']);
  expect(result.map(line => [line.startOffset, line.endOffset])).toEqual([[0, 8], [8, 9]]);
});
