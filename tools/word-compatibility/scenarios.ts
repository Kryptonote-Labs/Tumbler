import { tableScenarios } from './tables/scenarios.ts';
import { preservationScenarios } from './preservation/scenarios.ts';
import assert from 'node:assert/strict';
import { openZipArchive } from '../../packages/opc/src/index.ts';
import { createWordArtifact, openWordArtifact, wordParagraphText, WordEditingSession, type WordArtifact } from '../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';
import type { ScenarioDefinition } from './model.ts';

export interface Fixture {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** Independent consumer output must preserve these explicit semantics. */
  readonly verify: (artifact: WordArtifact) => void;
}
export interface Scenario extends ScenarioDefinition {
  readonly run: () => { readonly fixtures: readonly Fixture[]; readonly comparePackages?: () => void };
}

const textTopic = 'ecma-1:17.3.3.31';
const boldTopic = 'ecma-1:17.3.2.1';
const documentTopic = 'ecma-1:17.2.3';
const profiles = ['strict', 'transitional'] as const;
const values = [
  ['ascii', 'Hello world'], ['spaces', '  leading  and trailing  '],
  ['xml-escaping', 'A < B & C > D "quoted"'], ['unicode', 'café Ελληνικά العربية 中文 😀 e\u0301'],
] as const;

export const scenarios: readonly Scenario[] = [
  ...preservationScenarios,
  ...tableScenarios,
  ...profiles.flatMap(profile => values.map(([name, value]): Scenario => ({
    id: `${profile}-text-${name}`,
    title: `Read, no-op save and replace ${name} text in ${profile} markup`,
    topics: [textTopic], dimensions: ['read', 'preserve', 'write', 'edit', 'interoperate'],
    oracles: ['assertion', 'package-diff', 'openxml', 'libreoffice'],
    run() {
      const bytes = fixture(profile, `<w:p><w:r><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`);
      const original = openWordArtifact(bytes);
      assert.equal(text(original), value);
      const edited = original.replaceText(range(original, 0, value.length), 'Replaced <&> 😀');
      assert.equal(text(edited), 'Replaced <&> 😀');
      const history = new WordEditingSession(original);
      history.replaceText(range(original, 0, value.length), 'Replaced <&> 😀');
      assert.deepEqual(history.undo().bytes(), bytes);
      assert.equal(text(history.redo()), 'Replaced <&> 😀');
      return {
        fixtures: [output('before', original, value), output('after', edited, 'Replaced <&> 😀')],
        comparePackages() {
          assert.deepEqual(original.bytes(), bytes, 'no-op package bytes');
          compareUntouched(bytes, edited.bytes(), ['word/document.xml']);
        },
      };
    },
  }))),
  ...profiles.map((profile): Scenario => ({
    id: `${profile}-relocated-main`, title: `Find a relocated ${profile} main part through relationships`,
    topics: ['ecma-1:9.2', documentTopic], dimensions: ['read', 'preserve', 'write', 'interoperate'],
    oracles: ['assertion', 'package-diff', 'openxml', 'libreoffice'],
    run() {
      const bytes = buildWordDocumentFixture({ conformance: profile, documentItemName: 'content/report.xml', documentXml: documentXml(profile, '<w:p><w:r><w:t>Relocated</w:t></w:r></w:p>') });
      const artifact = openWordArtifact(bytes);
      assert.equal(text(artifact), 'Relocated');
      return { fixtures: [output('relocated', artifact, 'Relocated')], comparePackages: () => assert.deepEqual(artifact.bytes(), bytes) };
    },
  })),
  ...profiles.map((profile): Scenario => ({
    id: `${profile}-opaque-part`, title: `Preserve unrelated custom XML bytes while editing ${profile} body text`,
    topics: [textTopic, 'ecma-1:9.2'], dimensions: ['preserve', 'edit', 'write', 'interoperate'],
    oracles: ['assertion', 'package-diff', 'openxml', 'libreoffice'],
    run() {
      const bytes = buildWordDocumentFixture({ conformance: profile, documentXml: documentXml(profile, '<w:p><w:r><w:t>Original</w:t></w:r></w:p>'),
        parts: [{ itemName: 'customXml/item1.xml', contentType: 'application/xml', xml: '<customer xmlns="urn:tumbler:fixture" untouched="yes">opaque &amp; data</customer>' }] });
      const original = openWordArtifact(bytes);
      const edited = original.replaceText(range(original, 0, 8), 'Edited');
      assert.equal(text(edited), 'Edited');
      return { fixtures: [output('before', original, 'Original'), output('after', edited, 'Edited')], comparePackages: () => compareUntouched(bytes, edited.bytes(), ['word/document.xml']) };
    },
  })),
  ...profiles.map((profile): Scenario => ({
    id: `${profile}-bold-range`, title: `Apply explicit bold to a substring in ${profile} text`,
    topics: [boldTopic, textTopic], dimensions: ['read', 'preserve', 'write', 'edit', 'interoperate'],
    oracles: ['assertion', 'package-diff', 'openxml', 'libreoffice'],
    run() {
      const original = openWordArtifact(fixture(profile, '<w:p><w:r><w:t>left bold right</w:t></w:r></w:p>'));
      const edited = original.applyFormatting(range(original, 5, 9), { text: { bold: { set: true } } });
      const verify = (artifact: WordArtifact) => {
        assert.equal(text(artifact), 'left bold right');
        const bold = artifact.formattingState(range(artifact, 5, 9)).text.bold;
        assert.ok('value' in bold && bold.value === true);
        const plain = artifact.formattingState(range(artifact, 0, 4)).text.bold;
        assert.ok(!('value' in plain) || plain.value !== true);
      };
      verify(edited);
      return { fixtures: [{ name: 'formatted', bytes: edited.bytes(), verify }], comparePackages: () => compareUntouched(original.bytes(), edited.bytes(), ['word/document.xml']) };
    },
  })),
  {
    id: 'authored-mixed-runs', title: 'Author paragraphs with explicit mixed formatting and Unicode',
    topics: [textTopic, boldTopic, documentTopic], dimensions: ['write', 'read', 'interoperate'],
    oracles: ['assertion', 'openxml', 'libreoffice'],
    run() {
      const artifact = createWordArtifact({ paragraphs: [
        { runs: [{ text: 'Report ', format: { bold: true } }, { text: '中文 😀', format: { italic: true } }] },
        { runs: [{ text: 'Second paragraph' }] },
      ] });
      const verify = (value: WordArtifact) => {
        assert.equal(text(value), 'Report 中文 😀\nSecond paragraph');
        const bold = value.formattingState(range(value, 0, 6)).text.bold;
        const italic = value.formattingState(range(value, 7, 12)).text.italic;
        assert.ok('value' in bold && bold.value === true);
        assert.ok('value' in italic && italic.value === true);
      };
      verify(openWordArtifact(artifact.bytes()));
      return { fixtures: [{ name: 'authored', bytes: artifact.bytes(), verify }] };
    },
  },
];

function xml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function documentXml(profile: typeof profiles[number], body: string) {
  const namespace = profile === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return `<w:document xmlns:w="${namespace}"><w:body>${body}</w:body></w:document>`;
}
function fixture(profile: typeof profiles[number], body: string) {
  return buildWordDocumentFixture({ conformance: profile, documentXml: documentXml(profile, body) });
}
function text(artifact: WordArtifact) {
  return artifact.document.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(artifact.document, block)).join('\n');
}
function range(artifact: WordArtifact, start: number, end: number) {
  const paragraph = artifact.document.blocks.find(block => block.kind === 'paragraph');
  assert.ok(paragraph, 'fixture paragraph');
  return { anchor: { paragraphElementId: paragraph.elementId, offset: start }, focus: { paragraphElementId: paragraph.elementId, offset: end } };
}
function output(name: string, artifact: WordArtifact, expected: string): Fixture {
  return { name, bytes: artifact.bytes(), verify: value => assert.equal(text(value), expected) };
}

/** Compare entry sets and every unmodified payload, not just text reparsed by Tumbler. */
export function compareUntouched(before: Uint8Array, after: Uint8Array, allowed: readonly string[]) {
  const a = openZipArchive(before), b = openZipArchive(after);
  assert.deepEqual(a.entries.map(entry => entry.name).sort(), b.entries.map(entry => entry.name).sort(), 'package entry set');
  for (const entry of a.entries) {
    if (allowed.includes(entry.name)) continue;
    const other = b.get(entry.name);
    assert.ok(other, `Missing part ${entry.name}`);
    assert.deepEqual(a.read(entry), b.read(other), `Unexpected change to ${entry.name}`);
  }
}
