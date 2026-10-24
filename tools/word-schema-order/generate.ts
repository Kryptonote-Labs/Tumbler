import { createWordArtifact, NativeWordDocument, openWordArtifact } from '../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';
import { combinations } from './combinations.ts';
import { fixtures } from './fixtures.ts';

const directory = process.argv[2];
if (!directory) throw new Error('Pass an output directory.');
for (const [name, blocks] of Object.entries({ ...fixtures, combinations })) {
  await Bun.write(`${directory}/${name}-transitional.docx`, createWordArtifact({ blocks }).bytes());
  const source = openWordArtifact(buildWordDocumentFixture({ conformance: 'strict', documentXml: '<w:document xmlns:w="http://purl.oclc.org/ooxml/wordprocessingml/main"><w:body><w:p/></w:body></w:document>' }));
  const native = new NativeWordDocument({ source });
  native.update(blocks);
  await Bun.write(`${directory}/${name}-strict.docx`, native.artifact().bytes());
}
