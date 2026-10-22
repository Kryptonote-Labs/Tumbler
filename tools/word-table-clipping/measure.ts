// Run with: bun tools/word-table-clipping/measure.ts /absolute/path/to/checkout
import { resolve } from 'node:path';
import { cpus } from 'node:os';
import { clipCell, clipParagraph, clipRow, clipTable, tableClippingFixture } from '../../packages/word/test/table-clipping-fixture.ts';
import type { WordCanvasContext } from '../../packages/word/src/index.ts';

const root = resolve(process.argv[2] ?? '.');
const api = await import(`${root}/packages/word/src/index.ts`) as typeof import('../../packages/word/src/index.ts');
const { openWordArtifact, layoutWordDocument, paintWordPage, wordLineAtPoint } = api;
let measurements = 0;
const measurer = { measure(text: string) { measurements++; return { width: text.length * 5, ascent: 8, descent: 2 }; } };
const bytes = tableClippingFixture(clipTable(Array.from({ length: 200 }, () => clipRow(clipCell(['VISIBLE', 'HIDDEN1', 'HIDDEN2', 'HIDDEN3'].map(clipParagraph).join('')))).join('')));
const document = openWordArtifact(bytes).document;
const layout = layoutWordDocument(document, measurer);
const layoutMeasurements = measurements;
const operations: Record<string, number> = {};
const count = (name: string) => { operations[name] = (operations[name] ?? 0) + 1; };
const context = {
  font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, textAlign: 'start', textBaseline: 'alphabetic', direction: 'inherit',
  save() { count('save'); }, restore() { count('restore'); }, beginPath() { count('beginPath'); }, rect() { count('rect'); }, clip() { count('clip'); }, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, setLineDash() {}, rotate() {}, arc() {}, scale() {}, translate() {}, fillRect() {}, drawImage() {},
  fillText() { count('fillText'); }, measureText(text: string) { return { width: text.length * 5 }; },
} satisfies WordCanvasContext<unknown>;
const paint = () => { for (const page of layout.pages) paintWordPage(context, page); };
paint();
const paintOperations = { ...operations };
// Counted recording context measures dispatch overhead, not rasterization or browser rendering.
const timing = (run: () => void, iterations: number) => {
  for (let i = 0; i < 10; i++) run();
  const samples: number[] = [];
  for (let sample = 0; sample < 30; sample++) {
    const start = performance.now();
    for (let iteration = 0; iteration < iterations; iteration++) run();
    samples.push((performance.now() - start) / iterations);
  }
  const rawSamplesMs = [...samples];
  samples.sort((a, b) => a - b);
  return { rawSamplesMs, medianMs: samples[15], p95Ms: samples[28], samples: 30, iterations };
};
const layoutTiming = timing(() => { layoutWordDocument(document, measurer); }, 5);
const paintTiming = timing(paint, 20);
const hitTiming = timing(() => { for (let i = 0; i < 1000; i++) wordLineAtPoint(layout.pages[i % layout.pages.length]!, 500, 10 + i % 280); }, 1);
Bun.gc(true);
const heapBefore = process.memoryUsage().heapUsed;
const retained = Array.from({ length: 10 }, () => layoutWordDocument(document, measurer));
Bun.gc(true);
const retainedHeapBytes = process.memoryUsage().heapUsed - heapBefore;
const repro = layoutWordDocument(openWordArtifact(tableClippingFixture()).document, measurer).pages[0]!;
const table = repro.columns[0]!.tables[0]!;
const hit = wordLineAtPoint(repro, 500, 45)?.fragments[0]?.text;
console.log(JSON.stringify({ root, runtime: Bun.version, cpu: cpus()[0]?.model, cpuCount: cpus().length, fixtureBytes: bytes.byteLength, pages: layout.pages.length, fragments: layout.fragmentCount, layoutMeasurements, geometryHash: new Bun.CryptoHasher('sha256').update(JSON.stringify(layout)).digest('hex'), paintOperations, layoutTiming, paintTiming, hit1000Timing: hitTiming, retainedHeapBytes, retainedLayouts: retained.length, repro: { rowBounds: table.cells.map(cell => [cell.y, cell.height]), firstRowLines: table.cells[0]!.lines.map(line => line.y), hitOutsideAtY45: hit, expectedHit: 'NEXT', pass: hit === 'NEXT' } }, null, 2));
if (process.argv.includes('--verify') && hit !== 'NEXT') process.exitCode = 1;
