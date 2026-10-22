import { PartName, RelationshipsError } from '../packages/opc/src/index.ts';
import { cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { createWordStory, openWordArtifact, reconcileWordContent, wordStoryArtifact } from '../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../packages/word/test/document-fixture.ts';

// Identical generated input on each revision. Run alone, with no tests in parallel.
const fixture = createWordStory(openWordArtifact(buildWordDocumentFixture()), { kind: 'header', type: 'default', section: 0 });
const story = wordStoryArtifact(fixture.artifact, fixture.partName);
const run = () => reconcileWordContent(story, [{ kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'Generated benchmark heading' }] }]);
for (let i = 0; i < 5; i++) run();
const samples = [];
for (let i = 0; i < 15; i++) {
  Bun.gc(true);
  const heap = process.memoryUsage().heapUsed;
  const cpu = process.cpuUsage();
  const start = performance.now();
  for (let j = 0; j < 10; j++) run();
  const elapsed = performance.now() - start;
  const used = process.cpuUsage(cpu);
  samples.push({ msPerExport: elapsed / 10, cpuMsPerExport: (used.user + used.system) / 10000, heapDeltaBytes: process.memoryUsage().heapUsed - heap });
}
const output = openWordArtifact(run().bytes());
const mainRels = output.document.package.relationships(output.document.part.name).items;
let localShared = 0;
try { localShared = output.document.package.relationships(PartName.parse(fixture.partName)).items.filter(rel => /\/(styles|theme)$/.test(rel.type)).length; } catch (error) { if (!(error instanceof RelationshipsError) || error.code !== 'missing_item') throw error; }
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, cpuCount: cpus().length, warmups: 5, samples, exportsPerSample: 10,
  inputSha256: createHash('sha256').update(fixture.artifact.bytes()).digest('hex'),
  outputBytes: output.bytes().length, peakRssBytes: process.resourceUsage().maxRSS * 1024,
  parts: output.document.package.parts.length,
  mainSharedRelationships: mainRels.filter(rel => /\/(styles|theme)$/.test(rel.type)).length,
  storySharedRelationships: localShared,
  headingResolved: !!output.document.styles.style('Heading1'),
}, null, 2));
