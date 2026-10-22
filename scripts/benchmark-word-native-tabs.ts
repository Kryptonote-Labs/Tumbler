import { cpus } from 'node:os';
import { NativeWordDocument, importWordContent, layoutWordDocument, openWordArtifact } from '../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../packages/word/test/document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const source = openWordArtifact(buildWordDocumentFixture({
  relationships: [
    { id: 'styles', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', target: 'styles.xml' },
    { id: 'header', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', target: 'header.xml' },
  ],
  parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
    xml: `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Named"><w:pPr><w:tabs><w:tab w:val="start" w:pos="720"/></w:tabs></w:pPr></w:style></w:styles>` },
    { itemName: 'word/header.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml', xml: `<w:hdr xmlns:w="${w}"><w:p><w:pPr><w:pStyle w:val="Named"/></w:pPr><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p></w:hdr>` }],
  documentXml: `<w:document xmlns:w="${w}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:pPr><w:pStyle w:val="Named"/></w:pPr><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:body></w:document>`,
}));
const original = importWordContent(source)[0];
if (original?.kind !== 'paragraph') throw new Error('Expected paragraph');
const operations = 2_000, warmups = 3, samples = 9, layoutEvery = 20;
const native = new NativeWordDocument({ source });
// Both versions produce the correct two stops. Alternating text bypasses record reuse.
const tabs = [720, 1440].map(positionTwips => ({ positionTwips, alignment: 'start' as const, leader: 'none' as const }));
const header = native.updateStory('/word/header.xml', [{ kind: 'paragraph', styleId: 'Named', positioning: { tabs }, runs: [{ text: 'A\tB' }] }]);
const measurer = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };
const expectedHeaderX = layoutWordDocument(source.document, measurer).pages[0]?.headerLines.flatMap(line => line.fragments).find(fragment => fragment.text === 'B')?.x;
if (expectedHeaderX === undefined) throw new Error('Expected reference header');
let checksum = 0;
function batch() {
  for (let i = 0; i < operations; i++) {
    native.update([{ ...original, positioning: { tabs }, runs: [{ text: `A\tB${i % 2}` }] }]);
    const paragraph = native.blocks[0];
    if (paragraph?.kind !== 'paragraph') throw new Error('Expected native paragraph');
    const actual = native.paragraphFormat(paragraph).tabs;
    if (actual.length !== 2 || actual[0]?.positionTwips !== 720 || actual[1]?.positionTwips !== 1440) throw new Error('Incorrect tabs');
    checksum += actual[0].positionTwips + actual[1].positionTwips;
    const headerParagraph = header.blocks[0];
    if (headerParagraph?.kind !== 'paragraph') throw new Error('Expected header paragraph');
    const headerTabs = header.paragraphFormat(headerParagraph).tabs;
    if (headerTabs.length !== 2 || headerTabs[0]?.positionTwips !== 720 || headerTabs[1]?.positionTwips !== 1440) throw new Error('Incorrect header tabs');
    checksum += headerTabs[0].positionTwips + headerTabs[1].positionTwips;
    if (i % layoutEvery === 0) {
      const x = native.layout(measurer).pages[0]?.headerLines.flatMap(line => line.fragments).find(fragment => fragment.text === 'B')?.x;
      if (x !== expectedHeaderX) throw new Error('Incorrect header layout');
      checksum += x;
    }
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
  operations, warmups, samples, layoutsPerBatch: operations / layoutEvery, outputStopsPerBatch: operations * tabs.length * 2, checksum,
  timingsMs: timings, medianMs: [...timings].sort((a, b) => a - b)[4], heapDeltasBytes: heaps,
  note: 'Native body updates, edited-header tab output, and repeated layout with correct output on both versions. Source compilation and initial story setup are excluded. Heap deltas are GC-sensitive retained heap, not total allocation. No allocation profiler.' }, null, 2));
