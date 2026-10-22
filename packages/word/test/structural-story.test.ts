import { expect, test } from 'bun:test';
import { openWordArtifact } from '../src/index.ts';
import { wordStoryArtifact, storyMainArtifact } from '../src/stories.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { ns, rel, p, open, paragraphs, selection, texts } from './structural-editor-fixture.ts';

for (const kind of ['header', 'footer'] as const) {
  test(`${kind} split stays in its story and preserves unrelated parts`, () => {
    const root = kind === 'header' ? 'hdr' : 'ftr';
    const main = openWordArtifact(buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${ns}" xmlns:r="${rel}"><w:body>${p('BODY')}<w:sectPr><w:${kind}Reference w:type="default" r:id="story"/></w:sectPr></w:body></w:document>`,
      relationships: [{ id: 'story', type: `${rel}/${kind}`, target: `${kind}.xml` }],
      parts: [{ itemName: `word/${kind}.xml`, contentType: `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`, xml: `<w:${root} xmlns:w="${ns}">${p('HEAD')}</w:${root}>` }],
    }));
    const story = wordStoryArtifact(main, `/word/${kind}.xml`);
    const edited = story.replaceText(selection(story, 2), '\n');
    expect(texts(edited)).toEqual(['HE', 'AD']);
    expect(storyMainArtifact(edited).document.source.source).toBe(main.document.source.source);
    expect(texts(story)).toEqual(['HEAD']);
  });
}

test('reopens retain limits, reset counters, and allow explicit replacement overrides', () => {
  const bytes = open(p('ab')).bytes();
  const artifact = openWordArtifact(bytes, { maxTextCharacters: 2, maxBlocks: 1, inkRendering: { maxPoints: 123 } });
  const changed = artifact.replaceText(selection(artifact, 0, 1), 'c');
  expect(texts(changed)).toEqual(['cb']);
  expect(changed.document.inkRendering).toEqual(artifact.document.inkRendering);
  expect(() => changed.replaceText(selection(changed, 0), 'x')).toThrow();
  expect(() => changed.replaceText(selection(changed, 1), '\n')).toThrow();
  expect(changed.bytes()).toEqual(changed.bytes().slice());
  const expanded = changed.replace(open(p('abc')).bytes(), { maxTextCharacters: 3 });
  expect(texts(expanded)).toEqual(['abc']);
});
