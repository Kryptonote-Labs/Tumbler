import { buildWordDocumentFixture } from './document-fixture.ts';
import { expect, test } from 'bun:test';
import { createWordArtifact, openWordArtifact, NativeWordDocument, importWordContent } from '../src/index.ts';
import { borderXml, cellFormatXml } from '../src/table-format.ts';
import { paragraphPositioningXml } from '../src/positioning.ts';
import { fixtures } from '../../../tools/word-schema-order/fixtures.ts';

const children = (xml: string) => [...xml.matchAll(/<w:(\w+)\b/g)].map(match => match[1]);
test('authored merged cell properties follow CT_TcPrBase, including all formatting', () => {
  const xml = createWordArtifact({ blocks: fixtures.cell }).document.source.source;
  const properties = xml.match(/<w:tcPr>(.*?)<\/w:tcPr>/)![1]!;
  const topLevel = properties.replace(/<(w:\w+)\b[^>]*>.*?<\/\1>/g, '<$1/>');
  expect(children(topLevel)).toEqual(['tcW', 'gridSpan', 'vMerge', 'tcBorders', 'shd', 'tcMar', 'vAlign']);
  expect([...cellFormatXml(fixtures.cell[0].rows[0]![0]!.format!).keys()]).toEqual(['tcBorders', 'shd', 'tcMar', 'vAlign']);
});

test('borders serialize identically for every insertion order', () => {
  const border = { style: 'single', widthPoints: 1, color: '#123456' } as const;
  function permutations<T>(items: readonly T[]): T[][] {
    return items.length ? items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest])) : [[]];
  }
  for (const sides of permutations(['top', 'left', 'bottom', 'right'] as const)) {
    const borders = Object.fromEntries(sides.map(side => [side, border]));
    expect(children(borderXml(borders))).toEqual(['top', 'left', 'bottom', 'right']);
    const xml = createWordArtifact({ paragraphs: [{ runs: [], paragraph: { borders } }] }).document.source.source;
    expect(children(xml.match(/<w:pBdr>(.*?)<\/w:pBdr>/)![1]!)).toEqual(['top', 'left', 'bottom', 'right']);
  }
});

test('empty tab lists omit the container; explicit clear stops remain in both dialects', () => {
  for (const profile of ['strict', 'transitional'] as const) {
    expect(paragraphPositioningXml({ tabs: [] }, profile)).toEqual({});
    expect(paragraphPositioningXml({ tabs: [], indentStartTwips: 100 }, profile)).toEqual({ ind: `<w:ind w:${profile === 'strict' ? 'start' : 'left'}="100"/>` });
    expect(paragraphPositioningXml(fixtures.clearTabs[0].positioning, profile).tabs).toBe('<w:tabs><w:tab w:val="clear" w:pos="720" w:leader="none"/></w:tabs>');
  }
  expect(createWordArtifact({ blocks: fixtures.emptyTabs }).document.source.source).not.toContain('<w:tabs');
});


test('source edits remove direct tabs for [] and preserve them for omitted tabs', () => {
  for (const profile of ['strict', 'transitional'] as const) {
    const ns = profile === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const source = openWordArtifact(buildWordDocumentFixture({ conformance: profile, documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>` }));
    const content = importWordContent(source);
    const paragraph = content[0];
    if (paragraph?.kind !== 'paragraph') throw new Error('Expected paragraph');
    for (const positioning of [{ tabs: [] }, { indentStartTwips: 100 }, {}]) {
      const native = new NativeWordDocument({ source });
      native.update([{ ...paragraph, positioning }]);
      const xml = native.artifact().document.source.source;
      expect(xml.includes('<w:tabs')).toBe(!('tabs' in positioning));
      expect(xml).toContain('Text');
    }
  }
});
