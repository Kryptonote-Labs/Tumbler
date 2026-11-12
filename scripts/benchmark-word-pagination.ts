/** Headless production pagination benchmark, without a dev server or DOM rendering.
 * NODE_ENV=production bun scripts/benchmark-word-pagination.ts [paragraphs=2000]
 * Uses native canvas font metrics. Font availability and hardware affect results.
 */
import { createCanvas } from '@napi-rs/canvas';
import { canvasWordTextMeasurer, createWordArtifact, layoutWordDocument, layoutWordDocumentProgressively, type WordLayout } from '../packages/word/src/index.ts';
import { startWordLayoutJob } from '../packages/svelte/src/word-layout-job.ts';

const paragraphs = Number(process.argv[2] ?? 2000);
if (!Number.isSafeInteger(paragraphs) || paragraphs < 1) throw new Error('paragraphs must be a positive integer');
const document = createWordArtifact({ paragraphs: Array.from({ length: paragraphs }, (_, i) => ({
  runs: [{ text: `Paragraph ${i}. Cooperative pagination keeps the host available between page steps. `.repeat(5) }],
})) }).document;
const measurer = () => canvasWordTextMeasurer(createCanvas(1, 1).getContext('2d'));
// Warm native font loading before either run. Document creation is outside both measurements.
layoutWordDocument(createWordArtifact({ paragraphs: [{ runs: [{ text: 'Warm up' }] }] }).document, measurer());
let start = performance.now();
const synchronous = layoutWordDocument(document, measurer());
const synchronousMs = performance.now() - start;
let firstSnapshotMs = 0;
let tasks = 0;
let maxTaskMs = 0;
let heartbeats = 0;
const heartbeat = setInterval(() => { heartbeats++; }, 1);
let finalLayout: WordLayout | undefined;
start = performance.now();
await new Promise<void>((resolve, reject) => {
  startWordLayoutJob(layoutWordDocumentProgressively(document, measurer()), (layout, complete) => {
    if (firstSnapshotMs === 0) firstSnapshotMs = performance.now() - start;
    if (complete) {
      finalLayout = layout;
      resolve();
    }
  }, reject, run => {
    const timer = setTimeout(() => {
      const taskStart = performance.now();
      run();
      maxTaskMs = Math.max(maxTaskMs, performance.now() - taskStart);
      tasks++;
    }, 0);
    return () => clearTimeout(timer);
  });
}).finally(() => clearInterval(heartbeat));
const progressiveMs = performance.now() - start;
if (JSON.stringify(finalLayout) !== JSON.stringify(synchronous)) throw new Error('Output mismatch');
console.log(JSON.stringify({ paragraphs, pages: synchronous.pages.length, synchronousMs,
  progressiveMs, firstSnapshotMs, maxTaskMs, tasks, heartbeats,
  outputEquivalent: true, runtime: Bun.version }, null, 2));
