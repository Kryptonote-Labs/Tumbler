import { cpus } from 'node:os';
import { openWordArtifact } from '../../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../../packages/word/test/document-fixture.ts';

// Fixed fixture and workload for matched before/after runs. No package I/O in timed samples.
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const count = 10_000;
const bytes = buildWordDocumentFixture({
  documentXml: `<w:document xmlns:w="${w}"><w:body>${Array.from({ length: count }, (_, i) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="${i % 3}"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>item</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
  relationships: [{ id: 'n', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering', target: 'numbering.xml' }],
  parts: [{ itemName: 'word/numbering.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml', xml: `<w:numbering xmlns:w="${w}"><w:abstractNum w:abstractNumId="0">${[0, 1, 2].map(i => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${i + 1}."/></w:lvl>`).join('')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>` }],
});
const document = openWordArtifact(bytes).document;
const run = () => {
  const markers = document.numbering.markers(document);
  let checksum = 0;
  for (const marker of markers.values()) for (const char of marker.text) checksum += char.charCodeAt(0);
  return { count: markers.size, checksum };
};
for (let i = 0; i < 10; i++) run();
const samples = [];
for (let i = 0; i < 15; i++) {
  Bun.gc(true);
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const start = performance.now();
  const result = run();
  const ms = performance.now() - start;
  const used = process.cpuUsage(cpu);
  const after = process.memoryUsage();
  samples.push({ ms, cpuMs: (used.user + used.system) / 1000, heapDelta: after.heapUsed - memory.heapUsed, rssDelta: after.rss - memory.rss, ...result });
}
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, fixtureBytes: bytes.length, warmups: 10, samples, operationsPerSample: { paragraphs: count, markerCalls: 1, formatCalls: count } }, null, 2));
