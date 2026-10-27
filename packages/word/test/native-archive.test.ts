import { expect, test } from 'bun:test';
import { openZipArchive } from '@tumblerjs/opc';
import {
  createWordArtifact, openWordArtifact, createWordNativeArchive, openWordNativeArchive, encodeWordNativeArchive,
  decodeWordNativeArchive, NativeWordDocument, importWordContent, wordParagraphText,
} from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { preservationScenarios } from '../../../tools/word-compatibility/preservation/scenarios.ts';

const native = (artifact: ReturnType<typeof createWordArtifact>) =>
  openWordNativeArchive(decodeWordNativeArchive(encodeWordNativeArchive(createWordNativeArchive(artifact))));

function sameParts(before: Uint8Array, after: Uint8Array, edited = new Set<string>()) {
  const left = openZipArchive(before), right = openZipArchive(after);
  expect(right.entries.map(entry => entry.name).toSorted()).toEqual(left.entries.map(entry => entry.name).toSorted());
  for (const entry of left.entries) if (!edited.has(entry.name))
    expect(right.read(right.get(entry.name)!)).toEqual(left.read(entry));
}

test('native storage owns package members and compiled semantics after the original DOCX is gone', () => {
  const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: 'First', format: { bold: true } }, { text: ' second' }] }] });
  const original = artifact.bytes().slice();
  const encoded = encodeWordNativeArchive(createWordNativeArchive(artifact));
  const restored = openWordNativeArchive(decodeWordNativeArchive(encoded));
  sameParts(original, restored.bytes());
  expect(importWordContent(restored)).toEqual(importWordContent(artifact));
  const model = new NativeWordDocument({ source: restored });
  const blocks = importWordContent(restored).map(block => block.kind === 'paragraph'
    ? { ...block, runs: block.runs.map(run => ({ ...run, text: run.text.replace('second', 'native') })) } : block);
  model.update(blocks);
  const exported = model.artifact();
  const paragraph = exported.document.blocks[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(wordParagraphText(exported.document, paragraph)).toBe('First native');
  sameParts(original, exported.bytes(), new Set(['word/document.xml']));
  expect(native(exported).document.blocks).toEqual(exported.document.blocks);
});

test('native resources retain unknown blocks, inline markup, attributes, XML encoding and unrelated parts', () => {
  const original = buildWordDocumentFixture({
    documentXml: '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="urn:unknown" x:attribute="opaque"><w:body><w:p><w:r x:run="unknown"><w:rPr><x:effect value="keep"/></w:rPr><w:t>Hello</w:t></w:r><x:marker data="preserve"/></w:p><x:block><x:payload><![CDATA[untouched]]></x:payload></x:block><w:p><w:r><w:t>Tail</w:t></w:r></w:p></w:body></w:document>',
    parts: [{ itemName: 'customXml/item1.xml', contentType: 'application/xml', xml: '<unknown xmlns="urn:opaque"> retained bytes </unknown>' }],
  });
  const restored = native(openWordArtifact(original));
  sameParts(original, restored.bytes());
  const model = new NativeWordDocument({ source: restored, content: importWordContent(restored).map(block => block.kind === 'paragraph'
    ? { ...block, runs: block.runs.map(run => ({ ...run, text: run.text.replace('Hello', 'Edited') })) } : block) });
  const exported = model.artifact();
  const xml = exported.document.source.source;
  for (const retained of ['x:attribute="opaque"', 'x:run="unknown"', '<x:effect value="keep"/>', '<x:marker data="preserve"/>', '<x:block><x:payload><![CDATA[untouched]]></x:payload></x:block>'])
    expect(xml).toContain(retained);
  sameParts(original, exported.bytes(), new Set(['word/document.xml']));
});

test('native archives reject missing, corrupted and truncated resources', () => {
  const archive = createWordNativeArchive(createWordArtifact({ paragraphs: [{ runs: [{ text: 'Retained' }] }] }));
  expect(() => openWordNativeArchive({ ...archive, resources: archive.resources.slice(1) })).toThrow();
  const corrupted = archive.resources.map(bytes => bytes.slice());
  corrupted[0]![0] = corrupted[0]![0]! ^ 1;
  expect(() => openWordNativeArchive({ ...archive, resources: corrupted })).toThrow('integrity');
  const bytes = encodeWordNativeArchive(archive);
  expect(() => decodeWordNativeArchive(bytes.subarray(0, bytes.length - 1))).toThrow();
  const wrongModel = bytes.slice();
  const at = wrongModel.length - archive.resources.reduce((n, value) => n + value.length, 0) - 1;
  wrongModel[at] = wrongModel[at]! ^ 1;
  expect(() => decodeWordNativeArchive(wrongModel)).toThrow();
});

for (const scenario of preservationScenarios) {
  test(`native roundtrip and native reconciliation: ${scenario.id}`, async () => {
    const result = await scenario.run();
    for (const fixture of result.fixtures) {
      const restored = native(openWordArtifact(fixture.bytes));
      fixture.verify?.(restored);
      sameParts(fixture.bytes, restored.bytes());
      const reconciled = new NativeWordDocument({ source: restored, content: importWordContent(restored) }).artifact();
      fixture.verify?.(reconciled);
      sameParts(fixture.bytes, reconciled.bytes(), new Set(['word/document.xml']));
    }
  });
}

for (const strict of [false, true]) {
  test(`native drawings preserve crop, transforms and ink resources, strict: ${strict}`, async () => {
    const { pictureFixture } = await import('./picture-fixture.ts');
    const { inkFixture } = await import('./ink-fixture.ts');
    for (const original of [openWordArtifact(pictureFixture({ strict, crop: 'l="12500" r="25000"', transform: 'rot="5400000" flipH="1"', anchors: [2] })), inkFixture(false, true, undefined, strict ? 'strict' : 'transitional').source]) {
      const restored = native(original);
      expect([...restored.document.drawings]).toEqual([...original.document.drawings]);
      sameParts(original.bytes(), restored.bytes());
      const measure = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };
      expect(new NativeWordDocument({ source: restored }).layout(measure))
        .toEqual(new NativeWordDocument({ source: original }).layout(measure));
      const reconciled = new NativeWordDocument({ source: restored, content: importWordContent(restored) }).artifact();
      sameParts(original.bytes(), reconciled.bytes(), new Set(['word/document.xml']));
    }
  });
}

test('native stories keep shared numbering definitions and independent edits after repeated reopen', async () => {
  const { numberingStoryFixture } = await import('./numbering-story-fixture.ts');
  const { wordStoryArtifact } = await import('../src/stories.ts');
  const original = numberingStoryFixture(2, 2, true);
  let restored = native(native(original));
  const model = new NativeWordDocument({ source: restored });
  const partName = restored.document.headerFooters[0]!.part.name.value;
  model.updateStory(partName, importWordContent(wordStoryArtifact(restored, partName)).map(block => block.kind === 'paragraph'
    ? { ...block, runs: block.runs.map(run => ({ ...run, text: 'Header changed' })) } : block));
  restored = native(model.artifact());
  expect(importWordContent(restored)).toEqual(importWordContent(original));
  expect(importWordContent(wordStoryArtifact(restored, partName))[0]).toMatchObject({ runs: [{ text: 'Header changed' }] });
  sameParts(original.bytes(), restored.bytes(), new Set(['word/document.xml', partName.slice(1)]));
});

test('fresh native models edit and lay out without materializing preservation XML', () => {
  const restored = native(createWordArtifact({ paragraphs: [{ runs: [{ text: 'Original' }] }] }));
  expect(restored.document.source.isParsed).toBe(false);
  const model = new NativeWordDocument({ source: restored });
  const paragraph = importWordContent(restored)[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  model.update([{ ...paragraph, runs: [{ text: 'Native edit' }] }]);
  model.layout({ measure: text => ({ width: text.length * 5, ascent: 8, descent: 2 }) });
  expect(restored.document.source.isParsed).toBe(false);
  expect(model.paragraphs()[0]?.text).toBe('Native edit');
});
