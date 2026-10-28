import { expect, test } from 'bun:test';
import { openZipArchive } from '@tumblerjs/opc';
import {
  createWordNativeArchive, decodeWordNativeArchive, encodeWordNativeArchive, importWordContent,
  NativeWordDocument, openWordArtifact, openWordNativeArchive, type WordContentBlock,
} from '../src/index.ts';
import { scenarios } from '../../../tools/word-compatibility/scenarios.ts';

/** Change one ordinary source run, including in tables, without replacing drawing or field runs. */
function editedContent(blocks: readonly WordContentBlock[], formatting: boolean) {
  let changed = false;
  const visit = (blocks: readonly WordContentBlock[]): readonly WordContentBlock[] => blocks.map(block => {
    if (changed) return block;
    if (block.kind === 'table') return { ...block, rows: block.rows.map(row => row.map(cell => ({
      ...cell, blocks: visit(cell.blocks),
    }))) };
    if (block.kind !== 'paragraph') return block;
    return { ...block, runs: block.runs.map(run => {
      if (changed || !run.text || run.image || run.shape || run.ink || run.field || run.tab || run.breakType || /[\r\n\uFFFC]/.test(run.text)) return run;
      changed = true;
      return formatting
        ? { ...run, format: { ...run.format, bold: !run.format?.bold } }
        : { ...run, text: run.text + ' edited é 中 😀' };
    }) };
  });
  const result = visit(blocks);
  return changed ? result : [...result, { kind: 'paragraph' as const, runs: [{ text: 'New paragraph é 中 😀' }] }];
}

function samePackage(expected: Uint8Array, actual: Uint8Array) {
  const left = openZipArchive(expected), right = openZipArchive(actual);
  expect(right.entries.map(entry => entry.name).toSorted()).toEqual(left.entries.map(entry => entry.name).toSorted());
  for (const entry of left.entries)
    expect(right.read(right.get(entry.name)!)).toEqual(left.read(entry));
}

for (const scenario of scenarios) {
  test(`native and DOCX sources agree through edits, undo and repeated archival: ${scenario.id}`, async () => {
    const result = await scenario.run();
    for (const fixture of result.fixtures) {
      const source = openWordArtifact(fixture.bytes);
      const archive = createWordNativeArchive(source);
      const reopen = () => openWordNativeArchive(decodeWordNativeArchive(encodeWordNativeArchive(archive)));
      const restored = reopen();
      const baseline = importWordContent(source);
      const regular = new NativeWordDocument({ source, immutableContent: true });
      const native = new NativeWordDocument({ source: restored, immutableContent: true });
      const measure = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };
      const resources = archive.resources.map(bytes => bytes.slice());
      // Reuse warmed models and unchanged descendants while switching between edited and original content.
      for (const content of [editedContent(baseline, false), editedContent(baseline, true), baseline]) {
        regular.update(content);
        native.update(content);
        expect(native.paragraphs()).toEqual(regular.paragraphs());
        expect(native.layout(measure, { pageLimit: 3 })).toEqual(regular.layout(measure, { pageLimit: 3 }));
        const expected = regular.artifact(), actual = native.artifact();
        samePackage(expected.bytes(), actual.bytes());
        expect(importWordContent(actual)).toEqual(importWordContent(expected));
        // Exported changes must survive another native save/open, with the package still exact.
        const saved = openWordNativeArchive(decodeWordNativeArchive(encodeWordNativeArchive(createWordNativeArchive(actual))));
        expect(saved.bytes()).toEqual(actual.bytes());
        expect(importWordContent(saved)).toEqual(importWordContent(actual));
        expect(archive.resources).toEqual(resources);
        expect(reopen().bytes()).toEqual(fixture.bytes);
      }
    }
  });
}
