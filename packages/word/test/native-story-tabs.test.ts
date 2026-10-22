import { expect, test } from 'bun:test';
import { NativeWordDocument, importWordContent, layoutWordDocument, openWordArtifact, type WordLayout } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const measurer = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };

function fixture(conformance: 'strict' | 'transitional', selected = 'Named') {
  const w = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return openWordArtifact(buildWordDocumentFixture({
    conformance,
    relationships: [
      { id: 's', type: `${rel}/styles`, target: 'styles.xml' },
      { id: 'h', type: `${rel}/header`, target: 'header.xml' },
      { id: 'f', type: `${rel}/footer`, target: 'footer.xml' },
    ],
    parts: [
      { itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Normal"><w:pPr><w:tabs><w:tab w:val="start" w:pos="720"/></w:tabs></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Default" w:default="1"><w:pPr><w:tabs><w:tab w:val="start" w:pos="900"/></w:tabs></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Named"><w:basedOn w:val="Heading1"/><w:pPr><w:tabs><w:tab w:val="start" w:pos="900"/></w:tabs></w:pPr></w:style></w:styles>` },
      ...(['header', 'footer'] as const).map(kind => ({ itemName: `word/${kind}.xml`, contentType: `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`, xml: `<w:${kind === 'header' ? 'hdr' : 'ftr'} xmlns:w="${w}"><w:p><w:pPr><w:pStyle w:val="Named"/></w:pPr><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p></w:${kind === 'header' ? 'hdr' : 'ftr'}>` })),
    ],
    documentXml: `<w:document xmlns:w="${w}" xmlns:r="${rel}"><w:body><w:p><w:pPr><w:pStyle w:val="${selected}"/></w:pPr><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="h"/><w:footerReference w:type="default" r:id="f"/></w:sectPr></w:body></w:document>`,
  }));
}

function positions(layout: WordLayout) {
  return layout.pages.map(page => ({
    body: page.columns.flatMap(column => column.lines.flatMap(line => line.fragments.map(fragment => [fragment.text, fragment.x]))),
    header: page.headerLines.flatMap(line => line.fragments.map(fragment => [fragment.text, fragment.x])),
    footer: page.footerLines.flatMap(line => line.fragments.map(fragment => [fragment.text, fragment.x])),
  }));
}

function tabs(native: NativeWordDocument) {
  const paragraph = native.blocks[0];
  if (paragraph?.kind !== 'paragraph') throw new Error('Expected paragraph');
  return native.paragraphFormat(paragraph).tabs.map(tab => tab.positionTwips);
}

function expectAgreement(native: NativeWordDocument) {
  expect(positions(native.layout(measurer))).toEqual(positions(layoutWordDocument(native.artifact().document, measurer)));
}

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance}: initial import retains missing built-in fallback and artifact`, () => {
    const source = fixture(conformance, 'Heading1');
    const native = new NativeWordDocument({ source });
    expect(native.artifact()).toBe(source);
    expect(tabs(native)).toEqual([900]);
    expectAgreement(native);
  });

  test(`${conformance}: body and retained/edited stories share added style definitions`, () => {
    const native = new NativeWordDocument({ source: fixture(conformance) });
    expectAgreement(native);
    const header = native.updateStory('/word/header.xml', [{ kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'A\tB' }] }]);
    expect(tabs(native)).toEqual([720, 900]);
    expect(tabs(header)).toEqual([720]);
    expectAgreement(native);
    native.updateStory('/word/header.xml', [{ kind: 'paragraph', styleId: 'Named', runs: [{ text: 'A\tB' }] }]);
    expect(tabs(native)).toEqual([900]);
    expect(tabs(header)).toEqual([900]);
    expectAgreement(native);
    native.updateStory('/word/footer.xml', [{ kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'A\tB' }] }]);
    expect(tabs(native)).toEqual([720, 900]);
    expect(tabs(header)).toEqual([720, 900]);
    expectAgreement(native);
    native.removeStory('/word/footer.xml');
    expect(tabs(native)).toEqual([900]);
    expect(tabs(header)).toEqual([900]);
    expectAgreement(native);
    const original = importWordContent(fixture(conformance))[0];
    if (original?.kind !== 'paragraph') throw new Error('Expected paragraph');
    native.update([original, { kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'Heading' }] }]);
    expect(tabs(header)).toEqual([720, 900]);
    expectAgreement(native);
  });

  test(`${conformance}: invalid story catalog updates leave all views unchanged`, () => {
    const native = new NativeWordDocument({ source: fixture(conformance) });
    const header = native.updateStory('/word/header.xml', [{ kind: 'paragraph', styleId: 'Named', runs: [{ text: 'Header' }] }]);
    const bodyBlocks = native.blocks, headerBlocks = header.blocks, artifact = native.artifact();
    expect(() => native.updateStory('/word/header.xml', [{ kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'Invalid', format: { fontSizePoints: 0 } }] }])).toThrow();
    expect(native.blocks).toBe(bodyBlocks);
    expect(header.blocks).toBe(headerBlocks);
    expect(native.artifact()).toBe(artifact);
  });
}
