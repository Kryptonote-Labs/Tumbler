import { expect, test } from 'bun:test';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { openWordArtifact, createWordStory, importWordContent, NativeWordDocument, reconcileWordContent, wordStoryArtifact, type WordContentBlock } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { reconcileWordContentAndStories, reconcileWordStories } from '../src/content-export-batch.ts';

const paragraph = (text: string): WordContentBlock => ({ kind: 'paragraph', runs: [{ text }] });
const image = { bytes: new Uint8Array([137, 80, 78, 71, 1]), contentType: 'image/png' as const, width: 20, height: 30 };

function fixture() {
  const initial = reconcileWordContent(openWordArtifact(buildWordDocumentFixture()), [{ kind: 'paragraph', runs: [{ text: '\uFFFC', image }] }]);
  const header = createWordStory(initial, { kind: 'header', type: 'default', section: 0 });
  const footer = createWordStory(header.artifact, { kind: 'footer', type: 'default', section: 0 });
  return { source: footer.artifact, header: header.partName, footer: footer.partName };
}

function compare(edits: (parts: ReturnType<typeof fixture>) => {
  body: readonly WordContentBlock[];
  stories: readonly { partName: string; blocks: readonly WordContentBlock[] }[];
}) {
  const parts = fixture();
  const { body, stories } = edits(parts);
  const sequential = reconcileWordStories(reconcileWordContent(parts.source, body), stories);
  const combined = reconcileWordContentAndStories(parts.source, body, stories);
  expect(combined.bytes()).toEqual(sequential.bytes());
  expect(importWordContent(combined)).toEqual(importWordContent(sequential));
  for (const story of stories)
    expect(importWordContent(wordStoryArtifact(combined, story.partName))).toEqual(importWordContent(wordStoryArtifact(sequential, story.partName)));
  return { ...parts, body, stories, combined };
}

test('body numbering and media additions coexist with independent story links', () => {
  const result = compare(({ header, footer }) => ({
    body: [
      { kind: 'paragraph', list: { id: 'new-list', kind: 'decimal' }, runs: [{ text: 'List' }] },
      { kind: 'paragraph', runs: [{ text: '\uFFFC', image }] },
    ],
    stories: [header, footer].map(partName => ({ partName, blocks: [{ kind: 'paragraph', runs: [{ text: 'Link', link: 'https://example.com' }] }] })),
  }));
  const model = new NativeWordDocument({ source: result.source });
  model.update(result.body);
  for (const story of result.stories) model.updateStory(story.partName, story.blocks);
  expect(model.artifact().bytes()).toEqual(result.combined.bytes());
});

test('new body styles retain the sequential story interpretation', () => {
  compare(({ header }) => ({
    body: [{ kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'Title' }] }],
    stories: [{ partName: header, blocks: [paragraph('Header')] }],
  }));
});

test('a late story resource addition discards staged body and earlier story changes', () => {
  compare(({ header, footer }) => ({
    body: [{ kind: 'paragraph', list: { id: 'body-list', kind: 'decimal' }, runs: [{ text: 'Body' }] }],
    stories: [
      { partName: header, blocks: [paragraph('Header')] },
      { partName: footer, blocks: [{ kind: 'paragraph', list: { id: 'footer-list', kind: 'bullet' }, runs: [{ text: 'Footer' }] }] },
    ],
  }));
});

test('body drawing geometry changes retain the sequential resizing path', () => {
  compare(({ source, header }) => ({
    body: importWordContent(source).map(block => block.kind === 'paragraph' ? {
      ...block, runs: block.runs.map(run => run.image ? { ...run, image: { ...run.image, width: 50, height: 60 } } : run),
    } : block),
    stories: [{ partName: header, blocks: [paragraph('Header')] }],
  }));
});

test('repeated story targets are applied in order after the body', () => {
  compare(({ header }) => ({ body: [paragraph('Body')], stories: [
    { partName: header, blocks: [paragraph('First')] },
    { partName: header, blocks: [paragraph('Last')] },
  ] }));
});

test('body numbering additions do not silently reinterpret dangling story references', () => {
  const parts = fixture();
  const transaction = beginPackageTransaction(parts.source.document.package);
  transaction.replacePart(parts.header, new TextEncoder().encode(
    '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Unnumbered header</w:t></w:r></w:p></w:hdr>',
  ));
  const source = openWordArtifact(transaction.commit());
  const body: WordContentBlock[] = [{ kind: 'paragraph', list: { id: 'new-list', kind: 'decimal' }, runs: [{ text: 'Numbered body' }] }];
  const stories = [{ partName: parts.header, blocks: importWordContent(wordStoryArtifact(source, parts.header)) }];
  const sequential = reconcileWordStories(reconcileWordContent(source, body), stories);
  const combined = reconcileWordContentAndStories(source, body, stories);
  expect(combined.bytes()).toEqual(sequential.bytes());
  const header = importWordContent(wordStoryArtifact(combined, parts.header))[0];
  expect(header?.kind === 'paragraph' && header.list).toBeUndefined();
});
