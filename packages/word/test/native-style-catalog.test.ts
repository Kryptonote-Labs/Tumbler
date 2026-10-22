import { expect, test } from 'bun:test';
import { NativeWordDocument, importWordContent, openWordArtifact, type WordContentBlock } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

function fixture(conformance: 'strict' | 'transitional', ownTab = true) {
  const w = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return openWordArtifact(buildWordDocumentFixture({
    conformance,
    relationships: [{ id: 's', type: `${rel}/styles`, target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
      xml: `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Normal"><w:pPr><w:tabs><w:tab w:val="start" w:pos="720"/></w:tabs></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Named" w:default="1"><w:basedOn w:val="Heading1"/>${ownTab ? '<w:pPr><w:tabs><w:tab w:val="start" w:pos="900"/></w:tabs></w:pPr>' : ''}</w:style></w:styles>` }],
    documentXml: `<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:pStyle w:val="Named"/></w:pPr><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>`,
  }));
}

function expectTabs(native: NativeWordDocument, positions: readonly number[]) {
  const paragraph = native.blocks[0];
  if (paragraph?.kind !== 'paragraph') throw new Error('Expected native paragraph');
  expect(native.paragraphFormat(paragraph).tabs.map(tab => tab.positionTwips)).toEqual([...positions]);
  const exported = native.artifact().document;
  const reopened = exported.blocks[0];
  if (reopened?.kind !== 'paragraph') throw new Error('Expected exported paragraph');
  expect(exported.styles.paragraphFormat(exported, reopened).tabs.map(tab => tab.positionTwips)).toEqual([...positions]);
}

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance}: a new unknown selection uses the source default's broken chain`, () => {
    const source = fixture(conformance);
    const original = importWordContent(source)[0];
    if (original?.kind !== 'paragraph') throw new Error('Expected paragraph');
    const native = new NativeWordDocument({ source });
    native.update([{ ...original, styleId: 'Unknown', positioning: { tabs: [{ positionTwips: 1440, alignment: 'start', leader: 'none' }] } }]);
    expectTabs(native, [900, 1440]);
  });

  for (const nested of [false, true]) for (const ownTab of [false, true]) {
    test(`${conformance}: built-ins requested in ${nested ? 'table' : 'body'} invalidate ${ownTab ? 'nonempty' : 'empty'} inherited tabs`, () => {
      const source = fixture(conformance, ownTab);
      const original = importWordContent(source)[0];
      if (original?.kind !== 'paragraph') throw new Error('Expected paragraph');
      const native = new NativeWordDocument({ source, immutableContent: true });
      native.update([original]);
      expectTabs(native, ownTab ? [900] : []);
      const heading = { kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'Heading' }] } as const;
      const added: WordContentBlock = nested ? { kind: 'table', rows: [[{ blocks: [heading] }]] } : heading;
      native.update([original, added]);
      expectTabs(native, ownTab ? [720, 900] : [720]);
      native.update([original]);
      expectTabs(native, ownTab ? [900] : []);
    });
  }
}
