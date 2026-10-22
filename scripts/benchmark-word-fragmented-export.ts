import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { createWordArtifact, importWordContent, reconcileWordContent } from '../packages/word/src/index.ts';

// Run each size in a fresh process, on both revisions, with no concurrent tests.
// bun scripts/benchmark-word-fragmented-export.ts 8000 3 1
const [size = 8000, samples = 3, warmups = 1] = process.argv.slice(2).map(Number);
if (![size, samples, warmups].every(n => Number.isSafeInteger(n) && n >= 0) || !size || !samples)
  throw new Error('Expected positive size/samples and nonnegative warmups.');
const source = createWordArtifact({ paragraphs: [{ runs: Array.from({ length: size }, () => ({ text: 'x' })) }] });
const blocks = importWordContent(source);
const results = [];
for (let i = 0; i < warmups + samples; i++) {
  Bun.gc(true);
  const heapBefore = process.memoryUsage().heapUsed;
  const cpu = process.cpuUsage();
  const start = performance.now();
  const output = reconcileWordContent(source, blocks);
  const wallMs = performance.now() - start;
  const used = process.cpuUsage(cpu);
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  const xml = output.document.source.source;
  const restored = importWordContent(output);
  if (restored.length !== 1 || restored[0]?.kind !== 'paragraph' || restored[0].runs.length !== size || restored[0].runs.some(run => run.text !== 'x'))
    throw new Error('Fragmented runs changed during reconciliation.');
  if (i >= warmups) results.push({ wallMs, cpuMs: (used.user + used.system) / 1000, heapDeltaBytes,
    xmlBytes: Buffer.byteLength(xml), sha256: createHash('sha256').update(xml).digest('hex') });
}
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, size, samples, warmups,
  peakProcessRssBytes: process.resourceUsage().maxRSS * 1024, results }, null, 2));
