import { expect, test } from 'bun:test';
import { NativeWordDocument, importWordContent, openWordArtifact, wordParagraphText } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const open = (runs: string) => openWordArtifact(buildWordDocumentFixture({ conformance, documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p>${runs}</w:p></w:body></w:document>` }));
  const selection = (artifact: ReturnType<typeof open>, start: number, end: number) => {
    const paragraphElementId = artifact.document.blocks[0]!.elementId;
    return { anchor: { paragraphElementId, offset: start }, focus: { paragraphElementId, offset: end } };
  };
  const text = (artifact: ReturnType<typeof open>) => {
    const paragraph = artifact.document.blocks[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    return wordParagraphText(artifact.document, paragraph);
  };
  for (const value of ['😀', 'e\u0301', '👩‍💻', '🇺🇳', '👍🏽']) {
    test(`${conformance}: text and formatting reject split grapheme ${value}`, () => {
      const artifact = open(`<w:r><w:t>${value}!</w:t></w:r>`);
      const before = artifact.bytes();
      for (let offset = 1; offset < value.length; offset++) {
        expect(() => artifact.applyFormatting(selection(artifact, 0, offset), { text: { bold: { set: true } } })).toThrow(RangeError);
        expect(() => artifact.applyFormatting(selection(artifact, offset, offset), { text: { bold: { set: true } } })).toThrow(RangeError);
        expect(() => artifact.replaceText(selection(artifact, offset, offset), 'x')).toThrow(RangeError);
      }
      expect(artifact.bytes()).toEqual(before);
      expect(text(artifact.applyFormatting(selection(artifact, 0, value.length), { text: { bold: { set: true } } }))).toBe(`${value}!`);
      expect(text(artifact.replaceText(selection(artifact, 0, value.length), `${value}${value}`))).toBe(`${value}${value}!`);
    });
  }
  test(`${conformance}: editing and formatting accept boundaries beside supplementary text`, () => {
    for (const value of ['🙂', '🡨', '👩‍💻', '🇺🇳', '👍🏽']) {
      const artifact = open(`<w:r><w:t>a${value}b</w:t></w:r>`);
      const start = 1;
      const end = start + value.length;
      expect(text(artifact.applyFormatting(selection(artifact, start, end), { text: { bold: { set: true } } }))).toBe(`a${value}b`);
      expect(text(artifact.replaceText(selection(artifact, start, end), 'X'))).toBe('aXb');
      expect(text(artifact.replaceText(selection(artifact, start, start), 'X'))).toBe(`aX${value}b`);
      expect(text(artifact.replaceText(selection(artifact, end, end), 'X'))).toBe(`a${value}Xb`);
    }
    // The shrunk CI edit history, seed 1455459784, inserts beside an existing emoji.
    const empty = open('<w:r><w:t></w:t></w:r>');
    const first = empty.replaceText(selection(empty, 0, 0), 'a');
    const second = first.replaceText(selection(first, 1, 1), '🙂');
    expect(text(second.replaceText(selection(second, 0, 1), ''))).toBe('🙂');
  });
  test(`${conformance}: native import retains literal CR/LF through later formatting and export`, () => {
    for (const entity of ['&#10;', '&#13;']) {
      const source = open(`<w:r><w:t xml:space="preserve">a${entity}b</w:t></w:r>`);
      const document = new NativeWordDocument({ source });
      expect(document.artifact()).toBe(source);
      const originalText = text(source);
      const nativeParagraph = document.blocks[0]!;
      if (nativeParagraph.kind !== 'paragraph') throw new Error('Expected paragraph');
      expect(wordParagraphText(undefined, nativeParagraph)).toBe(originalText);
      const content = importWordContent(source);
      const paragraph = content[0]!;
      if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
      document.update([{ ...paragraph, runs: paragraph.runs.map(run => ({ ...run, format: { ...run.format, bold: true } })) }]);
      const edited = document.artifact();
      expect(text(edited)).toBe(originalText);
      expect(edited.document.source.source).toContain(`a${entity}b`);
      expect(edited.document.source.elements(ns, 'b')).toHaveLength(1);
      const blocks = document.blocks;
      expect(() => document.update([{ ...paragraph, runs: paragraph.runs.map(run => ({ ...run, text: run.text + '\nnew' })) }])).toThrow();
      expect(document.blocks).toBe(blocks);
      expect(document.artifact()).toBe(edited);
    }
  });
  test(`${conformance}: insertion rejects invalid XML Unicode atomically`, () => {
    const artifact = open('<w:r><w:t>safe</w:t></w:r>');
    const before = artifact.bytes();
    for (const value of ['\ud800', '\udc00', '\x00', '\x01', '\x0b', '\ufffe', '\uffff', 'ok\n\ud800']) {
      expect(() => artifact.replaceText(selection(artifact, 1, 2), value)).toThrow();
      expect(artifact.bytes()).toEqual(before);
    }
  });
  test(`${conformance}: formatting preserves namespace scope inside run properties`, () => {
    for (const runs of [
      `<x:r xmlns:x="${ns}"><y:rPr xmlns:y="${ns}" xmlns:x="urn:extension"><y:lang y:val="en-GB"/></y:rPr><x:t>abc</x:t></x:r>`,
      `<r xmlns="${ns}"><rPr/><t>abc</t></r>`,
    ]) {
      const artifact = open(runs);
      const edited = artifact.applyFormatting(selection(artifact, 1, 2), { text: { bold: { set: true } } });
      expect(text(edited)).toBe('abc');
      const bold = edited.document.source.elements(ns, 'b');
      expect(bold).toHaveLength(1);
      expect(bold[0]!.attributes.some(attr => attr.namespaceUri === ns && attr.localName === 'val' && attr.value === '1')).toBe(true);
    }
  });
  test(`${conformance}: split runs retain local prefixes and source attributes`, () => {
    const artifact = open(`<x:r xmlns:x="${ns}" x:rsidR="00112233" x:rsidRPr="00445566"><y:rPr xmlns:y="${ns}"><y:lang y:val="en-GB"/></y:rPr><x:t>abc</x:t></x:r>`);
    const edited = artifact.applyFormatting(selection(artifact, 1, 2), { text: { bold: { set: true } } });
    expect(text(edited)).toBe('abc');
    const runs = edited.document.source.elements(ns, 'r');
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run.attributes.find(attr => attr.localName === 'rsidR')?.value).toBe('00112233');
      expect(run.attributes.find(attr => attr.localName === 'rsidRPr')?.value).toBe('00445566');
    }
    expect(edited.document.source.elements(ns, 'lang')).toHaveLength(3);
    expect(edited.document.source.elements(ns, 'b')).toHaveLength(1);
  });
}

test('native invalid text is rejected at update while retaining source and cached export', () => {
  const document = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text: 'safe' }] }] });
  const before = document.blocks;
  const exported = document.artifact();
  for (const text of ['a\nb', 'a\rb', '\ud800', '\x00', '\ufffe']) {
    expect(() => document.update([{ kind: 'paragraph', runs: [{ text }] }])).toThrow();
    expect(document.blocks).toBe(before);
    expect(document.artifact()).toBe(exported);
  }
});

test('grapheme boundaries are checked across source runs', () => {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const artifact = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>e</w:t></w:r><w:r><w:t>́</w:t></w:r></w:p></w:body></w:document>` }));
  const paragraphElementId = artifact.document.blocks[0]!.elementId;
  const target = { anchor: { paragraphElementId, offset: 0 }, focus: { paragraphElementId, offset: 1 } };
  expect(() => artifact.applyFormatting(target, { text: { bold: { set: true } } })).toThrow(RangeError);
  expect(() => artifact.replaceText(target, 'a')).toThrow(RangeError);
});

test('native valid supplementary, combining, ZWJ, tab and soft-break text exports', () => {
  const text = '😀 é 👩‍💻\tline\u2028next';
  const document = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text }] }] });
  const artifact = document.artifact();
  const paragraph = artifact.document.blocks[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(wordParagraphText(artifact.document, paragraph)).toBe(text);
});
