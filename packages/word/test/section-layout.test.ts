import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { OOXML_NAMESPACES } from '@tumblerjs/ooxml';
import { NativeWordDocument, createWordArtifact, importWordContent, layoutWordDocument, openWordArtifact, wordSections } from '../src/index.ts';
import { openWordOperationDocument, inspectWordSections } from '../src/operations/index.ts';
import { readWordDocumentSettings, wordSharedText } from '../src/collaboration/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
const at = (start: number) => ({ story: 'body', range: { start, end: start } });
const paragraph = (text: string) => ({ runs: [{ text }] });

test('page setup updates native layout and DOCX export while preserving other margins', () => {
  const source = createWordArtifact({ paragraphs: [paragraph('Text')] });
  const native = new NativeWordDocument({ source });
  native.updateSettings({ finalSection: { pageWidthTwips: 16838, pageHeightTwips: 11906, orientation: 'landscape', marginLeftTwips: 720 } });
  const layout = native.layout(measure);
  expect(layout.pages[0]!.width).toBe(841.9);
  expect(layout.pages[0]!.section.marginRightTwips).toBe(1440);
  const exported = native.artifact();
  expect(exported.document.finalSection).toMatchObject({ orientation: 'landscape', marginLeftTwips: 720, marginRightTwips: 1440 });
  expect(layoutWordDocument(exported.document, measure).pages[0]!.width).toBe(layout.pages[0]!.width);
});

for (const type of ['continuous', 'nextPage', 'nextColumn', 'oddPage', 'evenPage'] as const) {
  test(`${type} section insertion retains text and section layout through export and undo`, () => {
    const source = createWordArtifact({ paragraphs: [paragraph('FirstSecond')] });
    const session = openWordOperationDocument(source);
    const history = session.history();
    session.commit(session.prepareOperation(at(5), { name: 'section-break', input: { type } }), history.origin);
    expect(session.text.toString()).toBe('First\nSecond\n');
    let exported = session.artifact();
    expect(wordSections(exported.document)).toHaveLength(2);
    expect(wordSections(exported.document)[1]!.breakType).toBe(type);
    session.commit(session.prepareOperation(at(0), { name: 'section-layout', input: { scope: 'section', format: { marginLeftTwips: 720 } } }), history.origin);
    exported = session.artifact();
    expect(wordSections(exported.document).map(section => section.marginLeftTwips)).toEqual([720, 1440]);
    history.undo();
    expect(wordSections(session.artifact().document)[0]!.marginLeftTwips).toBe(1440);
    history.undo();
    expect(session.text.toString()).toBe('FirstSecond\n');
    expect(wordSections(session.artifact().document)).toHaveLength(1);
    history.redo();
    expect(wordSections(session.artifact().document)).toHaveLength(2);
    history.destroy(); session.destroy();
  });
}

test('whole-document formatting updates every section without removing section boundaries', () => {
  const source = createWordArtifact({ paragraphs: [paragraph('FirstSecond')] });
  const session = openWordOperationDocument(source);
  session.commit(session.prepareOperation(at(5), { name: 'section-break', input: { type: 'nextPage' } }));
  session.commit(session.prepareOperation(at(0), { name: 'section-layout', input: { scope: 'document', format: { marginRightTwips: 800, columnCount: 2, columns: null } } }));
  expect(wordSections(session.artifact().document).map(s => [s.marginRightTwips, s.columnCount])).toEqual([[800, 2], [800, 2]]);
  session.destroy();
});

test('deleting a section break joins text using the following section properties', () => {
  const source = createWordArtifact({ paragraphs: [paragraph('FirstSecond')] });
  const session = openWordOperationDocument(source);
  session.commit(session.prepareOperation(at(5), { name: 'section-break', input: { type: 'nextPage' } }));
  session.commit(session.prepareOperation(at(0), { name: 'section-layout', input: { scope: 'section', format: { marginLeftTwips: 720 } } }));
  session.commit(session.prepareOperation(at(5), { name: 'remove-section-break', input: {} }));
  expect(session.text.toString()).toBe('FirstSecond\n');
  expect(wordSections(session.artifact().document)).toHaveLength(1);
  expect(session.artifact().document.finalSection.marginLeftTwips).toBe(1440);
  session.destroy();
});

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance} unequal columns and opaque section properties survive editing`, () => {
    const ns = OOXML_NAMESPACES[conformance].wordprocessing;
    const source = openWordArtifact(buildWordDocumentFixture({ conformance, documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>First</w:t></w:r><w:pPr><w:sectPr><w:pgSz w:w="10000" w:h="14000"/><w:pgMar w:left="1000" w:right="1000"/><w:cols w:equalWidth="0" w:sep="1"><w:col w:w="2000" w:space="500"/><w:col w:w="5500"/></w:cols><w:docGrid w:linePitch="360"/></w:sectPr></w:pPr></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>` }));
    const session = openWordOperationDocument(source);
    session.commit(session.prepareOperation(at(0), { name: 'section-layout', input: { scope: 'section', format: { marginTopTwips: 1000 } } }));
    const artifact = session.artifact();
    expect(wordSections(artifact.document)[0]).toMatchObject({ marginTopTwips: 1000, columns: [{ widthTwips: 2000, spaceTwips: 500 }, { widthTwips: 5500, spaceTwips: 0 }], columnSeparator: true });
    expect(artifact.document.source.source).toContain('w:docGrid w:linePitch="360"');
    const layout = layoutWordDocument(artifact.document, measure);
    expect(layout.pages[0]!.columns.map(c => c.width)).toEqual([100, 275]);
    const native = new NativeWordDocument({ source: artifact, content: importWordContent(artifact) });
    expect(native.layout(measure).pages[0]!.columns.map(c => c.width)).toEqual([100, 275]);
    session.destroy();
  });
}

test('continuous section changes columns below a full-width heading on the same page', () => {
  const source = createWordArtifact({ paragraphs: [paragraph('HeadingBody text after the heading')] });
  const session = openWordOperationDocument(source);
  session.commit(session.prepareOperation(at(7), { name: 'section-break', input: { type: 'continuous' } }));
  session.commit(session.prepareOperation(at(8), { name: 'section-layout', input: { scope: 'section', format: { columnCount: 2, columns: null } } }));
  const layout = layoutWordDocument(session.artifact().document, measure);
  expect(layout.pages).toHaveLength(1);
  expect(layout.pages[0]!.columns).toHaveLength(3);
  expect(layout.pages[0]!.columns[1]!.y).toBeGreaterThan(layout.pages[0]!.columns[0]!.y);
  session.destroy();
});

test('concurrent changes to different final-section properties merge and invalid edits are isolated', () => {
  const source = createWordArtifact();
  const session = openWordOperationDocument(source);
  const remote = new Y.Doc();
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(session.text.doc!));
  const view = wordSharedText(remote.getText('body'));
  session.commit(session.prepareOperation(at(0), { name: 'section-layout', input: { scope: 'section', format: { marginLeftTwips: 700 } } }));
  view.commit(view.prepareOperation({ start: 0, end: 0 }, { name: 'section-layout', input: { scope: 'section', format: { marginRightTwips: 900 } } }, { source }));
  Y.applyUpdate(session.text.doc!, Y.encodeStateAsUpdate(remote));
  expect(session.artifact().document.finalSection).toMatchObject({ marginLeftTwips: 700, marginRightTwips: 900 });
  expect(() => session.prepareOperation(at(0), { name: 'section-layout', input: { scope: 'section', format: { marginLeftTwips: 20000 } } })).toThrow('no text area');
  expect(readWordDocumentSettings(session.text.doc!).finalSection?.marginLeftTwips).toBe(700);
  expect(inspectWordSections(wordSharedText(session.text).text, source)).toHaveLength(1);
  session.destroy(); remote.destroy();
});

test('the final columns balance through the pagination engine without splitting widow pairs', () => {
  const source = createWordArtifact({ paragraphs: Array.from({ length: 12 }, (_, i) => paragraph(`Line ${i + 1}`)) });
  const native = new NativeWordDocument({ source });
  native.updateSettings({ finalSection: { columnCount: 2 } });
  const layout = native.layout(measure);
  expect(layout.pages).toHaveLength(1);
  expect(layout.pages[0]!.columns.map(column => column.lines.length)).toEqual([6, 6]);
  const exported = native.artifact();
  expect(layoutWordDocument(exported.document, measure).pages[0]!.columns.map(column => column.lines.length)).toEqual([6, 6]);
});

test('paragraph continuations rewrap when flowing into narrower unequal columns', () => {
  const native = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text: 'abcdef '.repeat(100) }] }], page: { width: 400, height: 150, margin: 20 } });
  native.updateSettings({ finalSection: { columns: [{ widthTwips: 4000, spaceTwips: 400 }, { widthTwips: 1600, spaceTwips: 0 }] } });
  const layout = native.layout(measure);
  expect(layout.pages.some(page => page.columns[1]!.lines.length > 0)).toBe(true);
  for (const page of layout.pages) for (const column of page.columns)
    expect(column.lines.every(line => line.width <= column.width)).toBe(true);
  const lines = layout.pages.flatMap(page => page.columns.flatMap(column => column.lines));
  expect(lines.at(-1)!.endOffset).toBe('abcdef '.repeat(100).length);
});

test('two prepared settings updates cannot commit an invalid composed page box', () => {
  const source = createWordArtifact();
  const session = openWordOperationDocument(source);
  const left = session.prepareOperation(at(0), { name: 'section-layout', input: { scope: 'section', format: { marginLeftTwips: 6000 } } });
  const right = session.prepareOperation(at(0), { name: 'section-layout', input: { scope: 'section', format: { marginRightTwips: 6000 } } });
  session.commit(left);
  expect(() => session.commit(right)).toThrow('no text area');
  expect(session.artifact().document.finalSection).toMatchObject({ marginLeftTwips: 6000, marginRightTwips: 1440 });
  session.destroy();
});

test('matching multi-column continuous sections balance before the next section starts', () => {
  const paragraphs = Array.from({ length: 8 }, (_, i) => ({ ...paragraph(`Line ${i + 1}`), ...(i === 5 ? { section: { format: { columnCount: 2 } } } : {}) }));
  const native = new NativeWordDocument({ source: createWordArtifact({ paragraphs }) });
  native.updateSettings({ finalSection: { columnCount: 2, breakType: 'continuous' } });
  const layout = native.layout(measure);
  expect(layout.pages).toHaveLength(1);
  expect(layout.pages[0]!.columns.map(column => column.lines.length)).toEqual([3, 3, 1, 1]);
  expect(layout.pages[0]!.columns[2]!.y).toBeCloseTo(layout.pages[0]!.columns[0]!.y + 36, 0);
});

test('authored sections without a source template export the same resolved page defaults', () => {
  const native = new NativeWordDocument({ page: { width: 300, height: 500, margin: 20 }, content: [
    { kind: 'paragraph', runs: [{ text: 'First' }], section: { format: { columnCount: 2 } } },
    { kind: 'paragraph', runs: [{ text: 'Second' }] },
  ] });
  const layout = native.layout(measure);
  const artifact = native.artifact();
  expect(artifact.document.blocks[0]).toMatchObject({ section: { pageWidthTwips: 6000, marginLeftTwips: 400 } });
  expect(layoutWordDocument(artifact.document, measure).pages.map(page => page.width)).toEqual(layout.pages.map(page => page.width));
  native.updateSettings({ finalSection: { pageWidthTwips: 8000 } });
  expect(layoutWordDocument(native.artifact().document, measure).pages[0]!.width).toBe(native.layout(measure).pages[0]!.width);
});

test('adjacent column breaks retain their source offsets while reflowing unequal columns', () => {
  const native = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text: 'abc' }, { text: '\u2028', breakType: 'column' }, { text: '\u2028', breakType: 'column' }, { text: 'def' }] }], page: { width: 400, height: 200, margin: 20 } });
  native.updateSettings({ finalSection: { columns: [{ widthTwips: 4000, spaceTwips: 400 }, { widthTwips: 1600, spaceTwips: 0 }] } });
  const layout = native.layout(measure, { maxPages: 5 });
  const lines = layout.pages.flatMap(page => page.columns.flatMap(column => column.lines));
  expect(lines.flatMap(line => line.fragments.map(fragment => fragment.text)).join('')).toBe('abcdef');
  expect(lines.map(line => line.startOffset)).toEqual([0, 4, 5]);
});
