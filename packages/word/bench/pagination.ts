// Run unchanged against both revisions: bun packages/word/bench/pagination.ts
import { cpus } from 'node:os';
import { layoutWordDocument } from '../src/index.ts';
import { paginationDocument, paragraph, section } from '../test/pagination-fixture.ts';
const cases = {
  plain: Array.from({ length: 1000 }, () => paragraph('plain paragraph')).join(''),
  keepChain: Array.from({ length: 1000 }, () => paragraph('heading', '<w:keepNext/>')).join(''),
  spacing: Array.from({ length: 1000 }, () => paragraph('spaced', '<w:spacing w:before="240" w:after="240" w:line="200" w:lineRule="exact"/>')).join(''),
};
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, warmups: 5, samples: 15 }));
for (const [name, body] of Object.entries(cases)) {
  const document = paginationDocument(body, section('', 6000));
  let operations = 0;
  const measurer = { measure(text: string) { operations++; return { width: text.length * 5, ascent: 8, descent: 2 }; } };
  const run = () => layoutWordDocument(document, measurer);
  for (let i = 0; i < 5; i++) run();
  const times: number[] = [];
  const heaps: number[] = [];
  let result = run();
  for (let i = 0; i < 15; i++) {
    Bun.gc(true); const heap = process.memoryUsage().heapUsed; operations = 0;
    const start = performance.now(); result = run(); times.push(performance.now() - start);
    heaps.push(process.memoryUsage().heapUsed - heap);
  }
  const rawMs = [...times]; const rawHeapDeltaBytes = [...heaps];
  times.sort((a, b) => a - b); heaps.sort((a, b) => a - b);
  console.log(JSON.stringify({ name, rawMs, rawHeapDeltaBytes, medianMs: times[7], minMs: times[0], maxMs: times[14], medianHeapDeltaBytes: heaps[7], measurementCalls: operations, pages: result.pages.length, lines: result.pages.reduce((n, p) => n + p.columns.reduce((m, c) => m + c.lines.length, 0), 0), fragments: result.fragmentCount }));
}
