import { expect, test } from 'bun:test';
import { openWordArtifact } from '../src/index.ts';
import { wordStoryArtifact, storyMainArtifact } from '../src/stories.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { ns, rel, p, open, paragraphs, selection, texts } from './structural-editor-fixture.ts';

test('split keeps section boundary only on final continuation', () => {
  const artifact = open(`<w:p><w:pPr><w:jc w:val="center"/><w:sectPr><w:type w:val="continuous"/></w:sectPr></w:pPr><w:r><w:t>ab</w:t></w:r></w:p>${p('c')}<w:sectPr/>`);
  const edited = artifact.replaceText(selection(artifact, 1), '\nx\n');
  expect(texts(edited)).toEqual(['a', 'x', 'b', 'c']);
  expect(paragraphs(edited).map(item => item.section !== undefined)).toEqual([false, false, true, false]);
  expect(edited.document.source.elements(ns, 'jc')).toHaveLength(3);
});

for (const sectionIndex of [0, 1]) {
  for (const replacement of ['', '\n']) {
    test(`rejects range containing section boundary at ${sectionIndex} atomically`, () => {
      const sectionParagraph = '<w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>';
      const artifact = open(sectionIndex === 0 ? sectionParagraph + p('b') : p('a') + sectionParagraph);
      const before = artifact.bytes().slice();
      expect(() => artifact.replaceText(selection(artifact, 1, 0, 1), replacement)).toThrow();
      expect(artifact.bytes()).toEqual(before);
    });
  }
}
