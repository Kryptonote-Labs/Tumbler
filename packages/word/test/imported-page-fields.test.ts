import { expect, test } from 'bun:test';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact, reconcileWordContent, wordStoryArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 8, descent: 2 }) };
const complex = (instruction: string, result: string) => `<w:r><w:fldChar w:fldCharType="begin"/><w:instrText>${instruction.slice(0, 2)}</w:instrText></w:r><w:r><w:instrText>${instruction.slice(2)}</w:instrText><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>${result}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
function fixture() {
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body>${[1, 2, 3].map(i => `<w:p><w:r><w:t>Page ${i}</w:t>${i < 3 ? '<w:br w:type="page"/>' : ''}</w:r></w:p>`).join('')}<w:sectPr><w:titlePg/><w:footerReference w:type="first" r:id="first"/><w:footerReference w:type="default" r:id="default"/></w:sectPr></w:body></w:document>`,
    relationships: ['first', 'default'].map(id => ({ id, type: `${r}/footer`, target: `${id}.xml` })),
    parts: ['first', 'default'].map((id, i) => ({ itemName: `word/${id}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
      xml: `<w:ftr xmlns:w="${w}"><w:p><w:r><w:t xml:space="preserve">Page </w:t></w:r>${complex('PAGE \\* MERGEFORMAT', String(i + 1))}<w:r><w:t xml:space="preserve"> of </w:t></w:r>${complex('NUMPAGES', '99')}</w:p></w:ftr>` })),
  }));
}

test('complex PAGE and NUMPAGES fields recalculate in first and shared footers', () => {
  const artifact = fixture();
  const expected = ['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3'];
  const text = (layout: ReturnType<typeof layoutWordDocument>) => layout.pages.map(page => page.footerLines.flatMap(line => line.fragments.map(f => f.text)).join(''));
  expect(text(layoutWordDocument(artifact.document, measure))).toEqual(expected);
  const native = new NativeWordDocument({ source: artifact });
  native.update(importWordContent(artifact));
  for (const story of artifact.document.headerFooters)
    native.updateStory(story.part.name.value, importWordContent(wordStoryArtifact(artifact, story.part.name.value)));
  expect(text(native.layout(measure))).toEqual(expected);
  expect(text(layoutWordDocument(openWordArtifact(native.artifact().bytes()).document, measure))).toEqual(expected);
});

test('editing and deleting complex fields removes their entire cached representation on export', () => {
  const story = wordStoryArtifact(fixture(), '/word/default.xml');
  const paragraph = importWordContent(story)[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(paragraph.runs.filter(run => run.field).map(run => [run.field, run.format?.bold])).toEqual([['PAGE', true], ['NUMPAGES', true]]);
  const edited = reconcileWordContent(story, [{ ...paragraph, runs: [{ text: 'Edited ' }, ...paragraph.runs] }]);
  const xml = edited.document.source.source;
  expect(xml).not.toContain('fldChar');
  expect(xml).not.toContain('instrText');
  expect(xml).not.toContain('>99<');
  expect(importWordContent(edited)[0]).toMatchObject({ runs: expect.arrayContaining([expect.objectContaining({ field: 'PAGE' })]) });
  const deleted = reconcileWordContent(story, [{ ...paragraph, runs: paragraph.runs.filter(run => !run.field) }]);
  expect(deleted.document.source.source).not.toContain('fldChar');
  expect(deleted.document.source.source).not.toContain('fldSimple');
  expect(deleted.document.source.source).not.toContain('>99<');
});
