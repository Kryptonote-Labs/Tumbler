import { expect, test } from 'bun:test';
import { NativeWordDocument, importWordContent, openWordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import type { WordTabStop } from '../src/styles.ts';

const tab = (positionTwips: number, alignment: WordTabStop['alignment'] = 'start', leader: WordTabStop['leader'] = 'none'): WordTabStop => ({ positionTwips, alignment, leader });

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance}: native direct tabs agree with exported inherited positions`, () => {
    const w = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const source = openWordArtifact(buildWordDocumentFixture({
      conformance,
      relationships: [{ id: 's', type: `${rel}/styles`, target: 'styles.xml' }],
      parts: [{
        itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
        xml: `<w:styles xmlns:w="${w}"><w:docDefaults><w:pPrDefault><w:pPr><w:tabs><w:tab w:val="start" w:pos="360"/></w:tabs></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Named"><w:pPr><w:tabs><w:tab w:val="start" w:pos="720"/></w:tabs></w:pPr></w:style></w:styles>`,
      }],
      documentXml: `<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:pStyle w:val="Named"/><w:tabs><w:tab w:val="start" w:pos="2160"/></w:tabs></w:pPr><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p></w:body></w:document>`,
    }));
    const original = importWordContent(source)[0];
    if (original?.kind !== 'paragraph') throw new Error('Expected paragraph');
    for (const [tabs, expected] of [
      [[tab(1440)], [tab(360), tab(720), tab(1440)]],
      [[tab(720, 'end', 'dot'), tab(360, 'clear')], [tab(720, 'end', 'dot')]],
      [[], [tab(360), tab(720)]],
    ] as const) {
      const native = new NativeWordDocument({ source });
      native.update([{ ...original, positioning: { tabs } }]);
      const paragraph = native.blocks[0];
      if (paragraph?.kind !== 'paragraph') throw new Error('Expected native paragraph');
      expect(native.paragraphFormat(paragraph).tabs).toEqual(expected);
      const exported = native.artifact().document;
      const reopened = exported.blocks[0];
      if (reopened?.kind !== 'paragraph') throw new Error('Expected exported paragraph');
      expect(exported.styles.paragraphFormat(exported, reopened).tabs).toEqual(expected);
    }
  });
}
