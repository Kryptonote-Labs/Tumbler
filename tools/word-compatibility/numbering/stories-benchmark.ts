import { cpus } from 'node:os';
import { importWordContent, layoutWordDocument, NativeWordDocument } from '../../../packages/word/src/index.ts';
import { wordStoryArtifact } from '../../../packages/word/src/stories.ts';
import { numberingStoryFixture, numberingStoryMeasurer as measure } from '../../../packages/word/test/numbering-story-fixture.ts';

// Identical native update/layout/export work, including an existing-style control.
const results = [];
for (const headingExists of [true, false]) {
  const source = numberingStoryFixture(50, 10, headingExists);
  const body = importWordContent(source);
  const header = importWordContent(wordStoryArtifact(source, '/word/header.xml'));
  const edited = header.map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => ({ ...run, text: run.text + '!' })) } : block);
  const content = [...body, { kind: 'paragraph' as const, styleId: 'Heading1', runs: [{ text: 'heading' }] }];
  const run = () => {
    const model = new NativeWordDocument({ source, immutableContent: true });
    model.layout(measure); // Exercise already-cached retained stories before changing shared styles.
    model.update(content);
    model.updateStory(process.env.NUMBERING_STORY_SECTION ? { section: 0, kind: 'header', type: 'default' } : '/word/header.xml', edited);
    const layout = model.layout(measure);
    const exported = model.artifact();
    const reopenedLayout = layoutWordDocument(exported.document, measure);
    const native = layout.pages[0]!.headerLines.flatMap(line => line.marker ? [line.marker.text] : []);
    const reopened = reopenedLayout.pages[0]!.headerLines.flatMap(line => line.marker ? [line.marker.text] : []);
    const checksum = (values: string[]) => values.join('').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return { bodyMarkers: model.listMarkers.size, nativeHeaderMarkers: native.length, exportedHeaderMarkers: reopened.length, nativeChecksum: checksum(native), exportedChecksum: checksum(reopened), packageBytes: exported.bytes().length };
  };
  for (let i = 0; i < 5; i++) run();
  const samples = [];
  for (let i = 0; i < 10; i++) {
    Bun.gc(true);
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const start = performance.now();
    const result = run();
    const ms = performance.now() - start;
    const used = process.cpuUsage(cpu);
    const after = process.memoryUsage();
    samples.push({ ms, cpuMs: (used.user + used.system) / 1000, heapDelta: after.heapUsed - memory.heapUsed, rssDelta: after.rss - memory.rss, ...result });
  }
  results.push({ scenario: headingExists ? 'existing-style-control' : 'materialized-shared-style', fixtureBytes: source.bytes().length, samples });
}
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, warmups: 5, operationsPerSample: { bodyParagraphs: 51, headerParagraphs: 10, nativeModels: 1, bodyUpdates: 1, storyUpdates: 1, nativeLayouts: 2, exports: 1, exportedLayouts: 1 }, results }, null, 2));
