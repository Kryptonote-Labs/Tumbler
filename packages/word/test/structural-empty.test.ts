import { expect, test } from 'bun:test';
import { openWordArtifact } from '../src/index.ts';
import { wordStoryArtifact, storyMainArtifact } from '../src/stories.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { ns, rel, p, open, paragraphs, selection, texts } from './structural-editor-fixture.ts';

test('joins self-closing empty paragraph', () => {
  const artifact = open('<w:p/>' + p('B'));
  expect(texts(artifact.replaceText(selection(artifact, 0, 0, 1), ''))).toEqual(['B']);
});
