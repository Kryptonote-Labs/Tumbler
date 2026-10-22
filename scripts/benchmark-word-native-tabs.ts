import { cpus } from 'node:os';
import { NativeWordDocument, importWordContent, openWordArtifact } from '../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../packages/word/test/document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const source = openWordArtifact(buildWordDocumentFixture({
  relationships: [{ id: 'styles', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', target: 'styles.xml' }],
  parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
    xml: `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Named"><w:pPr><w:tabs><w:tab w:val="start" w:pos="720"/></w:tabs></w:pPr></w:style></w:styles>` }],
  documentXml: `<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:pStyle w:val="Named"/></w:pPr><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p></w:body></w:document>`,
}));
const original = importWordContent(source)[0];
if (original?.kind !== 'paragraph') throw new Error('Expected paragraph');
const operations = 2_000, warmups = 3, samples = 9;
const native = new NativeWordDocument({ source });
// Both versions produce the correct two stops. Alternating text bypasses record reuse.
const tabs = [720, 1440].map(positionTwips => ({ positionTwips, alignment: 'start' as const, leader: 'none' as const }));
let checksum = 0;
function batch() {
  for (let i = 0; i < operations; i++) {
    native.update([{ ...original, positioning: { tabs }, runs: [{ text: `A\tB${i % 2}` }] }]);
    const paragraph = native.blocks[0];
    if (paragraph?.kind !== 'paragraph') throw new Error('Expected native paragraph');
    const actual = native.paragraphFormat(paragraph).tabs;
    if (actual.length !== 2 || actual[0]?.positionTwips !== 720 || actual[1]?.positionTwips !== 1440) throw new Error('Incorrect tabs');
    checksum += actual[0].positionTwips + actual[1].positionTwips;
  }
}
for (let i = 0; i < warmups; i++) batch();
const timings: number[] = [], heaps: number[] = [];
for (let i = 0; i < samples; i++) {
  Bun.gc(true);
  const heap = process.memoryUsage().heapUsed;
  const start = performance.now();
  batch();
  timings.push(performance.now() - start);
  heaps.push(process.memoryUsage().heapUsed - heap);
}
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length,
  operations, warmups, samples, outputStopsPerBatch: operations * tabs.length, checksum,
  timingsMs: timings, medianMs: [...timings].sort((a, b) => a - b)[4], heapDeltasBytes: heaps,
  note: 'Native paragraph updates with unchanged correct tab output. Heap deltas are GC-sensitive retained heap, not total allocation. No allocation profiler.' }, null, 2));
