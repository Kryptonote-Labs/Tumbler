import { expect, test } from 'bun:test';
import { createWordArtifact, NativeWordDocument, WORD_LIST_KINDS, type WordContentBlock } from '../src/index.ts';

test('native and exported list markers agree for numbering formats and nested labels', () => {
  for (const kind of WORD_LIST_KINDS) for (const multilevel of [false, true]) {
    const blocks: WordContentBlock[] = [0, 1, 1, 0, 1].map((level, i) => ({ kind: 'paragraph', list: { id: 'list', kind, start: 3, level, multilevel, ...(kind === 'bullet' ? { marker: '▪' } : {}) }, runs: [{ text: `Item ${i}` }] }));
    const native = new NativeWordDocument(); native.update(blocks);
    const artifact = createWordArtifact({ blocks });
    expect([...native.listMarkers.values()].map(marker => marker.text)).toEqual([...artifact.document.numbering.markers(artifact.document).values()].map(marker => marker.text));
  }
});

test('mixed list levels retain their formats when authored and copied', () => {
  const blocks: WordContentBlock[] = (['decimal', 'lowerLetter', 'lowerRoman', 'none'] as const).map((kind, level) => ({ kind: 'paragraph', list: { id: 'outline', kind, level, start: 1 }, runs: [{ text: kind }] }));
  const native = new NativeWordDocument(); native.update(blocks);
  const artifact = native.artifact();
  expect([...native.listMarkers.values()].map(marker => marker.text)).toEqual(['1.', 'a.', 'i.', '']);
  expect([...artifact.document.numbering.markers(artifact.document).values()].map(marker => marker.text)).toEqual(['1.', 'a.', 'i.', '']);
});

test('conflicting definitions at the same list level reject in both authoring paths', () => {
  for (const changed of [{ marker: '▪' }, { multilevel: true }]) {
    const blocks: WordContentBlock[] = [{ kind: 'paragraph', list: { id: 'list', kind: 'bullet' }, runs: [{ text: 'A' }] }, { kind: 'paragraph', list: { id: 'list', kind: 'bullet', ...changed }, runs: [{ text: 'B' }] }];
    expect(() => new NativeWordDocument().update(blocks)).toThrow('A list level must use consistent numbering.');
    expect(() => createWordArtifact({ blocks })).toThrow('A list level must use consistent numbering.');
  }
});
