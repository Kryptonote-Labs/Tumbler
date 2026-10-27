import { expect, test } from 'bun:test';
import { openWordArtifact, importWordContent, NativeWordDocument } from '../src/index.ts';
import { openWordOperationDocument, prepareWordOperation } from '../src/operations/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
test('positioning reset preserves an opaque w prefix', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<x:document xmlns:x="${ns}" xmlns:w="urn:custom" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w"><x:body><x:p><x:pPr><x:ind x:left="720" w:hint="w:Token"><w:payload/></x:ind></x:pPr><x:r><x:t>Hello</x:t></x:r></x:p></x:body></x:document>` }));
  const p = importWordContent(source)[0]!;
  if (p.kind !== 'paragraph') throw Error('paragraph');
  const model = new NativeWordDocument({ source, content: [{ ...p, positioning: { reset: true } }] });
  expect(model.artifact().document.source.elements('urn:custom', 'payload')).toHaveLength(1);
});
for (const tabsContent of ['\n<w:tab w:val="left" w:pos="1440"/>\n', '<w:tab w:val="left" w:pos="1440"/><ext:keep/>', '<ext:keep/>']) test(`reset removes direct tabs and inherits style stops for ${JSON.stringify(tabsContent)}`, () => {
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${ns}" xmlns:ext="urn:custom" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="ext"><w:body><w:p><w:pPr><w:pStyle w:val="Custom"/><w:tabs>${tabsContent}</w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    relationships: [{ id: 'styles', type: `${rel}/styles`, target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Custom"><w:name w:val="Custom"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="2880"/></w:tabs></w:pPr></w:style></w:styles>` }],
  }));
  const p = importWordContent(source)[0]!;
  if (p.kind !== 'paragraph') throw Error('paragraph');
  const model = new NativeWordDocument({ source });
  model.update([{ ...p, positioning: { reset: true } }]);
  const output = model.artifact();
  const exported = output.document.blocks[0]!;
  if (exported.kind !== 'paragraph' || model.blocks[0]?.kind !== 'paragraph') throw Error('paragraph');
  expect(output.document.styles.paragraphFormat(output.document, exported).tabs).toEqual(model.paragraphFormat(model.blocks[0]).tabs);
});

for (const prefix of ['x:', '']) test(`reset plus replacement preserves extension namespaces with ${prefix || 'default namespace'}`, () => {
  const binding = prefix ? `xmlns:x="${ns}"` : `xmlns="${ns}"`;
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<${prefix}document ${binding} xmlns:w="urn:custom" xmlns:a="${ns}"><${prefix}body><${prefix}p><${prefix}pPr><${prefix}ind a:left="720" w:hint="w:Token"><w:payload/></${prefix}ind></${prefix}pPr><${prefix}r><${prefix}t>Hello</${prefix}t></${prefix}r></${prefix}p></${prefix}body></${prefix}document>` }));
  const p = importWordContent(source)[0]!;
  if (p.kind !== 'paragraph') throw Error('paragraph');
  const model = new NativeWordDocument({ source, content: [{ ...p, positioning: { reset: true, indentEndTwips: 360 } }] });
  const output = model.artifact();
  expect(output.document.source.elements('urn:custom', 'payload')).toHaveLength(1);
  const indent = output.document.source.elements(ns, 'ind')[0]!;
  expect(indent.attributes.find(attribute => attribute.namespaceUri === 'urn:custom' && attribute.localName === 'hint')?.value).toBe('w:Token');
  const edited = importWordContent(output)[0]!;
  if (edited.kind !== 'paragraph') throw Error('paragraph');
  expect(edited.positioning?.indentEndTwips).toBe(360);
  expect(edited.positioning?.indentStartTwips).toBe(0);
});

test('empty-target hyperlinks survive no-op but explicit null and empty-string unlink remove them', async () => {
  const { openWordOperationDocument, prepareWordOperation } = await import('../src/operations/index.ts');
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:hyperlink><w:r><w:t>Hello</w:t></w:r></w:hyperlink></w:p></w:body></w:document>` }));
  const noOp = openWordOperationDocument(source);
  try { expect(noOp.artifact().document.source.elements(ns, 'hyperlink')).toHaveLength(1); }
  finally { noOp.destroy(); }
  const native = new NativeWordDocument({ source });
  expect(native.blocks[0]?.kind === 'paragraph' && native.blocks[0].inlines[0]?.kind).toBe('hyperlink');
  for (const link of [null, '']) {
    const session = openWordOperationDocument(source);
    try {
      session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, { name: 'format', input: { link } }).delta);
      expect(session.artifact().document.source.elements(ns, 'hyperlink')).toHaveLength(0);
    } finally { session.destroy(); }
  }
});

for (const opaque of [' ext:hint="keep"', '<!--keep-->', '<?keep value?>']) test(`source reset removes the tab property with ${opaque}`, () => {
  const attribute = opaque.startsWith(' ') ? opaque : '';
  const child = attribute ? '' : opaque;
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}" xmlns:ext="urn:custom"><w:body><w:p><w:pPr><w:tabs${attribute}><w:tab w:val="left" w:pos="1440"/>${child}</w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>` }));
  const session = openWordOperationDocument(source);
  try {
    expect(session.artifact().document.source.source).toContain(opaque);
    session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, { name: 'paragraph', input: { positioning: null } }).delta);
    expect(session.artifact().document.source.elements(ns, 'tabs')).toHaveLength(0);
  } finally { session.destroy(); }
});

test('partial removal of replacement tabs keeps reset intent', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}" xmlns:ext="urn:custom"><w:body><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="1440"/><ext:keep/></w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>` }));
  const session = openWordOperationDocument(source);
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, { name: 'paragraph', input: { positioning: { reset: true, tabs: [{ positionTwips: 2880, alignment: 'start', leader: 'none' }] } } }).delta);
    session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, { name: 'paragraph', input: { positioning: { tabs: [] } } }).delta);
    expect(session.artifact().document.source.elements(ns, 'tabs')).toHaveLength(0);
  } finally { session.destroy(); }
});

test('new paragraph resets inherit the effective default paragraph style', () => {
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    relationships: [{ id: 'styles', type: `${rel}/styles`, target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:default="1" w:styleId="CustomDefault"><w:name w:val="Custom default"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="2880"/></w:tabs><w:ind w:left="240"/></w:pPr></w:style></w:styles>` }],
  }));
  const model = new NativeWordDocument({ source, content: [{ kind: 'paragraph', runs: [{ text: 'New' }], positioning: { reset: true } }] });
  const native = model.blocks[0]!;
  const output = model.artifact();
  const exported = output.document.blocks[0]!;
  if (native.kind !== 'paragraph' || exported.kind !== 'paragraph') throw new Error('Expected paragraphs');
  const parsed = output.document.styles.paragraphFormat(output.document, exported);
  expect(model.paragraphFormat(native).indentStartTwips).toBe(240);
  expect(model.paragraphFormat(native).tabs.map(tab => tab.positionTwips)).toEqual([2880]);
  expect(model.paragraphFormat(native).tabs).toEqual(parsed.tabs);
  expect(model.paragraphFormat(native).indentStartTwips).toBe(parsed.indentStartTwips);
});

for (const conformance of ['transitional', 'strict'] as const) test(`${conformance} opaque-only tab reset and replacement inherit named stops`, () => {
  const namespace = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : ns;
  const relationship = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : rel;
  const source = openWordArtifact(buildWordDocumentFixture({
    conformance,
    documentXml: `<w:document xmlns:w="${namespace}" xmlns:ext="urn:custom"><w:body><w:p><w:pPr><w:pStyle w:val="Custom"/><w:tabs><ext:keep/></w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    relationships: [{ id: 'styles', type: `${relationship}/styles`, target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${namespace}"><w:style w:type="paragraph" w:styleId="Custom"><w:name w:val="Custom"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr></w:style></w:styles>` }],
  }));
  const first = importWordContent(source)[0]!;
  if (first.kind !== 'paragraph') throw new Error('Expected paragraph');
  const model = new NativeWordDocument({ source });
  model.update([{ ...first, positioning: { reset: true } }]);
  const reset = model.blocks[0]!;
  if (reset.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(model.paragraphFormat(reset).tabs.map(tab => tab.positionTwips)).toEqual([720]);
  expect(model.artifact().document.source.elements(namespace, 'tabs')).toHaveLength(0);
  model.update([{ ...first, positioning: { reset: true, tabs: [{ positionTwips: 1440, alignment: 'start', leader: 'none' }] } }]);
  const paragraph = model.blocks[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(model.paragraphFormat(paragraph).tabs.map(tab => tab.positionTwips)).toEqual([720, 1440]);
  const output = model.artifact();
  expect(output.document.source.elements('urn:custom', 'keep')).toHaveLength(1);
  expect(output.document.source.elements(namespace, 'tab')).toHaveLength(1);
});
