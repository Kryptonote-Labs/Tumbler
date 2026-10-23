import { cpus } from 'node:os';
import { createWordArtifact, importWordContent, reconcileWordContent, NativeWordDocument } from '../../packages/word/src/index.ts';
import { WordError } from '../../packages/word/src/document.ts';
import { WordNumbering } from '../../packages/word/src/numbering.ts';

const source = createWordArtifact({ paragraphs: Array.from({ length: 100 }, (_, i) => ({ runs: [{ text: `Item ${i}` }], list: { id: 'items', kind: 'decimal' as const } })) });
const content = importWordContent(source);
const last = content.at(-1)!;
if (last.kind !== 'paragraph' || !last.list) throw new Error('Missing list');
content.push({ kind: 'paragraph', runs: [{ text: 'Appended' }], list: last.list });
const numbering = (start: number) => new WordNumbering({ abstracts: [{ id: 1, levels: [{ level: 0, start, format: 'upperRoman', text: '%1.', suffix: 'tab', indentStartTwips: undefined, hangingTwips: undefined }] }], instances: [{ id: 1, abstractId: 1, startOverrides: new Map(), levelOverrides: new Map() }] });
const refs = Array.from({ length: 8 }, (_, elementId) => ({ elementId, reference: { numId: 1, level: 0 } }));
const large = numbering(2147483647);
const ordinary = numbering(1);
function markers(n: WordNumbering, maxCharacters?: number) {
  try { return { texts: [...n.markersFor(refs, maxCharacters === undefined ? {} : { maxCharacters }).values()].map(m => m.text), error: null }; }
  catch (error) { if (error instanceof WordError) return { texts: [], error: error.code }; throw error; }
}
function continuation() { const a = reconcileWordContent(source, content); return { texts: [...a.document.numbering.markers(a.document).values()].map(m => m.text), error: null }; }
const native = new NativeWordDocument({ source, content });
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, warmups: 2, samples: 7, operationsPerSample: 1, nativeLast: native.listMarkers.get(native.blocks.at(-1)!.elementId)?.text, exportLast: continuation().texts.at(-1), ordinary: markers(ordinary), romanFirstLength: markers(large).texts[0]?.length ?? 0 }));
for (const [name, run] of [['roman-large-default-8', () => markers(large)], ['roman-large-opt-in-8', () => markers(large, 20_000_000)], ['roman-ordinary-8', () => markers(ordinary)], ['continuation-101', continuation]] as const) {
  if (process.argv[2] && name !== process.argv[2]) continue;
  for (let i = 0; i < 2; i++) run();
  const samples = [];
  for (let i = 0; i < 7; i++) {
    Bun.gc(true);
    const before = process.memoryUsage();
    const start = performance.now();
    const output = run();
    // Consume strings, including ropes, identically in both versions.
    let checksum = 0, characters = 0;
    for (const text of output.texts) { characters += text.length; for (let j = 0; j < text.length; j++) checksum = (checksum + text.charCodeAt(j)) >>> 0; }
    const ms = performance.now() - start;
    const after = process.memoryUsage();
    samples.push({ ms, error: output.error, characters, utf16Bytes: characters * 2, checksum, heapDelta: after.heapUsed - before.heapUsed, rssDelta: after.rss - before.rss });
  }
  console.log(JSON.stringify({ name, samples }));
}
