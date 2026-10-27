import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'bun:test';
import { openZipArchive, writeZipArchiveChanges } from '@tumblerjs/opc';
import {
  createWordArtifact, openWordArtifact, createWordNativeArchive, openWordNativeArchive, encodeWordNativeArchive,
  decodeWordNativeArchive, NativeWordDocument, importWordContent, wordParagraphText,
} from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { scenarios } from '../../../tools/word-compatibility/scenarios.ts';

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
  expect(restored.bytes()).toEqual(original);
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
  expect(restored.bytes()).toEqual(original);
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
  for (const length of [1, Number.NaN]) {
    const model = archive.model.slice();
    new DataView(model.buffer, model.byteOffset, model.byteLength).setFloat64(0, length, true);
    expect(() => openWordNativeArchive({ ...archive, model })).toThrow();
  }
  const bytes = encodeWordNativeArchive(archive);
  expect(() => decodeWordNativeArchive(bytes.subarray(0, bytes.length - 1))).toThrow();
  const wrongModel = bytes.slice();
  const at = wrongModel.length - archive.resources.reduce((n, value) => n + value.length, 0) - 1;
  wrongModel[at] = wrongModel[at]! ^ 1;
  expect(() => decodeWordNativeArchive(wrongModel)).toThrow();
});

for (const scenario of scenarios) {
  test(`native roundtrip and native reconciliation: ${scenario.id}`, async () => {
    const result = await scenario.run();
    for (const fixture of result.fixtures) {
      const restored = native(openWordArtifact(fixture.bytes));
      fixture.verify?.(restored);
      expect(restored.bytes()).toEqual(fixture.bytes);
      sameParts(fixture.bytes, restored.bytes());
      const reconciled = new NativeWordDocument({ source: restored, content: importWordContent(restored) }).artifact();
      fixture.verify?.(reconciled);
      sameParts(fixture.bytes, reconciled.bytes(), new Set([restored.document.part.name.value.slice(1)]));
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

for (const endian of ['utf16le', 'utf16be'] as const) {
  test(`native preservation retains ${endian} XML, annotations and binary parts through neighbouring edits`, () => {
    const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const protectedParagraph = '<w:p><w:commentRangeStart w:id="3"/><w:ins w:id="1" w:author="Author"><w:r><w:t>Inserted</w:t></w:r></w:ins><w:del w:id="2" w:author="Author"><w:r><w:delText>Deleted</w:delText></w:r></w:del><w:r><w:footnoteReference w:id="7"/></w:r><w:commentRangeEnd w:id="3"/><w:r><w:commentReference w:id="3"/></w:r><w:hyperlink r:id="external"><w:r><w:t>External</w:t></w:r></w:hyperlink></w:p>';
    const xml = `<?xml version="1.0" encoding="UTF-16"?><w:document xmlns:w="${word}" xmlns:r="${relationships}"><w:body>${protectedParagraph}<w:p><w:r><w:t>Neighbour</w:t></w:r></w:p></w:body></w:document>`;
    const fixture = buildWordDocumentFixture({ documentXml: xml,
      relationships: [
        { id: 'external', type: `${relationships}/hyperlink`, target: 'https://example.com/?x=1&amp;y=2', targetMode: 'External' },
        { id: 'comments', type: `${relationships}/comments`, target: 'comments.xml' },
        { id: 'footnotes', type: `${relationships}/footnotes`, target: 'footnotes.xml' },
      ],
      parts: [
        { itemName: 'word/comments.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml', xml: `<w:comments xmlns:w="${word}"><w:comment w:id="3" w:author="Author"><w:p><w:r><w:t>Comment</w:t></w:r></w:p></w:comment></w:comments>` },
        { itemName: 'word/footnotes.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml', xml: `<w:footnotes xmlns:w="${word}"><w:footnote w:id="7"><w:p><w:r><w:t>Footnote</w:t></w:r></w:p></w:footnote></w:footnotes>` },
        { itemName: 'customXml/opaque.xml', contentType: 'application/xml', xml: '<opaque><![CDATA[unknown]]></opaque>' },
      ],
    });
    const encoded = Buffer.from('\uFEFF' + xml, 'utf16le');
    if (endian === 'utf16be') encoded.swap16();
    const zip = openZipArchive(fixture);
    const original = writeZipArchiveChanges(zip, { replacements: new Map([
      ['word/document.xml', encoded],
      ['customXml/opaque.xml', Uint8Array.from({ length: 256 }, (_, i) => i)],
    ]) });
    const restored = native(native(openWordArtifact(original)));
    expect(restored.bytes()).toEqual(original);
  sameParts(original, restored.bytes());
    const model = new NativeWordDocument({ source: restored, content: importWordContent(restored).map(block => block.kind === 'paragraph'
      ? { ...block, runs: block.runs.map(run => ({ ...run, text: run.text.replace('Neighbour', 'Edited neighbour') })) } : block) });
    const exported = model.artifact();
    expect(exported.document.source.source).toContain(protectedParagraph);
    expect(exported.document.source.source).toContain('Edited neighbour');
    sameParts(original, exported.bytes(), new Set(['word/document.xml']));
    expect(native(exported).document.source.encoding).toEqual(exported.document.source.encoding);
  });
}

test('browser and native hosts exchange native archives without native browser dependencies', async () => {
  const build = await Bun.build({
    entrypoints: [new URL('../src/native-archive.ts', import.meta.url).pathname], target: 'browser',
  });
  expect(build.success).toBe(true);
  const script = await build.outputs[0]!.text();
  expect(script).not.toContain('node:zlib');
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-native-browser-'));
  try {
    const path = join(directory, 'native-browser.mjs');
    await Bun.write(path, script);
    const browser = await import(pathToFileURL(path).href) as typeof import('../src/native-archive.ts');
    const original = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Cross-host Ελληνικά 中文 😀' }] }] });
    const restored = browser.openWordNativeArchive(createWordNativeArchive(original));
    expect(restored.bytes()).toEqual(original.bytes());
    const returned = openWordNativeArchive(browser.createWordNativeArchive(restored));
    expect(returned.bytes()).toEqual(original.bytes());
    expect(importWordContent(returned)).toEqual(importWordContent(original));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
