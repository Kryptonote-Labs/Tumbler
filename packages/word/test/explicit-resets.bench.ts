// Run with: bun packages/word/test/explicit-resets.bench.ts
import { cpus } from 'node:os';
import { createWordArtifact, importWordContent } from '../src/index.ts';
import { openWordOperationDocument, prepareWordOperation } from '../src/operations/index.ts';

const paragraphs = 20;
const source = createWordArtifact({ paragraphs: Array.from({ length: paragraphs }, () => ({ positioning: { indentStartTwips: 720 }, runs: [{ text: 'Hello', link: '#target' }] })) });
function run(reset: boolean) {
  const session = openWordOperationDocument(source);
  try {
    if (reset) {
      const range = { start: 0, end: session.text.length - 1 };
      for (const operation of [{ name: 'paragraph', input: { positioning: null } }, { name: 'format', input: { link: null } }] as const)
        session.text.applyDelta(prepareWordOperation(session.text, range, operation).delta);
    }
    return session.artifact();
  } finally { session.destroy(); }
}
const baseline = importWordContent(source);
const noop = importWordContent(run(false));
const semantic = (content: typeof baseline) => content.map(block => block.kind === 'paragraph' ? [block.positioning, block.runs.map(run => [run.text, run.link])] : block.kind);
if (JSON.stringify(semantic(baseline)) !== JSON.stringify(semantic(noop))) throw new Error('No-op semantics changed');
for (let i = 0; i < 5; i++) run(true);
const samples = [];
for (let i = 0; i < 9; i++) {
  Bun.gc(true);
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const start = performance.now();
  const output = run(true);
  const ms = performance.now() - start;
  const usedCpu = process.cpuUsage(cpu);
  const after = process.memoryUsage();
  const xml = output.document.source.source;
  samples.push({ ms, cpuMs: (usedCpu.user + usedCpu.system) / 1000, heapDeltaBytes: after.heapUsed - memory.heapUsed, rssDeltaBytes: after.rss - memory.rss, outputXmlBytes: Buffer.byteLength(xml), remainingIndents: [...xml.matchAll(/w:left="720"/g)].length, remainingLinks: [...xml.matchAll(/<w:hyperlink\b/g)].length });
}
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, paragraphs, operationsPerSample: 2, exportsPerSample: 1, warmups: 5, noOpEquivalent: true, samples }, null, 2));
