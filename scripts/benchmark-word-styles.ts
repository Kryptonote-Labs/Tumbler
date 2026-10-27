import { cpus } from 'node:os';
import { WordStyles, type WordStyle } from '../packages/word/src/styles.ts';

// Run unchanged on each revision: bun scripts/benchmark-word-styles.ts
const depth = 80, width = 256, operations = 10_000, warmups = 3, samples = 9;
const styles: WordStyle[] = [];
for (let i = 0; i < depth + width; i++) styles.push({
  styleId: `P${i}`, type: 'paragraph', basedOn: i === 0 ? undefined : `P${Math.min(i - 1, depth - 1)}`,
  name: undefined, linked: undefined, isDefault: false,
  run: { fontSizePoints: 11 + i % 4 }, paragraph: { spacingAfterTwips: i },
});
const resolver = new WordStyles({ styles });
let checksum = 0;
function batch() {
  for (let i = 0; i < operations; i++) {
    const value = resolver.resolveParagraphStyle(`P${depth + i % width}`);
    checksum += value.text.fontSizePoints + value.paragraph.spacingAfterTwips;
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
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, depth, width, operations, warmups, samples,
  timingsMs: timings, medianMs: [...timings].sort((a,b)=>a-b)[4], heapDeltasBytes: heaps,
  checksum, note: 'Heap deltas are retained heap before forced GC, not allocated bytes. No allocation profiler.' }, null, 2));
