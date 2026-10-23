import { cpus } from 'node:os';
import { NativeWordDocument, type WordContentBlock } from '../../../packages/word/src/index.ts';
import { numberingStoryFixture } from '../../../packages/word/test/numbering-story-fixture.ts';

const source = numberingStoryFixture(0, 0, true);
const paragraph: WordContentBlock = { kind: 'paragraph', runs: [{ text: 'item' }] };
const results = [];
for (const scenario of ['explicit', 'empty', 'nested'] as const) {
  const cell: readonly WordContentBlock[] = scenario === 'empty' ? [] : scenario === 'explicit' ? [paragraph] : [{ kind: 'table', rows: [[{ blocks: [paragraph] }]] }];
  const content: readonly WordContentBlock[] = Array.from({ length: 100 }, () => ({ kind: 'table', rows: [[{ blocks: cell }]] }));
  const run = () => {
    const model = new NativeWordDocument({ source, immutableContent: true });
    model.update(content);
    model.update(content);
    model.update([...content, paragraph]);
    const markers = [...model.listMarkers.values()].map(marker => marker.text);
    return { markers: markers.length, checksum: markers.join('').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) };
  };
  for (let i = 0; i < 5; i++) run();
  const samples = [];
  for (let i = 0; i < 10; i++) {
    Bun.gc(true);
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const start = performance.now();
    const output = run();
    const ms = performance.now() - start;
    const used = process.cpuUsage(cpu);
    const after = process.memoryUsage();
    samples.push({ ms, cpuMs: (used.user + used.system) / 1000, heapDelta: after.heapUsed - memory.heapUsed, rssDelta: after.rss - memory.rss, ...output });
  }
  results.push({ scenario, samples });
}
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, fixtureBytes: source.bytes().length, warmups: 5, operationsPerSample: { nativeModels: 1, outerTables: 100, updates: 3, appendedParagraphs: 1 }, results }, null, 2));
