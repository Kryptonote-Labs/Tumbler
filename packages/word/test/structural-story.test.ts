import { expect, test } from 'bun:test';
import { openWordArtifact, wordParagraphText } from '../src/index.ts';
import { wordStoryArtifact, storyMainArtifact } from '../src/stories.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { ns, rel, p, open, paragraphs, selection, texts } from './structural-editor-fixture.ts';

for (const conformance of ['transitional', 'strict'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
for (const kind of ['header', 'footer'] as const) {
  test(`${conformance} ${kind} split stays in its story and preserves unrelated parts`, () => {
    const root = kind === 'header' ? 'hdr' : 'ftr';
    const main = openWordArtifact(buildWordDocumentFixture({
      conformance,
      documentXml: `<w:document xmlns:w="${ns}" xmlns:r="${rel}"><w:body>${p('BODY')}<w:sectPr><w:${kind}Reference w:type="default" r:id="story"/></w:sectPr></w:body></w:document>`,
      relationships: [{ id: 'story', type: `${rel}/${kind}`, target: `${kind}.xml` }],
      parts: [{ itemName: `word/${kind}.xml`, contentType: `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`, xml: `<w:${root} xmlns:w="${ns}">${p('HEAD')}</w:${root}>` }],
    }));
    const story = wordStoryArtifact(main, `/word/${kind}.xml`);
    const edited = story.replaceText(selection(story, 2), '\n');
    expect(texts(edited)).toEqual(['HE', 'AD']);
    expect(storyMainArtifact(edited).document.source.source).toBe(main.document.source.source);
    expect(texts(story)).toEqual(['HEAD']);
    for (const part of main.document.package.parts) {
      if (part.name.value === story.document.part.name.value) continue;
      const next = edited.document.package.getPart(part.name)!;
      expect(edited.document.package.readPart(next)).toEqual(main.document.package.readPart(part));
    }
    const joined = edited.replaceText(selection(edited, 2, 0, 1), '');
    expect(texts(joined)).toEqual(['HEAD']);
    expect(storyMainArtifact(joined).document.source.source).toBe(main.document.source.source);
  });
}

}

test('reopens retain limits, reset counters, and allow explicit replacement overrides', () => {
  const bytes = open(p('ab')).bytes();
  const artifact = openWordArtifact(bytes, { maxTextCharacters: 2, maxBlocks: 1, inkRendering: { maxPoints: 123 } });
  const changed = artifact.replaceText(selection(artifact, 0, 1), 'c');
  expect(texts(changed)).toEqual(['cb']);
  expect(changed.document.inkRendering).toEqual(artifact.document.inkRendering);
  const before = changed.bytes().slice();
  expect(() => changed.replaceText(selection(changed, 0), 'x')).toThrow();
  expect(() => changed.replaceText(selection(changed, 1), '\n')).toThrow();
  expect(changed.bytes()).toEqual(before);
  const expanded = changed.replace(open(p('abc')).bytes(), { maxTextCharacters: 3 });
  expect(texts(expanded)).toEqual(['abc']);
});


test('inline limits remain effective after a revision', () => {
  const artifact = openWordArtifact(open(p('ab')).bytes(), { maxInlineItems: 2 });
  const edited = artifact.replaceText(selection(artifact, 0, 1), 'c');
  const before = edited.bytes().slice();
  expect(() => edited.replaceText(selection(edited, 1), '\t')).toThrow();
  expect(edited.bytes()).toEqual(before);
});

test('splits inside a table cell preserve the other cell and body', () => {
  const artifact = open('<w:tbl><w:tr><w:tc>' + p('CELL') + '</w:tc><w:tc>' + p('OTHER') + '</w:tc></w:tr></w:tbl>' + p('BODY'));
  const table = artifact.document.blocks[0]!;
  if (table.kind !== 'table') throw new Error('Expected table');
  const paragraph = table.rows[0]!.cells[0]!.blocks[0]!;
  const position = { paragraphElementId: paragraph.elementId, offset: 2 };
  const edited = artifact.replaceText({ anchor: position, focus: position }, '\n');
  const updated = edited.document.blocks[0]!;
  if (updated.kind !== 'table') throw new Error('Expected table');
  expect(updated.rows[0]!.cells[0]!.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(edited.document, block))).toEqual(['CE', 'LL']);
  const oldCell = artifact.document.source.element(table.rows[0]!.cells[1]!.elementId)!;
  const newCell = edited.document.source.element(updated.rows[0]!.cells[1]!.elementId)!;
  expect(edited.document.source.source.slice(newCell.span.start, newCell.span.end)).toBe(artifact.document.source.source.slice(oldCell.span.start, oldCell.span.end));
  expect(texts(edited)).toEqual(['BODY']);
});
