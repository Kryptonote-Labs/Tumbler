// Run the same fixture/method against a checkout selected by WORD_LAYOUT_ROOT.
import { resolve } from 'node:path';
import { cpus } from 'node:os';
const root = process.env.WORD_LAYOUT_ROOT ?? process.cwd();
const { openOpcPackage } = await import(resolve(root, 'packages/opc/src/index.ts')) as typeof import('../../packages/opc/src/index.ts');
const { openWordDocument, layoutWordDocument } = await import(resolve(root, 'packages/word/src/index.ts')) as typeof import('../../packages/word/src/index.ts');
const { buildWordDocumentFixture } = await import(resolve(root, 'packages/word/test/document-fixture.ts')) as typeof import('../../packages/word/test/document-fixture.ts');
const fixture = (text: string) => openWordDocument(openOpcPackage(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="200" w:lineRule="exact"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="2400" w:h="1000"/><w:pgMar w:top="200" w:bottom="200" w:left="200" w:right="200"/></w:sectPr></w:body></w:document>` })));
const cases = [
  { name: 'spaces-budget', text: ' '.repeat(150_000), options: { maxCharacters: 1000, maxAtoms: 1000, maxMeasurements: 1001, maxFragments: 1, maxPages: 1 } },
  { name: 'spaces-permitted', text: ' '.repeat(150_000), options: { maxCharacters: 200_000, maxAtoms: 200_000, maxMeasurements: 200_001 } },
  { name: 'long-preview', text: 'word '.repeat(40_000), options: { pageLimit: 1 } },
  { name: 'ordinary-full', text: 'word '.repeat(200), options: {} },
];
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, cpuCount: cpus().length, warmups: 4, samples: 12 }));
for (const scenario of cases) {
  const document = fixture(scenario.text);
  const times: number[] = [], heaps: number[] = [];
  let measurements = 0, signature = '', fragments = 0;
  for (let i = -4; i < 12; i++) {
    Bun.gc(true);
    measurements = 0;
    const before = process.memoryUsage().heapUsed;
    const start = performance.now();
    try {
      const result = layoutWordDocument(document, { measure(text: string) { measurements++; return { width: text.length * 5, ascent: 8, descent: 2 }; } }, scenario.options);
      fragments = result.fragmentCount;
      signature = Bun.hash(JSON.stringify(result)).toString();
    } catch (error) { signature = error instanceof Error ? error.message : String(error); }
    const elapsed = performance.now() - start;
    if (i >= 0) { times.push(elapsed); heaps.push(process.memoryUsage().heapUsed - before); }
  }
  const rawMs = [...times], rawHeapDelta = [...heaps];
  times.sort((a,b) => a-b); heaps.sort((a,b) => a-b);
  console.log(JSON.stringify({ name: scenario.name, rawMs, rawHeapDelta, medianMs: times[6], minMs: times[0], maxMs: times.at(-1), medianHeapDelta: heaps[6], measurements, fragments, signature }));
}
