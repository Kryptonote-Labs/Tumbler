import assert from 'node:assert/strict';
import { OOXML_NAMESPACES } from '../../../packages/ooxml/src/index.ts';
import { openWordArtifact, resolveWordTableGrid, wordParagraphText, type WordArtifact } from '../../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../../packages/word/test/document-fixture.ts';
import type { Scenario } from '../scenarios.ts';
import { cases, invalidMerges, tableXml, topics, type TableCase } from './cases.ts';

export const profiles = ['strict', 'transitional'] as const;
export const tableScenarios: readonly Scenario[] = profiles.flatMap(profile => Object.entries(topics).map(([feature, topic]): Scenario => ({
  id: `table-${feature}-${profile}`, title: `Resolve ${feature} table structure (${profile})`, topics: [topic], dimensions: ['read'], oracles: ['assertion', 'openxml'],
  run() {
    const packageFor = (body: string) => buildWordDocumentFixture({ conformance: profile, documentXml: `<w:document xmlns:w="${OOXML_NAMESPACES[profile].wordprocessing}"><w:body>${body}</w:body></w:document>` });
    const fixtures = cases.filter(item => item.feature === feature).map(item => ({ name: item.name, bytes: packageFor(tableXml(item.columns, item.rows)), verify: (artifact: WordArtifact) => verifyTable(artifact, item) }));
    if (feature !== 'merge') {
      const tag = feature === 'span' ? 'gridSpan' : feature === 'before' ? 'gridBefore' : 'gridAfter';
      const sample = cases.find(item => item.name === (feature === 'span' ? 'staggered-spans' : feature === 'before' ? 'leading-omission' : 'trailing-omission'))!;
      const raw = tableXml(sample.columns, sample.rows);
      for (const [syntax, decorate] of [
        ['leading-zeroes', (value: string) => `00${value}`],
        ['signed-whitespace', (value: string) => ` +${value} `],
      ] as const) {
        const body = raw.replace(new RegExp(`(<w:${tag} w:val=")(\\d+)(")`, 'g'), (_, start: string, value: string, end: string) => start + decorate(value) + end);
        fixtures.push({ name: syntax, bytes: packageFor(body), verify: artifact => verifyTable(artifact, sample) });
      }
      for (const value of ['', '-1', '1.5', '1e0', 'invalid', ...(feature === 'span' ? ['0'] : [])]) {
        const body = raw.replace(new RegExp(`<w:${tag} w:val="[0-9]+"/>`), `<w:${tag} w:val="${value}"/>`);
        assert.throws(() => openWordArtifact(packageFor(body)), new RegExp(tag), `reject ${tag}=${value}`);
      }
      assert.throws(() => openWordArtifact(packageFor(raw.replace(new RegExp(`<w:${tag} w:val="[0-9]+"/>`), `<w:${tag}/>`))), /requires a val/);
    }
    for (const fixture of fixtures) fixture.verify(openWordArtifact(fixture.bytes));
    if (feature === 'merge') {
      for (const item of invalidMerges) assert.throws(() => {
        const table = openWordArtifact(packageFor(tableXml(item.columns, item.rows))).document.blocks[0];
        assert.ok(table?.kind === 'table');
        resolveWordTableGrid(table);
      }, /no matching restart/, item.name);
      const invalid = tableXml(1, [{ cells: [{ text: '', merge: 'restart' }] }]).replace('w:val="restart"', 'w:val="invalid"');
      assert.throws(() => openWordArtifact(packageFor(invalid)), /vertical merge/);
    }
    return { fixtures };
  },
})));

export function verifyTable(artifact: WordArtifact, expected: TableCase, retainDeclarations = true) {
  const table = artifact.document.blocks[0];
  assert.ok(table?.kind === 'table');
  const result = resolveWordTableGrid(table);
  assert.equal(result.columnCount, expected.expectedColumns, 'logical column count');
  assert.deepEqual(result.rows.map(row => row.cells.map(cell => [cell.column, cell.columnSpan, cell.rowSpan,
    cell.source.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(artifact.document, block)).join('\n'),
  ])), expected.expected, 'anchors, spans and text');
  if (retainDeclarations) assert.deepEqual(table.rows.map(row => [row.gridBefore, row.gridAfter]), expected.rows.map(row => [row.before ?? 0, row.after ?? 0]), 'source declarations retained independently of effective grid');
  const sourceIds = table.rows.flatMap(row => row.cells.map(cell => cell.elementId)).sort((a,b) => a-b);
  const resolvedIds = result.rows.flatMap(row => row.cells.flatMap(cell => [cell.source.elementId, ...cell.continuationElementIds])).sort((a,b) => a-b);
  assert.deepEqual(resolvedIds, sourceIds, 'every source cell belongs to exactly one anchor');
  for (const row of result.rows) for (const cell of row.cells) {
    assert.equal(cell.continuationElementIds.length, cell.rowSpan - 1);
    cell.continuationElementIds.forEach((id, offset) => assert.ok(table.rows[cell.row + offset + 1]!.cells.some(source => source.elementId === id), 'continuations must come from consecutive rows'));
  }
}
