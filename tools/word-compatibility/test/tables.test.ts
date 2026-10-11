import { expect, test } from 'bun:test';
import { openWordArtifact } from '../../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../../packages/word/test/document-fixture.ts';
import { cases, tableXml } from '../tables/cases.ts';
import { verifyTable } from '../tables/scenarios.ts';

test('table assertions detect a changed span and lost merge ownership', () => {
  for (const [name, from, to] of [
    ['staggered-spans', 'w:val="2"', 'w:val="1"'],
    ['implicit-and-explicit-continuations', '<w:vMerge/>', ''],
  ]) {
    const expected = cases.find(item => item.name === name)!;
    const body = tableXml(expected.columns, expected.rows).replace(from!, to!);
    const bytes = buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` });
    expect(() => verifyTable(openWordArtifact(bytes), expected)).toThrow();
  }
});
