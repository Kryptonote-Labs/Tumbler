import assert from 'node:assert/strict';
import { OOXML_NAMESPACES, type LosslessXmlElement } from '../../../packages/ooxml/src/index.ts';
import { openZipArchive } from '../../../packages/opc/src/index.ts';
import { openWordArtifact, wordParagraphText, WordEditingSession, type WordArtifact, type WordParagraph } from '../../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../../packages/word/test/document-fixture.ts';
import type { Scenario } from '../scenarios.ts';
import { properties, profiles, scenarioId, type Profile, type Property } from './properties.ts';

// Include omission, implicit true, every lexical boolean, and paired-element syntax.
// Part 1 §17.17.4 and §22.9.2.7; Transitional additionally permits on/off.
function variants(property: Property, profile: Profile) {
  return ['', `<w:${property.name}/>`, ...['true', 'false', '1', '0', ...(profile === 'transitional' ? ['on', 'off'] : [])].map(value => `<w:${property.name} w:val="${value}"/>`), `<w:${property.name}></w:${property.name}>`];
}
const originalText = '123 456 789'; // Neutral characters avoid rtl's unspecified strong-direction cases.
const editedText = '123 000 789';

export const preservationScenarios: readonly Scenario[] = properties.flatMap(property => profiles.map((profile): Scenario => ({
  id: scenarioId(property, profile), title: `Preserve ${property.kind} ${property.name}: boolean forms, inheritance markup, text and formatting edits (${profile})`,
  topics: [property.topic], dimensions: ['preserve'], oracles: ['assertion', 'package-diff', 'openxml'],
  run() {
    const forms = variants(property, profile);
    const bytes = input(property, profile, forms);
    const original = openWordArtifact(bytes);
    assert.deepEqual(original.bytes(), bytes, 'no-op ZIP must be byte-identical');
    verifyProperties(original, property, forms, originalText);
    let current = original;
    // Exercise each lexical form both in body paragraphs and in table cells.
    for (let index = 0; index < forms.length * 2; index++) {
      const paragraph = paragraphs(current)[index]!;
      const selection = range(paragraph, 4, 7);
      const history = new WordEditingSession(current);
      const before = current.bytes();
      history.replaceText(selection, '000');
      assert.deepEqual(history.undo().bytes(), before, 'undo must restore exact source');
      current = history.redo();
      // Splits the selected run into three runs, exercising preservation during reconstruction.
      current = current.applyFormatting(range(paragraphs(current)[index]!, 4, 7), { text: { color: { set: { type: 'rgb', value: '#123456' } } } });
      // Changes pPr as well, while retaining unrelated paragraph/paragraph-mark properties.
      current = current.applyFormatting(range(paragraphs(current)[index]!, 0, 3), { block: { horizontalAlignment: { set: 'center' } } });
    }
    const reopened = openWordArtifact(current.bytes());
    verifyProperties(reopened, property, forms, editedText);
    const comparePackages = () => {
      assert.deepEqual(original.bytes(), bytes);
      const a = openZipArchive(bytes), b = openZipArchive(current.bytes());
      assert.deepEqual(a.entries.map(entry => entry.name).sort(), b.entries.map(entry => entry.name).sort());
      for (const entry of a.entries) {
        if (entry.name === 'word/document.xml') continue;
        assert.deepEqual(b.read(b.get(entry.name)!), a.read(entry), `untouched ${entry.name}`);
      }
      verifyProperties(reopened, property, forms, editedText);
    };
    comparePackages();
    return { fixtures: [
      { name: 'before', bytes, verify: artifact => verifyProperties(artifact, property, forms, originalText) },
      { name: 'after', bytes: current.bytes(), verify: artifact => verifyProperties(artifact, property, forms, editedText) },
    ], comparePackages };
  },
})));

function input(property: Property, profile: Profile, forms: readonly string[]) {
  const ns = OOXML_NAMESPACES[profile].wordprocessing;
  const relationship = profile === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships/styles' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles';
  const p = (markup: string) => `<w:p><w:pPr><w:pStyle w:val="Derived"/>${property.kind === 'paragraph' ? markup : `<w:rPr>${markup}</w:rPr>`}</w:pPr><w:r><w:rPr>${property.kind === 'run' ? markup : ''}</w:rPr><w:t>${originalText}</w:t></w:r></w:p>`;
  const cells = forms.map(markup => `<w:tr><w:tc>${p(markup)}</w:tc></w:tr>`).join('');
  const wrapper = property.kind === 'run' ? 'rPr' : 'pPr';
  const styleProperty = `<w:${wrapper}><w:${property.name}/></w:${wrapper}>`;
  return buildWordDocumentFixture({ conformance: profile,
    documentXml: `<w:document xmlns:w="${ns}"><w:body>${forms.map(p).join('')}<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid>${cells}</w:tbl></w:body></w:document>`,
    relationships: [{ id: 'styles', type: relationship, target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
      xml: `<w:styles xmlns:w="${ns}"><w:docDefaults><w:rPrDefault>${property.kind === 'run' ? styleProperty : '<w:rPr/>'}</w:rPrDefault><w:pPrDefault>${property.kind === 'paragraph' ? styleProperty : '<w:pPr/>'}</w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Base"><w:name w:val="Base"/>${styleProperty}</w:style><w:style w:type="paragraph" w:styleId="Derived"><w:name w:val="Derived"/><w:basedOn w:val="Base"/>${styleProperty}</w:style></w:styles>` }],
  });
}

/** Inspect retained XML, independently of whether Tumbler's formatting model recognises the property. */
function verifyProperties(artifact: WordArtifact, property: Property, forms: readonly string[], expectedText: string) {
  const all = paragraphs(artifact);
  assert.equal(all.length, forms.length * 2);
  const ns = OOXML_NAMESPACES[artifact.document.conformance].wordprocessing;
  const child = (element: LosslessXmlElement, name: string) => element.children.filter((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === ns && node.localName === name);
  const source = artifact.document.source;
  const matches = (container: LosslessXmlElement, expected: string) => {
    const elements = child(container, property.name);
    assert.equal(elements.length, expected ? 1 : 0, `${property.name} presence must not change`);
    if (expected) assert.equal(source.source.slice(elements[0]!.span.start, elements[0]!.span.end), expected, `${property.name} lexical form must survive`);
  };
  all.forEach((paragraph, index) => {
    assert.equal(wordParagraphText(artifact.document, paragraph), expectedText);
    const element = source.element(paragraph.elementId)!;
    const pPr = child(element, 'pPr')[0]!;
    const expected = forms[index % forms.length]!;
    if (property.kind === 'paragraph') matches(pPr, expected);
    else {
      matches(child(pPr, 'rPr')[0]!, expected);
      for (const run of child(element, 'r')) {
        const rPr = child(run, 'rPr')[0];
        if (!rPr) assert.equal(expected, '', 'nonempty properties cannot disappear');
        else matches(rPr, expected);
      }
    }
  });
}
function paragraphs(artifact: WordArtifact): WordParagraph[] {
  return artifact.document.blocks.flatMap(block => block.kind === 'paragraph' ? [block] : block.kind === 'table' ? block.rows.flatMap(row => row.cells.flatMap(cell => cell.blocks.filter(block => block.kind === 'paragraph'))) : []);
}
function range(paragraph: WordParagraph, start: number, end: number) {
  return { anchor: { paragraphElementId: paragraph.elementId, offset: start }, focus: { paragraphElementId: paragraph.elementId, offset: end } };
}
