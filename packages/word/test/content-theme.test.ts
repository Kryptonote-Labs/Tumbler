import { expect, test } from 'bun:test';
import { importWordContent, openWordArtifact, reconcileWordContent } from '../src/index.ts';
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
