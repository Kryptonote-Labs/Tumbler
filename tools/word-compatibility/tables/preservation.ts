import assert from 'node:assert/strict';
import { openZipArchive } from '../../../packages/opc/src/index.ts';
import { openWordArtifact, wordParagraphText, WordEditingSession, type WordArtifact } from '../../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../../packages/word/test/document-fixture.ts';
import type { Scenario } from '../scenarios.ts';
import { tableScenarios } from './scenarios.ts';

/** Exercise every valid read fixture through an edit outside the table and an exact undo. */
export const tablePreservationScenarios: readonly Scenario[] = tableScenarios.map(read => ({
  id: read.id.replace('table-', 'table-preserve-'), title: `Preserve structure during neighbouring edits: ${read.title}`,
  topics: read.topics, dimensions: ['preserve'], oracles: ['assertion', 'package-diff', 'openxml'],
  run() {
    const comparisons: (() => void)[] = [];
    const fixtures = read.run().fixtures.flatMap(input => {
      const source = openWordArtifact(input.bytes);
      const bytes = buildWordDocumentFixture({ conformance: source.document.conformance,
        documentXml: source.document.source.source.replace('</w:body>', '<w:p><w:r><w:t>Neighbour</w:t></w:r></w:p></w:body>'),
      });
      const original = openWordArtifact(bytes);
      input.verify(original);
      assert.deepEqual(original.bytes(), bytes, 'no-op package bytes');
      const paragraph = original.document.blocks.at(-1);
      assert.ok(paragraph?.kind === 'paragraph');
      const selection = { anchor: { paragraphElementId: paragraph.elementId, offset: 0 }, focus: { paragraphElementId: paragraph.elementId, offset: 9 } };
      const history = new WordEditingSession(original);
      history.replaceText(selection, 'Changed');
      assert.deepEqual(history.undo().bytes(), bytes, 'undo restores complete package');
      const redone = history.redo();
      const editedParagraph = redone.document.blocks.at(-1);
      assert.ok(editedParagraph?.kind === 'paragraph');
      const edited = redone.applyFormatting({ anchor: { paragraphElementId: editedParagraph.elementId, offset: 0 }, focus: { paragraphElementId: editedParagraph.elementId, offset: 7 } }, { text: { bold: { set: true } }, block: { horizontalAlignment: { set: 'center' } } });
      const verify = (artifact: WordArtifact, text: string) => {
        input.verify(artifact);
        const neighbour = artifact.document.blocks.at(-1);
        assert.ok(neighbour?.kind === 'paragraph');
        assert.equal(wordParagraphText(artifact.document, neighbour), text);
      };
      const compare = () => {
        const reopened = openWordArtifact(edited.bytes());
        verify(reopened, 'Changed');
        assert.equal(tableSource(reopened), tableSource(original), 'entire untouched table XML must remain identical');
        const before = openZipArchive(bytes), after = openZipArchive(edited.bytes());
        assert.deepEqual(before.entries.map(entry => entry.name).sort(), after.entries.map(entry => entry.name).sort());
        for (const entry of before.entries) if (entry.name !== 'word/document.xml') assert.deepEqual(before.read(entry), after.read(after.get(entry.name)!), entry.name);
      };
      compare();
      comparisons.push(compare);
      return [
        { name: `${input.name}-before`, bytes, verify: (artifact: WordArtifact) => verify(artifact, 'Neighbour') },
        { name: `${input.name}-after`, bytes: edited.bytes(), verify: (artifact: WordArtifact) => verify(artifact, 'Changed') },
      ];
    });
    return { fixtures, comparePackages: () => comparisons.forEach(compare => compare()) };
  },
}));

function tableSource(artifact: WordArtifact) {
  const table = artifact.document.blocks[0];
  assert.ok(table?.kind === 'table');
  const element = artifact.document.source.element(table.elementId)!;
  return artifact.document.source.source.slice(element.span.start, element.span.end);
}
