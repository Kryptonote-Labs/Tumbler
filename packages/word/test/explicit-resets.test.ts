import * as Y from 'yjs';
import { expect, test } from 'bun:test';
import { openWordArtifact, importWordContent, NativeWordDocument } from '../src/index.ts';
import { openWordOperationDocument, prepareWordOperation } from '../src/operations/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

function fixture() {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="urn:unknown"><w:body><w:p><w:pPr><w:ind w:left="720"/><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs><x:keep/></w:pPr><w:hyperlink w:anchor="target"><w:r><w:t>Hello</w:t></w:r></w:hyperlink></w:p></w:body></w:document>' }));
}
for (const kind of ['positioning', 'link'] as const) test(`explicit ${kind} removal survives export`, () => {
  const session = openWordOperationDocument(fixture());
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, kind === 'positioning'
      ? { name: 'paragraph', input: { positioning: null } }
      : { name: 'format', input: { link: null } }).delta);
    const output = session.artifact();
    expect(output.document.source.source).not.toContain(kind === 'positioning' ? 'w:left="720"' : '<w:hyperlink');
    expect(output.document.source.source).toContain('<x:keep/>');
    const content = importWordContent(output)[0]!;
    if (content.kind !== 'paragraph') throw new Error('Expected paragraph');
    if (kind === 'positioning') expect(content.positioning).toBeUndefined();
    else expect(content.runs[0]!.link).toBeUndefined();
  } finally { session.destroy(); }
});

test('absent and empty positioning patches preserve source positioning and links', () => {
  for (const input of [{}, { positioning: {} }]) {
    const session = openWordOperationDocument(fixture());
    try {
      const before = importWordContent(session.artifact());
      session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, { name: 'paragraph', input }).delta);
      const after = importWordContent(session.artifact());
      expect(after.map(block => block.kind === 'paragraph' && [block.positioning, block.runs.map(run => run.link)])).toEqual(before.map(block => block.kind === 'paragraph' && [block.positioning, block.runs.map(run => run.link)]));
    } finally { session.destroy(); }
  }
});

test('native reset agrees with export and retains unknown positioning markup', () => {
  const base = fixture();
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: base.document.source.source.replace('<w:ind w:left="720"/>', '<w:ind w:left="720" w:firstLineChars="100" x:custom="keep"><x:ind/></w:ind>').replace('<w:tabs>', '<w:tabs x:custom="tabs"><x:tab/>') }));
  const content = importWordContent(source);
  const first = content[0]!;
  if (first.kind !== 'paragraph') throw new Error('Expected paragraph');
  for (const positioning of [{ reset: true as const }, { reset: true as const, indentEndTwips: 360 }]) {
    const model = new NativeWordDocument({ source });
    model.update([{ ...first, positioning: { ...positioning, tabs: [{ positionTwips: 2880, alignment: 'start', leader: 'none' }] }, runs: first.runs.map(run => ({ ...run, link: '' })) }]);
    const paragraph = model.blocks[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    const output = model.artifact();
    const exported = output.document.blocks[0]!;
    if (exported.kind !== 'paragraph') throw new Error('Expected paragraph');
    const native = model.paragraphFormat(paragraph);
    const parsed = output.document.styles.paragraphFormat(output.document, exported);
    for (const key of ['indentStartTwips', 'indentEndTwips', 'firstLineTwips', 'hangingTwips', 'tabs'] as const)
      expect(native[key]).toEqual(parsed[key]);
    expect(paragraph.inlines.every(inline => inline.kind !== 'hyperlink')).toBe(true);
    expect(output.document.source.source).toContain('x:custom="keep"');
    expect(output.document.source.source).toContain('<x:ind/>');
    expect(output.document.source.source).toContain('<x:tab/>');
    expect(output.document.source.source).not.toContain('firstLineChars');
    expect(output.document.source.source).not.toContain('w:left="720"');
  }
});

test('reset survives undo, peer updates, splits and a subsequent partial edit', () => {
  const session = openWordOperationDocument(fixture());
  const undo = new Y.UndoManager(session.text);
  const peer = new Y.Doc();
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, { name: 'paragraph', input: { positioning: null } }).delta);
    undo.stopCapturing();
    expect(session.artifact().document.source.source).not.toContain('w:left="720"');
    undo.undo();
    expect(session.artifact().document.source.source).toContain('w:left="720"');
    undo.redo();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(session.text.doc!));
    const remote = peer.getText('body');
    remote.applyDelta(prepareWordOperation(remote, { start: 0, end: 5 }, { name: 'paragraph', input: { positioning: { indentEndTwips: 360 } } }).delta);
    Y.applyUpdate(session.text.doc!, Y.encodeStateAsUpdate(peer));
    session.text.applyDelta(prepareWordOperation(session.text, { start: 2, end: 2 }, { name: 'replace', input: { value: '\n' } }).delta);
    const output = session.artifact();
    expect(output.document.source.source).not.toContain('w:left="720"');
    const paragraphs = importWordContent(output).filter(block => block.kind === 'paragraph');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.every(block => block.positioning?.indentEndTwips === 360)).toBe(true);
  } finally { undo.destroy(); peer.destroy(); session.destroy(); }
});

for (const conformance of ['transitional', 'strict'] as const) test(`${conformance} reset inherits style indents and tabs in native and exported content`, () => {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const indent = conformance === 'strict' ? 'start' : 'left';
  const source = openWordArtifact(buildWordDocumentFixture({
    conformance,
    documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:pPr><w:pStyle w:val="Custom"/><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs><w:ind w:${indent}="720"/></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    relationships: [{ id: 'styles', type: `${rel}/styles`, target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Custom"><w:name w:val="Custom"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="2880"/></w:tabs><w:ind w:${indent}="240"/></w:pPr></w:style></w:styles>` }],
  }));
  const first = importWordContent(source)[0]!;
  if (first.kind !== 'paragraph') throw new Error('Expected paragraph');
  const native = new NativeWordDocument({ source, content: [{ ...first, positioning: { reset: true } }] });
  const p = native.blocks[0]!;
  if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(native.paragraphFormat(p).indentStartTwips).toBe(240);
  expect(native.paragraphFormat(p).tabs.map(tab => tab.positionTwips)).toEqual([2880]);
  const session = openWordOperationDocument(source);
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, { name: 'paragraph', input: { positioning: null } }).delta);
    const exported = session.artifact().document;
    const reset = exported.blocks[0]!;
    if (reset.kind !== 'paragraph') throw new Error('Expected paragraph');
    expect(exported.styles.paragraphFormat(exported, reset).indentStartTwips).toBe(240);
    expect(exported.styles.paragraphFormat(exported, reset).tabs.map(tab => tab.positionTwips)).toEqual([2880]);
    expect(importWordContent(session.artifact())[0]).not.toHaveProperty('positioning');
  } finally { session.destroy(); }
});

test('bulk partial positioning keeps each paragraph reset without rescanning all deltas', async () => {
  const { createWordCommands } = await import('../src/collaboration/commands.ts');
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.applyDelta(Array.from({ length: 100 }, (_, index) => [
    { insert: 'Hello' },
    { insert: '\n', attributes: { positioning: index % 2 ? { reset: true, indentEndTwips: 40 } : { indentStartTwips: 720 } } },
  ]).flat());
  const original = text.toDelta.bind(text);
  let scans = 0;
  text.toDelta = (...args: Parameters<typeof text.toDelta>) => { scans++; return original(...args); };
  const delta = createWordCommands().formatWordDelta(text, { start: 0, end: text.length - 1 }, { positioning: { firstLineTwips: 240 } });
  expect(scans).toBeLessThanOrEqual(2);
  text.toDelta = original;
  text.applyDelta(delta);
  const parts: { insert: string; attributes?: import('../src/collaboration/formatting.ts').TextAttributes }[] = text.toDelta();
  const boundaries = parts.filter(part => part.insert === '\n');
  expect(boundaries).toHaveLength(100);
  for (const [index, part] of boundaries.entries()) expect(part.attributes?.positioning).toEqual(index % 2
    ? { reset: true, indentEndTwips: 40, firstLineTwips: 240 }
    : { indentStartTwips: 720, firstLineTwips: 240 });
  doc.destroy();
});
