import { cpus } from 'node:os';
import { authoredContent } from '../../packages/word/src/create-content.ts';
import { fixtures } from './fixtures.ts';

// Run in separate processes at each revision, with no concurrent tests.
const blocks = Array.from({ length: 100 }, () => Object.values(fixtures).flat()).flat();
const warmups = 20, samples = 15, iterations = 20;
let output = '';
for (let i = 0; i < warmups; i++) output = authoredContent(blocks, 500).content;
const milliseconds: number[] = [];
const heapDeltas: number[] = [];
for (let sample = 0; sample < samples; sample++) {
  Bun.gc(true);
  const heap = process.memoryUsage().heapUsed;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) output = authoredContent(blocks, 500).content;
  milliseconds.push((performance.now() - start) / iterations);
  heapDeltas.push(process.memoryUsage().heapUsed - heap);
}
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, warmups, samples, iterations,
  blocksPerOperation: blocks.length, cellsPerOperation: 200, outputBytes: Buffer.byteLength(output),
  milliseconds, heapDeltas, maxRssKiB: process.resourceUsage().maxRSS,
  medianMs: [...milliseconds].sort((a,b) => a-b)[Math.floor(samples / 2)],
}, null, 2));
