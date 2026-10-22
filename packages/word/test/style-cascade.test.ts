import { expect, test } from 'bun:test';
import { openOpcPackage } from '@tumblerjs/opc';
import { openWordDocument } from '../src/index.ts';
import { WordStyles, type WordStyle } from '../src/styles.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

function style(styleId: string, type: WordStyle['type'], run: WordStyle['run'] = {}, extra: Partial<WordStyle> = {}): WordStyle {
  return { styleId, type, run, paragraph: {}, name: undefined, basedOn: undefined, linked: undefined, isDefault: false, ...extra };
}
for (const property of ['bold', 'italic', 'strike'] as const) {
  test(`${property}: nearest basedOn value, then toggle between levels with Word defaults`, () => {
    const values = [undefined, false, true] as const;
    const expected = [
      [[false, false, true], [false, false, true], [true, true, false]],
      [[true, false, true], [false, true, false], [true, false, true]],
    ];
    for (const defaults of [false, true]) for (const paragraph of values) for (const character of values) {
      const resolver = new WordStyles({ documentRunDefaults: { [property]: defaults }, styles: [
        style('P0', 'paragraph', { [property]: true }),
        style('P', 'paragraph', paragraph === undefined ? {} : { [property]: paragraph }),
        style('C', 'character', character === undefined ? {} : { [property]: character }),
        style('Child', 'paragraph', { [property]: true }, { basedOn: 'P0' }),
        style('C0', 'character', { [property]: true }),
        style('CChild', 'character', { [property]: false }, { basedOn: 'C0' }),
      ] });
      expect(resolver.resolveParagraphStyle('Child').text[property]).toBe(true);
      expect(resolver.resolveStyledRun('P', 'C')[property]).toBe(expected[Number(defaults)]![values.indexOf(paragraph)]![values.indexOf(character)]);
      expect(resolver.resolveStyledRun('P', 'CChild')[property]).toBe(Boolean(Number(defaults) ^ Number(paragraph ?? defaults)));
    }
  });
}

test('missing and wrong-type paragraph references select default; broken basedOn stops without inserting default', () => {
  const resolver = new WordStyles({ styles: [
    style('Normal', 'paragraph', { fontSizePoints: 20 }, { isDefault: true, paragraph: { alignment: 'center' } }),
    style('C', 'character'), style('Broken', 'paragraph', {}, { basedOn: 'Missing' }),
  ] });
  for (const id of ['Missing', 'C']) {
    expect(resolver.resolveParagraphStyle(id)).toMatchObject({ text: { fontSizePoints: 20 }, paragraph: { alignment: 'center' } });
    expect(resolver.resolveStyledRun(id).fontSizePoints).toBe(20);
  }
  expect(resolver.resolveParagraphStyle('Broken').text.fontSizePoints).toBe(11);
});

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance}: additive tabs, clears, empty declarations, absolute direct toggles and fallback`, () => {
    const w = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const bytes = buildWordDocumentFixture({ conformance, relationships: [{ id: 's', type: `${rel}/styles`, target: 'styles.xml' }], parts: [{
      itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
      xml: `<w:styles xmlns:w="${w}"><w:docDefaults><w:pPrDefault><w:pPr><w:tabs><w:tab w:val="start" w:pos="720"/></w:tabs></w:pPr></w:pPrDefault></w:docDefaults>
      <w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:pPr><w:jc w:val="center"/><w:tabs><w:tab w:val="end" w:pos="1440"/></w:tabs></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
      <w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="Normal"/><w:pPr><w:tabs/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
      <w:style w:type="character" w:styleId="C"><w:rPr><w:b/></w:rPr></w:style></w:styles>`,
    }], documentXml: `<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:pStyle w:val="Child"/><w:tabs><w:tab w:val="clear" w:pos="720"/><w:tab w:val="decimal" w:pos="1440"/><w:tab w:val="start" w:pos="2160"/></w:tabs><w:rPr><w:b w:val="0"/></w:rPr></w:pPr>${['', '<w:b/>', '<w:b w:val="0"/>'].map(direct=>`<w:r><w:rPr><w:rStyle w:val="C"/>${direct}</w:rPr><w:t>x</w:t></w:r>`).join('')}</w:p><w:p><w:pPr><w:pStyle w:val="Unknown"/></w:pPr></w:p></w:body></w:document>` });
    const document = openWordDocument(openOpcPackage(bytes));
    const p = document.blocks[0], unknown = document.blocks[1];
    if (p?.kind !== 'paragraph' || unknown?.kind !== 'paragraph') throw new Error('Expected paragraphs');
    expect(document.styles.resolveParagraphStyle('Child').paragraph.tabs.map(t=>t.positionTwips)).toEqual([720,1440]);
    expect(document.styles.paragraphFormat(document,p).tabs).toEqual([
      { positionTwips:1440, alignment:'decimal', leader:'none' }, { positionTwips:2160, alignment:'start', leader:'none' },
    ]);
    expect(p.inlines.map(run => run.kind === 'run' && document.styles.runFormat(document,p,run).bold)).toEqual([false,true,false]);
    expect(document.styles.runFormat(document,p).bold).toBe(false);
    expect(document.styles.paragraphFormat(document,unknown).alignment).toBe('center');
    expect(document.styles.runFormat(document,unknown).fontSizePoints).toBe(20);
    expect(document.bytes()).toEqual(bytes);
  });
}

test('paragraph and character cycles and depth limits remain rejected on repeated resolution', () => {
  for (const type of ['paragraph','character'] as const) {
    const resolver = new WordStyles({ styles: [style('A',type,{}, {basedOn:'B'}),style('B',type,{}, {basedOn:'A'})] });
    for (let i=0;i<2;i++) expect(()=>type === 'paragraph' ? resolver.resolveParagraphStyle('A') : resolver.resolveStyledRun('Missing','A')).toThrow('cycle');
    const deep = new WordStyles({ styles: Array.from({length:101},(_,i)=>style(`${i}`,type,{}, {basedOn:i ? `${i-1}` : undefined})) });
    expect(()=>type === 'paragraph' ? deep.resolveParagraphStyle('100') : deep.resolveStyledRun('Missing','100')).toThrow('exceeds');
  }
});

test('style-chain tabs clear inherited positions, replace leaders and can be reintroduced', () => {
  const tab = (positionTwips: number, alignment: 'start' | 'clear' | 'end' = 'start', leader: 'none' | 'dot' = 'none') => ({ positionTwips, alignment, leader });
  const resolver = new WordStyles({ documentParagraphDefaults: { tabs: [tab(720), tab(1440)] }, styles: [
    style('Base', 'paragraph', {}, { paragraph: { tabs: [tab(720, 'clear'), tab(1440, 'end', 'dot')] } }),
    style('Child', 'paragraph', {}, { basedOn: 'Base', paragraph: { tabs: [tab(720), tab(9000, 'clear')] } }),
  ] });
  expect(resolver.resolveParagraphStyle('Base').paragraph.tabs).toEqual([tab(1440, 'end', 'dot')]);
  expect(resolver.resolveParagraphStyle('Child').paragraph.tabs).toEqual([tab(720), tab(1440, 'end', 'dot')]);
  expect(resolver.style('Base')?.paragraph.tabs?.[0]?.alignment).toBe('clear');
});

test('character basedOn uses nearest true and missing character references use the default character style', () => {
  const resolver = new WordStyles({ styles: [
    style('P', 'paragraph', { bold: true }),
    style('C0', 'character', { bold: true }, { isDefault: true }),
    style('C1', 'character', { bold: true }, { basedOn: 'C0' }),
    style('C2', 'character', {}, { basedOn: 'C1' }),
  ] });
  for (const id of ['C0', 'C1', 'C2', 'Unknown', 'P']) expect(resolver.resolveStyledRun('P', id).bold).toBe(false);
});
