// bun tools/word-reset-validation/native-reset.bench.ts
import { cpus } from 'node:os';
import { importWordContent, NativeWordDocument, openWordArtifact } from '../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';

const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const paragraphs = 20;
const updates = 100;
const source = openWordArtifact(buildWordDocumentFixture({
  documentXml: `<w:document xmlns:w="${ns}"><w:body>${'<w:p><w:pPr><w:pStyle w:val="Named"/><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs><w:ind w:left="1080"/></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p>'.repeat(paragraphs)}</w:body></w:document>`,
  relationships: [{ id: 'styles', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', target: 'styles.xml' }],
  parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Named"><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="240"/></w:pPr></w:style></w:styles>` }],
}));
const original = importWordContent(source);
const contents = [0, 1].map(value => original.map(paragraph => {
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  return { ...paragraph, positioning: { reset: true as const }, runs: paragraph.runs.map(run => ({ ...run, text: `Hello${value}` })) };
}));
function run() {
  const model = new NativeWordDocument({ source });
  for (let index = 0; index < updates; index++) model.update(contents[index % 2]!);
  let checksum = 0;
  for (const block of model.blocks) {
    if (block.kind !== 'paragraph') throw new Error('Expected native paragraph');
    const format = model.paragraphFormat(block);
    if (format.indentStartTwips !== 240 || format.tabs.length !== 1 || format.tabs[0]?.positionTwips !== 720) throw new Error('Incorrect native reset');
    checksum += format.indentStartTwips + format.tabs[0].positionTwips;
  }
  const output = model.artifact().document;
  let stops = 0;
  for (const block of output.blocks) {
    if (block.kind !== 'paragraph') throw new Error('Expected exported paragraph');
    const format = output.styles.paragraphFormat(output, block);
    if (format.indentStartTwips !== 240 || format.tabs.length !== 1 || format.tabs[0]?.positionTwips !== 720) throw new Error('Incorrect exported reset');
    stops += format.tabs.length;
  }
  if (output.blocks.length !== paragraphs || checksum !== paragraphs * 960 || stops !== paragraphs) throw new Error('Incorrect output counts');
  return { checksum, stops, outputXmlBytes: Buffer.byteLength(output.source.source), outputSha256: new Bun.CryptoHasher('sha256').update(output.source.source).digest('hex') };
}
for (let index = 0; index < 5; index++) run();
const samples = Array.from({ length: 9 }, () => {
  Bun.gc(true);
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const start = performance.now();
  const output = run();
  const ms = performance.now() - start;
  const used = process.cpuUsage(cpu);
  const after = process.memoryUsage();
  return { ms, cpuMs: (used.user + used.system) / 1000, rssDeltaBytes: after.rss - memory.rss, heapDeltaBytes: after.heapUsed - memory.heapUsed, ...output };
});
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, paragraphs, updates, paragraphUpdates: paragraphs * updates, exportsPerSample: 1, warmups: 5, samples }, null, 2));
