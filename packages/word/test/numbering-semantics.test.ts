import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { reconcileWordContent } from '../src/content-export.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const p = (pr = '') => `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}<w:r><w:t>item</w:t></w:r></w:p>`;
const ref = (level = 0, id = 1) => `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${id}"/></w:numPr>`;
const lvl = (i: number, extra = '', start = '<w:start w:val="1"/>') => `<w:lvl w:ilvl="${i}">${start}<w:numFmt w:val="decimal"/>${extra}<w:lvlText w:val="%${i + 1}."/></w:lvl>`;
const nums = (levels: string, override = '') => `<w:abstractNum w:abstractNumId="0">${levels}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>${override}</w:num>`;
const style = (id: string, properties: string, extra = '', type = 'paragraph') => `<w:style w:type="${type}" w:styleId="${id}">${extra}<w:pPr>${properties}</w:pPr></w:style>`;
function make(body: string, numbering: string, styles = '', strict = false) {
  const ns = strict ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : w;
  const relationships = strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : rel;
  return openWordArtifact(buildWordDocumentFixture({
    conformance: strict ? 'strict' : 'transitional',
    documentXml: `<w:document xmlns:w="${ns}"><w:body>${body}</w:body></w:document>`,
    relationships: [{ id: 'n', type: `${relationships}/numbering`, target: 'numbering.xml' }, { id: 's', type: `${relationships}/styles`, target: 'styles.xml' }],
    parts: [
      { itemName: 'word/numbering.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml', xml: `<w:numbering xmlns:w="${ns}">${numbering}</w:numbering>` },
      { itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}">${styles}</w:styles>` },
    ],
  }));
}
const markers = (a: ReturnType<typeof make>) => [...a.document.numbering.markers(a.document).values()].map(m => m.text);
function verify(a: ReturnType<typeof make>, expected: string[]) {
  expect(markers(a)).toEqual(expected);
  expect([...new NativeWordDocument({ source: a }).listMarkers.values()].map(m => m.text)).toEqual(expected);
  const blocks = importWordContent(a).map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => ({ ...run, text: run.text + '!' })) } : block);
  const reopened = openWordArtifact(reconcileWordContent(a, blocks).bytes());
  expect(markers(reopened)).toEqual(expected);
  expect([...new NativeWordDocument({ source: reopened }).listMarkers.values()].map(m => m.text)).toEqual(expected);
  expect(reopened.document.package.readPart(reopened.document.package.getPart(reopened.document.numbering.partName!)!)).toEqual(a.document.package.readPart(a.document.package.getPart(a.document.numbering.partName!)!));
}

test.each([false, true])('style numbering inherits numId and selects pStyle level, strict=%s', strict => {
  const styles = style('Base', ref(0)) + style('List', '<w:numPr><w:ilvl w:val="0"/></w:numPr>', '<w:basedOn w:val="Base"/>');
  verify(make(p('<w:pStyle w:val="List"/>') + p('<w:pStyle w:val="List"/>' + ref(0, 0)), nums(lvl(0) + lvl(1, '<w:pStyle w:val="List"/>')), styles, strict), ['1.']);
});

test('default paragraph style applies without pPr; direct level overrides the style level', () => {
  const styles = style('List', ref(0)).replace('w:type="paragraph"', 'w:type="paragraph" w:default="1"');
  verify(make(p() + p(ref(0)), nums(lvl(0, '', '<w:start w:val="4"/>') + lvl(1, '<w:pStyle w:val="List"/>')), styles), ['1.', '5.']);
});

test('nearest matching inherited paragraph style selects the numbering level', () => {
  verify(make(p('<w:pStyle w:val="Child"/>'), nums(lvl(0) + lvl(2, '<w:pStyle w:val="Base"/>')), style('Base', ref()) + style('Child', '', '<w:basedOn w:val="Base"/>')), ['1.']);
});

const linked = (overrides = '', inner = '') => `<w:abstractNum w:abstractNumId="0"><w:numStyleLink w:val="N"/></w:abstractNum><w:abstractNum w:abstractNumId="1">${lvl(0)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>${overrides}</w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/>${inner}</w:num>`;
const numberingStyle = style('N', ref(0, 2), '', 'numbering');
test('numbering style links resolve before instance level and start overrides', () => {
  verify(make(p(ref()) + p(ref()), linked(), numberingStyle), ['1.', '2.']);
  const override = `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/>${lvl(0, '', '<w:start w:val="3"/>')}</w:lvlOverride>`;
  verify(make(p(ref()) + p(ref()), linked(override), numberingStyle), ['7.', '8.']);
  verify(make(p(ref()) + p(ref()), linked('', '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride>'), numberingStyle), ['5.', '6.']);
});

test('missing numbering links produce no marker; cycles fail with a controlled error', () => {
  verify(make(p(ref()), linked()), []);
  const cyclic = make(p(ref()), nums('<w:numStyleLink w:val="N"/>'), style('N', ref(), '', 'numbering'));
  expect(() => markers(cyclic)).toThrow('cycle');
  const styleCycle = make(p('<w:pStyle w:val="A"/>'), nums(lvl(0)), style('A', ref(), '<w:basedOn w:val="B"/>') + style('B', '', '<w:basedOn w:val="A"/>'));
  expect(() => markers(styleCycle)).toThrow('cycle');
});

test('restart zero survives parent items; explicit triggers ignore intervening deeper levels', () => {
  verify(make([0, 1, 0, 1].map(i => p(ref(i))).join(''), nums(lvl(0) + lvl(1, '<w:lvlRestart w:val="0"/>'))), ['1.', '1.', '2.', '2.']);
  verify(make([0, 2, 1, 2, 0, 2].map(i => p(ref(i))).join(''), nums(lvl(0) + lvl(1) + lvl(2, '<w:lvlRestart w:val="1"/>'))), ['1.', '1.', '2.', '2.', '2.', '1.']);
  verify(make([0, 2, 0, 2].map(i => p(ref(i))).join(''), nums(lvl(0) + lvl(1) + lvl(2))), ['1.', '1.', '2.', '1.']);
});

test('omitted imported start is zero; authored default stays one', () => {
  verify(make(p(ref()) + p(ref()), nums(lvl(0, '', ''))), ['0.', '1.']);
  const authored = createWordArtifact({ blocks: [{ kind: 'paragraph', list: { id: 'new', kind: 'decimal' }, runs: [{ text: 'item' }] }] });
  expect(markers(authored)).toEqual(['1.']);
});

test('numbering styles inherit their instance and links can span multiple styles', () => {
  const definitions = linked().replace('<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>', '<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>') + '<w:abstractNum w:abstractNumId="2"><w:numStyleLink w:val="Next"/></w:abstractNum><w:num w:numId="3"><w:abstractNumId w:val="1"/></w:num>';
  const styles = style('N', '', '<w:basedOn w:val="Parent"/>', 'numbering') + style('Parent', ref(0, 2), '', 'numbering') + style('Next', ref(0, 3), '', 'numbering');
  verify(make(p(ref()) + p(ref()), definitions, styles), ['1.', '2.']);
});

test('out-of-range restart triggers use the default and each instance owns its counters', () => {
  const definitions = nums(lvl(0) + lvl(1, '<w:lvlRestart w:val="9"/>')) + '<w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>';
  verify(make(p(ref(0)) + p(ref(1)) + p(ref(0, 2)) + p(ref(1)) + p(ref(0)) + p(ref(1)), definitions), ['1.', '1.', '1.', '2.', '2.', '1.']);
});

test('style-level ilvl is ignored and inherited cancellation suppresses a list', () => {
  const artifact = make(p('<w:pStyle w:val="List"/>'), nums(lvl(0) + lvl(2, '<w:pStyle w:val="List"/>')), style('List', ref(0)));
  const paragraph = artifact.document.blocks[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(artifact.document.numbering.paragraphReference(artifact.document, paragraph)).toEqual({ numId: 1, level: 2 });
  verify(artifact, ['1.']);
  verify(make(p('<w:pStyle w:val="Child"/>'), nums(lvl(0)), style('Base', ref()) + style('Child', ref(0, 0), '<w:basedOn w:val="Base"/>')), []);
});

test('style link traversal is bounded without recursion', () => {
  const definitions = Array.from({ length: 101 }, (_, i) => `<w:abstractNum w:abstractNumId="${i}"><w:numStyleLink w:val="N${i + 1}"/></w:abstractNum><w:num w:numId="${i + 1}"><w:abstractNumId w:val="${i}"/></w:num>`).join('');
  const styles = Array.from({ length: 101 }, (_, i) => style(`N${i + 1}`, ref(0, i + 2), '', 'numbering')).join('');
  expect(() => markers(make(p(ref()), definitions, styles))).toThrow('exceeds 100');
});
