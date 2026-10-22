import { cpus } from 'node:os';
import { openWordArtifact, wordParagraphText } from '../../packages/word/src/index.ts';
import { wordStoryArtifact } from '../../packages/word/src/stories.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';

const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const open = (body: string) => openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:body>${body}</w:body></w:document>` }));
const headerMain = openWordArtifact(buildWordDocumentFixture({
  documentXml: `<w:document xmlns:w="${ns}" xmlns:r="${rel}"><w:body>${p('BODY')}<w:sectPr><w:headerReference w:type="default" r:id="h"/></w:sectPr></w:body></w:document>`,
  relationships: [{ id: 'h', type: `${rel}/header`, target: 'header.xml' }],
  parts: [{ itemName: 'word/header.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml', xml: `<w:hdr xmlns:w="${ns}">${p('HEAD')}</w:hdr>` }],
}));
const cases = [
  { name: 'body split', artifact: open(p('abcd')), offset: 2, last: 0, end: 2, value: '\n' },
  { name: 'header split', artifact: wordStoryArtifact(headerMain, '/word/header.xml'), offset: 2, last: 0, end: 2, value: '\n' },
  { name: 'opaque crossing', artifact: open(p('a') + '<w:sdt><w:sdtContent>' + p('hidden') + '</w:sdtContent></w:sdt>' + p('b')), offset: 1, last: 1, end: 0, value: '' },
  { name: 'section split', artifact: open('<w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>ab</w:t></w:r></w:p>' + p('c')), offset: 1, last: 0, end: 1, value: '\n' },
  { name: 'tab insertion', artifact: open('<w:p><w:r><w:tab/><w:t>B</w:t></w:r></w:p>'), offset: 0, last: 0, end: 0, value: 'A' },
  { name: 'empty join', artifact: open('<w:p/>' + p('B')), offset: 0, last: 1, end: 0, value: '' },
];
const warmups = 20, samples = 30, operationsPerSample = 10;
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, warmups, samples, operationsPerSample }));
for (const item of cases) {
  const paragraphs = item.artifact.document.blocks.filter(block => block.kind === 'paragraph');
  const selection = { anchor: { paragraphElementId: paragraphs[0]!.elementId, offset: item.offset }, focus: { paragraphElementId: paragraphs[item.last]!.elementId, offset: item.end } };
  const run = () => {
    try { return item.artifact.replaceText(selection, item.value); }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  };
  for (let i = 0; i < warmups; i++) run();
  Bun.gc(true);
  const heapBefore = process.memoryUsage().heapUsed;
  const timings: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    for (let i = 0; i < operationsPerSample; i++) run();
    timings.push((performance.now() - start) / operationsPerSample);
  }
  const heapBeforeGc = process.memoryUsage().heapUsed;
  Bun.gc(true);
  const heapAfterGc = process.memoryUsage().heapUsed;
  const rawSamplesMs = [...timings];
  timings.sort((a, b) => a - b);
  const result = run();
  console.log(JSON.stringify({ name: item.name, rawSamplesMs, measuredOperations: samples * operationsPerSample, medianMs: timings[15], p95Ms: timings[28], heapGrowthBytes: heapBeforeGc - heapBefore, retainedHeapBytes: heapAfterGc - heapBefore, maxRss: process.resourceUsage().maxRSS,
    outcome: typeof result === 'string' ? result : { text: result.document.blocks.filter(b => b.kind === 'paragraph').map(b => wordParagraphText(result.document, b)), sections: result.document.source.elements(ns, 'sectPr').length } }));
}
