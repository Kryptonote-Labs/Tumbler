import { expect, test } from 'bun:test';
import { openWordArtifact } from '../src/index.ts';
import { wordStoryArtifact, storyMainArtifact } from '../src/stories.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { ns, rel, p, open, paragraphs, selection, texts } from './structural-editor-fixture.ts';

for (const control of ['tab', 'br', 'cr']) {
  test(`inserts before ${control} within a formatted mixed run`, () => {
    const artifact = open(`<w:p><w:r><w:rPr><w:b/></w:rPr><w:${control}/><w:t>B</w:t></w:r></w:p>`);
    const edited = artifact.replaceText(selection(artifact, 0), 'A');
    expect(texts(edited)).toEqual(['A' + texts(artifact)[0]]);
    expect(edited.formattingState(selection(edited, 0, 1)).text.bold).toMatchObject({ value: true });
  });
}

for (const affinity of ['before', 'after'] as const) {
  for (const offset of [0, 1, 2, 3]) {
    test(`mixed controls insert at offset ${offset}, affinity ${affinity}`, () => {
      const artifact = open('<w:p><w:r><w:rPr><w:b/></w:rPr><w:tab/><w:br/><w:t>B</w:t></w:r></w:p>');
      const original = texts(artifact)[0]!;
      const range = selection(artifact, offset);
      const edited = artifact.replaceText({ anchor: range.anchor, focus: { ...range.focus, affinity } }, 'X');
      expect(texts(edited)).toEqual([original.slice(0, offset) + 'X' + original.slice(offset)]);
      expect(edited.formattingState(selection(edited, offset, offset + 1)).text.bold).toMatchObject({ value: true });
    });
  }
}

test('simple page field insertion still creates a paragraph-level run', () => {
  const artifact = open('<w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>');
  const edited = artifact.replaceText(selection(artifact, 1), 'X');
  expect(texts(edited)).toEqual(['\uFFFCX']);
  const paragraph = edited.document.source.element(paragraphs(edited)[0]!.elementId)!;
  expect(paragraph.children.filter(child => child.kind === 'element').map(child => child.localName)).toEqual(['fldSimple', 'r']);
});
