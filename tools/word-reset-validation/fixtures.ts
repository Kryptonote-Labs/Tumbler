// bun tools/word-reset-validation/fixtures.ts /tmp/word-reset-schema
import { openWordArtifact, importWordContent, NativeWordDocument } from '../../packages/word/src/index.ts';
import { openWordOperationDocument, prepareWordOperation } from '../../packages/word/src/operations/index.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';
const output = process.argv[2];
if (!output) throw new Error('Supply output directory');
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
for (const opaque of [false, true]) {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}" xmlns:ext="urn:custom" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="ext"><w:body><w:p><w:pPr><w:tabs>\n<w:tab w:val="left" w:pos="1440"/>${opaque ? '<ext:keep/>' : '\n'}</w:tabs><w:ind w:left="720"/></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>` }));
  await Bun.write(`${output}/${opaque ? 'opaque' : 'known'}-source.xml`, source.document.source.source);
  const session = openWordOperationDocument(source);
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, { name: 'paragraph', input: { positioning: null } }).delta);
    await Bun.write(`${output}/${opaque ? 'opaque' : 'known'}-reset.xml`, session.artifact().document.source.source);
  } finally { session.destroy(); }
  const first = importWordContent(source)[0]!;
  if (first.kind !== 'paragraph') throw new Error('Expected paragraph');
  const model = new NativeWordDocument({ source, content: [{ ...first, positioning: { reset: true, tabs: [{ positionTwips: 2880, alignment: 'start', leader: 'none' }] } }] });
  await Bun.write(`${output}/${opaque ? 'opaque' : 'known'}-replacement.xml`, model.artifact().document.source.source);
}
