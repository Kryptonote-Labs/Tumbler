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
