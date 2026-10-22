/** Run with bun tools/word-picture-benchmark.ts /absolute/checkout. See picture audit evidence. */
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import type { WordCanvasContext } from '../packages/word/src/canvas-paint.ts';
import { pictureFixture } from '../packages/word/test/picture-fixture.ts';

const root = resolve(process.argv[2] ?? '.');
const word: typeof import('../packages/word/src/index.ts') = await import(`${root}/packages/word/src/index.ts`);
let operations = 0, draws = 0, checksum = 0;
const call = () => { operations++; };
const context: WordCanvasContext<string, string> = {
  globalAlpha: 1, arc: call, direction: 'ltr', font: '', textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '', strokeStyle: '', lineWidth: 1,
  save: call, restore: call, scale: call, translate: call, rotate: call, beginPath: call, rect: call, clip: call,
  fillRect: call, setLineDash: call, moveTo: call, lineTo: call, stroke: call, fill: call,
  fillText: call, measureText: () => ({ width: 5 }),
  drawImage: (_image, x, y, width, height) => { operations++; draws++; checksum += x + y + width + height; },
};
const sample = (run: () => void, count: number) => {
  for (let i = 0; i < 3; i++) for (let j = 0; j < count; j++) run();
  const timings: number[] = [], retained: number[] = [];
  for (let i = 0; i < 7; i++) {
    Bun.gc(true);
    const before = process.memoryUsage().heapUsed;
    const start = performance.now();
    for (let j = 0; j < count; j++) run();
    timings.push(performance.now() - start);
    Bun.gc(true);
    retained.push(process.memoryUsage().heapUsed - before);
  }
  return { iterationsPerSample: count, warmupBatches: 3, milliseconds: timings, medianMs: [...timings].sort((a, b) => a - b)[3], retainedHeapBytes: retained, rssBytes: process.memoryUsage().rss };
};
const results = [];
for (const transformed of [false, true]) {
  const bytes = pictureFixture(transformed ? { crop: 'l="50000"', transform: 'rot="5400000" flipH="1"' } : {});
  const artifact = word.openWordArtifact(bytes);
  const page = word.layoutWordDocument(artifact.document, { measure: () => ({ width: 5, ascent: 8, descent: 2 }) }).pages[0]!;
  const parse = sample(() => { word.openWordArtifact(bytes); }, 20);
  const paint = () => word.paintWordPage(context, page, { scale: 1, image: () => 'decoded-fixture' });
  operations = 0; draws = 0; checksum = 0; paint();
  const counts = { operations, draws, coordinateChecksum: checksum };
  const commandPaint = sample(paint, 5000);
  results.push({ transformed, fixtureBytes: bytes.length, exportUnchanged: Buffer.compare(Buffer.from(artifact.bytes()), Buffer.from(bytes)) === 0, counts, parse, commandPaint });
}
console.log(JSON.stringify({ root, bun: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, results }, null, 2));
