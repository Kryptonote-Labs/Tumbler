import { expect, test } from 'bun:test';
import { OOXML_NAMESPACES } from '@tumblerjs/ooxml';
import { NativeWordDocument, isWordDocumentSettings, createWordArtifact, layoutWordDocument, openWordArtifact } from '../src/index.ts';
import { openWordOperationDocument } from '../src/operations/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
const numbers = (layout: ReturnType<typeof layoutWordDocument>) => layout.pages.map(page => page.columns.flatMap(column => column.lines.map(line => line.lineNumber?.text)));

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance} section line numbers import, render and round-trip`, () => {
    const ns = OOXML_NAMESPACES[conformance].wordprocessing;
    const source = openWordArtifact(buildWordDocumentFixture({ conformance,
      documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>First</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p><w:p><w:r><w:t>Third</w:t></w:r></w:p><w:sectPr><w:lnNumType w:countBy="2" w:start="1" w:distance="200" w:restart="continuous"/></w:sectPr></w:body></w:document>`,
    }));
    const layout = layoutWordDocument(source.document, measure);
    expect(numbers(layout)).toEqual([['2', undefined, '4']]);
    const marker = layout.pages[0]!.columns[0]!.lines[0]!.lineNumber!;
    expect(marker.x + marker.width).toBe(layout.pages[0]!.columns[0]!.x - 10);
    const native = new NativeWordDocument({ source });
    expect(numbers(native.layout(measure))).toEqual(numbers(layout));
    expect(numbers(layoutWordDocument(native.artifact().document, measure))).toEqual(numbers(layout));
  });
}

test('restart modes count in reading order across pages and sections', () => {
  const source = createWordArtifact({ paragraphs: [
    { runs: [{ text: 'One' }], section: { format: { breakType: 'nextPage', lineNumbers: { countBy: 1, start: 3, restart: 'newSection' } } } },
    { runs: [{ text: 'Two' }, { text: '\u2028', breakType: 'page' }, { text: 'Three' }] },
  ] });
  const native = new NativeWordDocument({ source });
  native.updateSettings({ finalSection: { breakType: 'nextPage', lineNumbers: { countBy: 1, start: 10, restart: 'continuous' } } });
  expect(numbers(native.layout(measure))).toEqual([['3'], ['4'], ['5']]);
  native.updateSettings({ finalSection: { breakType: 'nextPage', lineNumbers: { countBy: 1, start: 10, restart: 'newPage' } } });
  expect(numbers(native.layout(measure))).toEqual([['3'], ['10'], ['10']]);
  native.updateSettings({ finalSection: { breakType: 'nextPage', lineNumbers: { countBy: 1, start: 10, restart: 'newSection' } } });
  expect(numbers(native.layout(measure))).toEqual([['3'], ['10'], ['11']]);
});

test('suppressed paragraphs are removed from the count and tables count once', () => {
  const source = createWordArtifact({ blocks: [
    { kind: 'paragraph', runs: [{ text: 'One' }] },
    { kind: 'paragraph', runs: [{ text: 'Suppressed' }], paragraph: { suppressLineNumbers: true } },
    { kind: 'table', rows: [[{ blocks: [{ kind: 'paragraph', runs: [{ text: 'Inside table' }] }] }]] },
    { kind: 'paragraph', runs: [{ text: 'Three' }] },
  ] });
  const native = new NativeWordDocument({ source });
  native.updateSettings({ finalSection: { lineNumbers: { countBy: 1, start: 1, restart: 'continuous' } } });
  const layout = native.layout(measure);
  expect(numbers(layout)).toEqual([['1', undefined, '3']]);
  expect(layout.pages[0]!.columns[0]!.tables[0]!.cells[0]!.lines.every(line => !line.lineNumber)).toBe(true);
  expect(numbers(layoutWordDocument(native.artifact().document, measure))).toEqual(numbers(layout));
});

test('section operations author, disable and undo numbering without changing text', () => {
  const session = openWordOperationDocument(createWordArtifact({ paragraphs: [{ runs: [{ text: 'First' }] }, { runs: [{ text: 'Second' }] }] }));
  const history = session.history();
  const selection = { story: 'body', range: { start: 0, end: 0 } };
  session.commit(session.prepareOperation(selection, { name: 'section-layout', input: { scope: 'section', format: { lineNumbers: { countBy: 1, start: 1, restart: 'continuous' } } } }), history.origin);
  expect(numbers(layoutWordDocument(session.artifact().document, measure))).toEqual([['1', '2']]);
  session.commit(session.prepareOperation(selection, { name: 'section-layout', input: { scope: 'section', format: { lineNumbers: null } } }), history.origin);
  expect(numbers(layoutWordDocument(session.artifact().document, measure))).toEqual([[undefined, undefined]]);
  history.undo();
  expect(numbers(layoutWordDocument(session.artifact().document, measure))).toEqual([['1', '2']]);
  expect(session.text.toString()).toBe('First\nSecond\n');
  history.destroy(); session.destroy();
});

test('numbering continues through multiple columns and progressive layout agrees with final layout', () => {
  const source = createWordArtifact({ paragraphs: Array.from({ length: 10 }, (_, i) => ({ runs: [{ text: `Line ${i + 1}` }] })) });
  const native = new NativeWordDocument({ source });
  native.updateSettings({ finalSection: { columnCount: 2, lineNumbers: { countBy: 1, start: 1, restart: 'newPage' } } });
  const final = native.layout(measure);
  expect(numbers(final)).toEqual([Array.from({ length: 10 }, (_, i) => String(i + 1))]);
  const iterator = native.layoutProgressively(measure);
  let result = iterator.next();
  while (!result.done) result = iterator.next();
  expect(numbers(result.value)).toEqual(numbers(final));
});


test('Word stores the number of skipped lines while the API uses the displayed start', () => {
  const ns = OOXML_NAMESPACES.transitional.wordprocessing;
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p><w:sectPr><w:lnNumType w:countBy="1" w:start="0"/></w:sectPr></w:body></w:document>` }));
  expect(numbers(layoutWordDocument(source.document, measure))).toEqual([['1']]);
  const native = new NativeWordDocument({ source });
  native.updateSettings({ finalSection: { lineNumbers: { countBy: 1, start: 1, restart: 'newPage' } } });
  expect(native.artifact().document.source.source).toContain('w:start="0"');
});

test('schema defaults survive JSON settings input and DOCX export', () => {
  const native = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text: 'Text' }] }] });
  const settings: unknown = JSON.parse('{"finalSection":{"lineNumbers":{"countBy":1}}}');
  if (!isWordDocumentSettings(settings)) throw new Error('Expected valid settings');
  native.updateSettings(settings);
  expect(numbers(layoutWordDocument(native.artifact().document, measure))).toEqual([['1']]);
});

test('line-number measurements respect preparation limits and validate geometry', () => {
  const native = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text: 'x' }] }] });
  native.updateSettings({ finalSection: { lineNumbers: { countBy: 1, start: 1, restart: 'newPage' } } });
  expect(() => native.layout(measure, { maxMeasurements: 2 })).toThrow('measurements');
  expect(() => native.layout({ measure: text => ({ width: text === '1' ? NaN : 6, ascent: 9, descent: 3 }) })).toThrow('finite non-negative geometry');
});
