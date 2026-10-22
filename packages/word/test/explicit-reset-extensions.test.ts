import { expect, test } from 'bun:test';
import { openWordArtifact, importWordContent, NativeWordDocument } from '../src/index.ts';
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
for (const tabsContent of ['\n<w:tab w:val="left" w:pos="1440"/>\n', '<w:tab w:val="left" w:pos="1440"/><ext:keep/>']) test(`reset retains inherited tabs with ${tabsContent.startsWith('\n') ? 'whitespace' : 'extension'} content`, () => {
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${ns}" xmlns:ext="urn:custom" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="ext"><w:body><w:p><w:pPr><w:pStyle w:val="Custom"/><w:tabs>${tabsContent}</w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    relationships: [{ id: 'styles', type: `${rel}/styles`, target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Custom"><w:name w:val="Custom"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="2880"/></w:tabs></w:pPr></w:style></w:styles>` }],
  }));
  const p = importWordContent(source)[0]!;
  if (p.kind !== 'paragraph') throw Error('paragraph');
  const model = new NativeWordDocument({ source, content: [{ ...p, positioning: { reset: true } }] });
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
