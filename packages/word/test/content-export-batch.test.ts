import { expect, test } from 'bun:test';
import { openWordArtifact, createWordStory, importWordContent, reconcileWordContent, wordStoryArtifact, type WordContentBlock } from '../src/index.ts';
import { reconcileWordStories } from '../src/content-export-batch.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { storyMainArtifact } from '../src/stories.ts';

const paragraph = (text: string): WordContentBlock => ({ kind: 'paragraph', runs: [{ text }] });
function fixture() {
  const header = createWordStory(openWordArtifact(buildWordDocumentFixture()), { kind: 'header', type: 'default', section: 0 });
  const footer = createWordStory(header.artifact, { kind: 'footer', type: 'default', section: 0 });
  return { source: footer.artifact, header: header.partName, footer: footer.partName };
}

function compare(updates: (parts: ReturnType<typeof fixture>) => { partName: string; blocks: readonly WordContentBlock[] }[]) {
  const parts = fixture();
  const edits = updates(parts);
  const sequential = edits.reduce((source, edit) => storyMainArtifact(reconcileWordContent(wordStoryArtifact(source, edit.partName), edit.blocks)), parts.source);
  const batched = reconcileWordStories(parts.source, edits);
  expect(batched.bytes()).toEqual(sequential.bytes());
  expect(importWordContent(batched)).toEqual(importWordContent(parts.source));
  for (const edit of edits) expect(importWordContent(wordStoryArtifact(batched, edit.partName))).toEqual(importWordContent(wordStoryArtifact(sequential, edit.partName)));
  return batched;
}

test('batched story text, formatting and hyperlinks match sequential exports', () => {
  compare(({ header, footer }) => [
    { partName: header, blocks: [{ kind: 'paragraph', runs: [{ text: 'Header', link: 'https://example.com/header', format: { bold: true } }] }] },
    { partName: footer, blocks: [{ kind: 'paragraph', alignment: 'center', runs: [{ text: 'Footer', link: 'https://example.com/footer', format: { italic: true } }] }] },
  ]);
});

test('late shared-resource edits discard staged changes before sequential fallback', () => {
  compare(({ header, footer }) => [
    { partName: header, blocks: [paragraph('Staged header')] },
    { partName: footer, blocks: [{ kind: 'paragraph', list: { id: 'list', kind: 'decimal' }, runs: [{ text: 'Numbered footer' }] }] },
  ]);
});

test('numbering and style additions in multiple stories retain distinct resources', () => {
  compare(({ header, footer }) => [
    { partName: header, blocks: [{ kind: 'paragraph', styleId: 'Heading1', list: { id: 'header-list', kind: 'decimal' }, runs: [{ text: 'Header list' }] }] },
    { partName: footer, blocks: [{ kind: 'paragraph', styleId: 'Heading2', list: { id: 'footer-list', kind: 'bullet' }, runs: [{ text: 'Footer list' }] }] },
  ]);
});

test('new images in separate stories retain their own parts and relationships', () => {
  compare(({ header, footer }) => [header, footer].map((partName, i) => ({
    partName,
    blocks: [{ kind: 'paragraph', runs: [{ text: '\uFFFC', image: { bytes: new Uint8Array([137, 80, 78, 71, i]), contentType: 'image/png', width: 20 + i, height: 30 } }] }],
  })));
});

test('repeated edits of the same story resolve sequentially', () => {
  compare(({ header }) => [
    { partName: header, blocks: [paragraph('First')] },
    { partName: header, blocks: [paragraph('Last')] },
  ]);
});
