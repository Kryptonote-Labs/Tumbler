import { createHash } from 'node:crypto';
import { importWordContent, NativeWordDocument, openWordArtifact, wordStoryArtifact } from '../packages/word/src/index.ts';

// Supply a local DOCX; no document content is printed or written by this benchmark.
// Use the same input, runtime and hardware on both revisions, one process at a time.
const path = process.argv[2];
if (!path) throw new Error('Usage: bun scripts/benchmark-word-export.ts <document.docx> [iterations]');
const iterations = Number(process.argv[3] ?? 3);
if (!Number.isSafeInteger(iterations) || iterations < 1) throw new Error('Iterations must be a positive integer.');
const input = new Uint8Array(await Bun.file(path).arrayBuffer());
const runs = [];
for (let iteration = 0; iteration < iterations; iteration++) {
  Bun.gc(true);
  const cpu = process.cpuUsage();
  const started = performance.now();
  const source = openWordArtifact(input, {
    maxBlocks: Number.MAX_SAFE_INTEGER,
    maxInlineItems: Number.MAX_SAFE_INTEGER,
    maxTextCharacters: Number.MAX_SAFE_INTEGER,
  });
  const opened = performance.now();
  const model = new NativeWordDocument({ source });
  // Force a real body edit; an unchanged native model can reuse the source artifact.
  model.update([...importWordContent(source), { kind: 'paragraph', runs: [{ text: 'Export benchmark edit' }] }]);
  for (const story of source.document.headerFooters) {
    model.updateStory(story.part.name.value, importWordContent(wordStoryArtifact(source, story.part.name.value)));
  }
  const prepared = performance.now();
  const output = model.artifact().bytes();
  const finished = performance.now();
  const used = process.cpuUsage(cpu);
  runs.push({
    openMs: opened - started,
    prepareMs: prepared - opened,
    exportMs: finished - prepared,
    totalMs: finished - started,
    cpuMs: (used.user + used.system) / 1000,
    outputBytes: output.byteLength,
    sha256: createHash('sha256').update(output).digest('hex'),
  });
}
console.log(JSON.stringify({
  runtime: Bun.version,
  inputBytes: input.byteLength,
  peakProcessRssMiB: process.resourceUsage().maxRSS / 1024,
  runs,
}, null, 2));
