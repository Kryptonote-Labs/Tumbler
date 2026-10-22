// Run before and after with the same Bun binary and no concurrent tests.
import { cpus } from 'node:os';
import { createWordArtifact } from '../../packages/word/src/index.ts';
import { openWordOperationDocument, prepareWordOperation } from '../../packages/word/src/operations/index.ts';
import { complexField, deleteField, fieldArtifact, textRun, visible } from '../../packages/word/test/field-editing-fixture.ts';
const complex = fieldArtifact(`<w:p>${textRun('L')}${complexField('PAGE', textRun('1'))}${textRun('R')}</w:p>`);
const nested = fieldArtifact(`<w:p>${complexField('IF', textRun('A') + complexField('REF x', textRun('B')) + textRun('C'))}${textRun('D')}</w:p>`);
const move = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', field: 'PAGE' }, { text: 'abc' }] }] });
const insertion = createWordArtifact({ paragraphs: [{ runs: [{ text: 'one' }] }, { runs: [{ text: 'two' }] }] });
const cases = {
  delete: () => visible(deleteField(complex)) === 'LR',
  nested: () => visible(nested) === 'ABCD',
  move: () => {
    const session = openWordOperationDocument(move);
    try {
      session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 1 }, { name: 'move-object', input: { destination: 4 } }).delta);
      return session.artifact().document.source.source.includes('w:instr="PAGE"');
    } finally { session.destroy(); }
  },
  insert: () => {
    const session = openWordOperationDocument(insertion);
    try {
      session.text.applyDelta(prepareWordOperation(session.text, { start: 4, end: 4 }, { name: 'page-number', input: { preset: 'plain' } }).delta);
      return session.artifact().document.source.source.includes('w:instr="PAGE"');
    } finally { session.destroy(); }
  },
};
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, warmups: 20, samples: 7, operationsPerSample: 100 }));
for (const [name, operation] of Object.entries(cases)) {
  const run = () => { try { return operation(); } catch { return false; } };
  for (let i = 0; i < 20; i++) run();
  const samples = [];
  let correct = 0;
  for (let sample = 0; sample < 7; sample++) {
    Bun.gc(true);
    const before = process.memoryUsage().heapUsed;
    const start = performance.now();
    for (let i = 0; i < 100; i++) correct += Number(run());
    samples.push({ ms: performance.now() - start, heapGrowthBytes: process.memoryUsage().heapUsed - before });
  }
  console.log(JSON.stringify({ name, correct, operations: 700, samples }));
}
