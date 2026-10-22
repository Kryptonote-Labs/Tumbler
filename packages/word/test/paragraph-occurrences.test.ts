import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, openWordArtifact, reconcileWordContent, wordStoryArtifact } from '../src/index.ts';
import { wordParagraphRenderer } from '../src/package-paragraphs.ts';
import { PackageXml } from '../src/package-xml.ts';
import { contentCopyScopes } from '../src/package-copies.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

test.each([0, 256])('source finalization stays linear with %i empty continuations', emptyContinuations => {
  const size = 256;
  const source = createWordArtifact({ paragraphs: [{ runs: Array.from({ length: size }, () => ({ text: 'x' })) }] });
  const imported = importWordContent(source).filter(p => p.kind === 'paragraph');
  const paragraphs = [...imported, ...Array.from({ length: emptyContinuations }, () => ({ ...imported[0]!, runs: [] }))];
  let reads = 0;
  const originals = imported.map(p => ({ ...p, runs: p.runs.map(run => ({ ...run,
    get source() { reads++; return run.source!; },
  })) }));
  const markup = new PackageXml(source.document);
  const generated = createWordArtifact({ paragraphs });
  const render = wordParagraphRenderer(markup, originals, paragraphs, generated, value => value, value => value,
    contentCopyScopes(paragraphs, markup), new Set());
  reads = 0;
  const output = paragraphs.map(render).join('');
  expect(output.match(/<w:t\b/g)).toHaveLength(size);
  // Count source accesses rather than wall time, independent of machine load.
  expect(reads).toBeLessThanOrEqual(size * 4);
});

for (const namespace of ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']) {
  const fixture = () => openWordArtifact(buildWordDocumentFixture({
    conformance: namespace.includes('purl') ? 'strict' : 'transitional',
    documentXml: `<w:document xmlns:w="${namespace}"><w:body><w:p><w:bookmarkStart w:id="1" w:name="range"/><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p></w:body></w:document>`,
  }));
  test(`duplicate occurrences defer trailing markup until the final split in ${namespace}`, () => {
    const source = fixture();
    const p = importWordContent(source)[0]!;
    if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
    const a = p.runs[0]!;
    const output = reconcileWordContent(source, [{ ...p, runs: [a] }, { ...p, runs: [a] }, { ...p, runs: [] }]);
    const xml = output.document.source.source;
    expect(xml.match(/bookmarkStart/g)).toHaveLength(1);
    expect(xml.match(/bookmarkEnd/g)).toHaveLength(1);
    expect(xml.lastIndexOf('>A</w:t>')).toBeLessThan(xml.indexOf('<w:bookmarkEnd'));
    expect(importWordContent(output).filter(b => b.kind === 'paragraph').map(b => b.runs.map(r => r.text).join(''))).toEqual(['A', 'A', '']);
  });
  test(`reordered controls and independent copies retain marker pairs in ${namespace}`, () => {
    const source = fixture();
    const p = importWordContent(source)[0]!;
    if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
    const reversed = { ...p, runs: p.runs.toReversed() };
    const copy = { ...p, sourceCopy: 'copy', runs: p.runs.map(r => ({ ...r })) };
    const output = reconcileWordContent(source, [reversed, copy]);
    const xml = output.document.source.source;
    expect(xml.match(/bookmarkStart/g)).toHaveLength(2);
    expect(xml.match(/bookmarkEnd/g)).toHaveLength(2);
    expect(xml).toContain('tumbler_copy_1');
    expect(importWordContent(output).filter(b => b.kind === 'paragraph').map(b => b.runs.map(r => r.text).join('')))
      .toEqual([p.runs.toReversed().map(r => r.text).join(''), p.runs.map(r => r.text).join('')]);
  });
  test(`deleting every run retains opaque before and trailing markup once in ${namespace}`, () => {
    const source = fixture();
    const p = importWordContent(source)[0]!;
    if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
    const output = reconcileWordContent(source, [{ ...p, runs: [] }, { ...p, runs: [] }]);
    expect(output.document.source.source.match(/bookmarkStart/g)).toHaveLength(1);
    expect(output.document.source.source.match(/bookmarkEnd/g)).toHaveLength(1);
    expect(output.document.source.elements(namespace, 't')).toHaveLength(0);
  });
  test(`run copy scopes finalize independently inside a new paragraph in ${namespace}`, () => {
    const source = fixture();
    const p = importWordContent(source)[0]!;
    if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
    const a = p.runs[0]!;
    const output = reconcileWordContent(source, [{ kind: 'paragraph', runs: [
      { ...a, sourceCopy: 'run-copy' }, { ...a }, { ...a, sourceCopy: 'run-copy' },
    ] }]);
    const xml = output.document.source.source;
    expect(xml.match(/bookmarkStart/g)).toHaveLength(2);
    expect(xml.match(/bookmarkEnd/g)).toHaveLength(2);
    const elements = output.document.source.elements();
    const texts = elements.filter(e => e.localName === 't');
    const ends = elements.filter(e => e.localName === 'bookmarkEnd');
    expect(texts[1]!.span.end).toBeLessThanOrEqual(ends[0]!.span.start);
    expect(ends[0]!.span.end).toBeLessThanOrEqual(texts[2]!.span.start);
    expect(texts[2]!.span.end).toBeLessThanOrEqual(ends[1]!.span.start);
  });
}

test('header fields count duplicate occurrences in their own copy scopes', () => {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${ns}" xmlns:r="${relationships}"><w:body><w:p/><w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:body></w:document>`,
    relationships: [{ id: 'header', type: `${relationships}/header`, target: 'header.xml' }],
    parts: [{ itemName: 'word/header.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
      xml: `<w:hdr xmlns:w="${ns}"><w:p><w:bookmarkStart w:id="7" w:name="page"/><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:bookmarkEnd w:id="7"/></w:p></w:hdr>` }],
  }));
  const story = wordStoryArtifact(source, '/word/header.xml');
  const p = importWordContent(story)[0]!;
  if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
  const field = p.runs[0]!;
  expect(field.field).toBe('PAGE');
  const output = reconcileWordContent(story, [{ ...p, runs: [field, { ...field }] },
    { ...p, sourceCopy: 'copy', runs: [{ ...field }] }]);
  const xml = output.document.source.source;
  expect(output.document.part.name.value).toBe('/word/header.xml');
  expect(xml.match(/<w:fldSimple/g)).toHaveLength(3);
  expect(xml.match(/bookmarkEnd/g)).toHaveLength(2);
  const elements = output.document.source.elements();
  const fields = elements.filter(e => e.localName === 'fldSimple');
  const ends = elements.filter(e => e.localName === 'bookmarkEnd');
  expect(fields[1]!.span.end).toBeLessThanOrEqual(ends[0]!.span.start);
  expect(ends[0]!.span.end).toBeLessThanOrEqual(fields[2]!.span.start);
});

test('joined runs finish each source owner at its last occurrence', () => {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${ns}"><w:body>${['A', 'B'].map((text, id) =>
      `<w:p><w:bookmarkStart w:id="${id}" w:name="${text}"/><w:r><w:t>${text}</w:t></w:r><w:bookmarkEnd w:id="${id}"/></w:p>`).join('')}</w:body></w:document>`,
  }));
  const paragraphs = importWordContent(source).filter(p => p.kind === 'paragraph');
  const [a, b] = paragraphs;
  const output = reconcileWordContent(source, [{ ...a!, runs: [b!.runs[0]!, a!.runs[0]!, { ...b!.runs[0]! }] },
    { ...b!, runs: [] }]);
  const order = output.document.source.elements().flatMap(e => e.localName === 't' ? ['text']
    : e.localName === 'bookmarkEnd' ? [`end-${e.attributes.find(a => a.localName === 'id')?.value}`] : []);
  expect(order).toEqual(['text', 'text', 'end-0', 'text', 'end-1']);
});
