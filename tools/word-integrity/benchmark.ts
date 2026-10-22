import { cpus } from 'node:os';
import { openWordArtifact, wordParagraphText } from '../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';

const value = 'Hello 😀 é 👩‍💻 world. '.repeat(50);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const artifact = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:body></w:document>` }));
const paragraphElementId = artifact.document.blocks[0]!.elementId;
const selection = { anchor: { paragraphElementId, offset: 0 }, focus: { paragraphElementId, offset: 5 } };
const operations = {
  format: () => artifact.applyFormatting(selection, { text: { bold: { set: true } } }),
  insert: () => artifact.replaceText(selection, 'Hallo'),
};
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, utf16Units: value.length, warmups: 20, samples: 9, operationsPerSample: 50 }));
for (const [name, operation] of Object.entries(operations)) {
  for (let i = 0; i < 20; i++) operation();
  const ms: number[] = [];
  const heapDeltaBytes: number[] = [];
  for (let sample = 0; sample < 9; sample++) {
    Bun.gc(true);
    const heap = process.memoryUsage().heapUsed;
    const start = performance.now();
    for (let i = 0; i < 50; i++) operation();
    ms.push(performance.now() - start);
    heapDeltaBytes.push(process.memoryUsage().heapUsed - heap);
  }
  const result = operation();
  const paragraph = result.document.blocks[0]!;
  if (paragraph.kind !== 'paragraph' || wordParagraphText(result.document, paragraph) !== (name === 'insert' ? 'Hallo' + value.slice(5) : value)) throw new Error('Text changed');
  console.log(JSON.stringify({ name, operations: 450, ms, medianMs: [...ms].sort((a,b) => a-b)[4], heapDeltaBytes, memoryNote: 'Observed heap growth, includes GC variability; not allocated bytes', textEquivalent: true }));
}
