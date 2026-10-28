import { expect, test } from 'bun:test';
import { importWordContent, openWordArtifact, reconcileWordContent, createWordNativeArchive, openWordNativeArchive } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

test('reconciling source text leaves absent theme resources absent', () => {
  const source = openWordArtifact(buildWordDocumentFixture());
  const next = reconcileWordContent(source, importWordContent(source));
  expect(next.document.package.parts.map(part => part.name.value)).toEqual(source.document.package.parts.map(part => part.name.value));
});

test('authoring a theme reference materializes its theme in a source without one', () => {
  const source = openWordArtifact(buildWordDocumentFixture());
  const next = reconcileWordContent(source, [{ kind: 'paragraph', runs: [{ text: 'Themed', format: { color: { theme: 'accent1', fallback: '#156082' } } }] }]);
  expect(next.document.styles.themeColors?.color('accent1')).toBe('156082');
  expect(next.document.source.source).toContain('w:themeColor="accent1"');
});


test('retained theme references without a theme keep their fallback through neighbouring edits', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml:
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:color w:val="FF0000" w:themeColor="accent1"/></w:rPr><w:t>Retained</w:t></w:r></w:p><w:p><w:r><w:t>Tail</w:t></w:r></w:p></w:body></w:document>' }));
  const blocks = importWordContent(source).map(block => block.kind === 'paragraph'
    ? { ...block, runs: block.runs.map(run => ({ ...run, text: run.text.replace('Tail', 'Edited tail') })) } : block);
  const next = reconcileWordContent(source, blocks);
  expect(next.document.package.parts.map(part => part.name.value)).toEqual(source.document.package.parts.map(part => part.name.value));
  expect(next.document.styles.themeColors).toBeUndefined();
  expect(next.document.source.source).toContain('<w:color w:val="FF0000" w:themeColor="accent1"/>');
  expect(next.document.source.source).toContain('Edited tail');
});


test('unchanged colour declarations preserve opaque attributes through native reopen and neighbouring edits', () => {
  const colour = '<w:color w:val="FF0000" w:themeColor="accent1" x:keep="colour"/>';
  const shading = '<w:shd w:fill="00FF00" w:themeFill="accent2" x:keep="shade"/>';
  const original = openWordArtifact(buildWordDocumentFixture({ documentXml:
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="urn:opaque"><w:body><w:p><w:r><w:rPr>${colour}${shading}</w:rPr><w:t>Retained</w:t></w:r></w:p><w:p><w:r><w:t>Tail</w:t></w:r></w:p></w:body></w:document>` }));
  const restored = openWordNativeArchive(createWordNativeArchive(original));
  const content = importWordContent(restored).map(block => block.kind === 'paragraph'
    ? { ...block, runs: block.runs.map(run => ({ ...run, text: run.text.replace('Tail', 'Edited tail') })) } : block);
  const edited = reconcileWordContent(restored, content);
  expect(edited.document.source.source).toContain(colour);
  expect(edited.document.source.source).toContain(shading);
  expect(edited.document.source.source).toContain('Edited tail');
  const reopened = openWordNativeArchive(createWordNativeArchive(edited));
  expect(reopened.document.source.source).toContain(colour);
  expect(reopened.document.source.source).toContain(shading);
});
