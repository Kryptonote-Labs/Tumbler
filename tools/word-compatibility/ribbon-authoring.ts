import assert from 'node:assert/strict';
import { createWordArtifact, openWordArtifact, importWordContent, NativeWordDocument, WORD_HIGHLIGHTS, WORD_SHAPE_PRESETS, WORD_LIST_KINDS, type WordArtifact } from '../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';
import type { Scenario } from './scenarios.ts';
import type { Requirement } from './model.ts';
import type { CoveragePlan } from './coverage.ts';

const highlightTopic = 'ecma-1:17.3.2.15';
const paletteCases = ['strict', 'transitional'].map(profile => `highlight-palette-${profile}`);
export const ribbonScenarios: readonly Scenario[] = [
  ...(['strict', 'transitional'] as const).map((profile): Scenario => ({
    id: `highlight-palette-${profile}`, title: `Write every highlight value in ${profile} markup`,
    topics: [highlightTopic], dimensions: ['write'], oracles: ['assertion', 'openxml'],
    run() {
      const namespace = profile === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const source = openWordArtifact(buildWordDocumentFixture({ conformance: profile, documentXml: `<w:document xmlns:w="${namespace}"><w:body><w:p><w:r><w:rPr><w:highlight w:val="yellow"/><w:shd w:val="clear" w:fill="00FF00"/></w:rPr><w:t>Source</w:t></w:r></w:p></w:body></w:document>` }));
      const model = new NativeWordDocument({ source });
      model.update([...importWordContent(source), { kind: 'paragraph', runs: WORD_HIGHLIGHTS.map(highlight => ({ text: highlight + ' ', format: { highlight } })) }, { kind: 'paragraph', runs: [{ text: 'No direct highlight' }] }]);
      const output = model.artifact();
      const verify = (artifact: WordArtifact) => {
        const blocks = importWordContent(artifact);
        const palette = blocks[1];
        assert.ok(palette?.kind === 'paragraph');
        assert.deepEqual(palette.runs.map(run => run.format?.highlight ?? 'none'), WORD_HIGHLIGHTS);
        const xml = artifact.document.source.source;
        assert.match(xml, /w:fill="00FF00"/);
        assert.match(xml, /w:highlight w:val="yellow"/);
        const plain = blocks[2];
        assert.ok(plain?.kind === 'paragraph');
        assert.ok(plain.runs.every(run => !run.format?.highlight || run.format.highlight === 'none'));
      };
      verify(output);
      assert.throws(() => createWordArtifact({ paragraphs: [{ runs: [{ text: 'Invalid', format: { highlight: 'not-a-highlight' } }] }] }));
      return { fixtures: [{ name: 'palette', bytes: output.bytes(), verify }] };
    },
  })),
  {
    id: 'ribbon-authoring-roundtrip', title: 'Open authored styles, lists, paragraphs, links, page breaks and editable shapes',
    topics: ['ecma-1:17.3.1.26', 'ecma-1:17.3.1.33', 'ecma-1:17.9', 'ecma-1:17.16.22', 'ecma-1:17.3.3.1', 'ecma-1:20.4'],
    dimensions: ['write', 'interoperate'], oracles: ['assertion', 'openxml', 'libreoffice'],
    run() {
      const artifact = createWordArtifact({ paragraphs: [
        { styleId: 'Heading1', runs: [{ text: 'Ribbon authoring' }] },
        { paragraph: { spacingBeforeTwips: 120, spacingAfterTwips: 180, lineSpacing: { rule: 'auto', value: 360 }, shading: '#FFFF00' }, runs: [{ text: 'Hyperlink', link: 'https://example.com/ribbon' }] },
        ...WORD_LIST_KINDS.map(kind => ({ list: { id: kind, kind, level: 0, start: 3 }, runs: [{ text: kind }] })),
        { runs: [{ text: '\u2028', breakType: 'page' }] },
        ...WORD_SHAPE_PRESETS.map(preset => ({ runs: [{ text: '\uFFFC', shape: { preset, width: 72, height: 36, fill: '#ABCDEF', outline: '#123456', outlineWidth: 1 } }] })),
      ] });
      const verify = (output: WordArtifact) => {
        const blocks = importWordContent(output);
        assert.ok(blocks.some(block => block.kind === 'paragraph' && block.runs.some(run => run.text === 'Ribbon authoring')));
        assert.ok(blocks.some(block => block.kind === 'paragraph' && block.runs.some(run => run.link === 'https://example.com/ribbon')));
        assert.equal(output.document.drawings.size, WORD_SHAPE_PRESETS.length);
      };
      verify(artifact);
      return { fixtures: [{ name: 'ribbon-authoring', bytes: artifact.bytes(), verify }] };
    },
  },
];
export const ribbonRequirements: readonly Requirement[] = [{
  id: 'write.highlight-palette', dimension: 'write', title: 'Serialize the complete text highlight palette', topics: [highlightTopic],
  criteria: 'ECMA-376 Part 1 §17.3.2.15 requires val from ST_HighlightColor. Emit all 17 tokens including none, omit unrequested direct highlight, reject invalid values, and retain a source run where highlight and shading coexist. Verify Strict and Transitional outputs with assertions and Open XML SDK. This qualifies serialization only; inherited appearance and precedence rendering are not claimed.',
  checks: paletteCases.flatMap(scenario => (['assertion', 'openxml'] as const).map(oracle => ({ scenario, oracle }))),
}, ...(['write', 'interoperate'] as const).map(dimension => ({
  id: `${dimension}.ribbon-authoring`, dimension, title: 'Round-trip ribbon-authored document structures', topics: ribbonScenarios.at(-1)!.topics,
  criteria: 'A generated document with a named heading, paragraph spacing and shading, all supported list kinds, an external hyperlink, a page break and all seven editable shapes remains readable and passes package validation. This is bounded evidence, not full topic qualification.',
  checks: (dimension === 'write' ? ['assertion', 'openxml'] as const : ['assertion', 'openxml', 'libreoffice'] as const).map(oracle => ({ scenario: 'ribbon-authoring-roundtrip', oracle })),
}))];
export const ribbonPlans: readonly CoveragePlan[] = [{ topic: highlightTopic, dimension: 'write',
  obligations: 'ECMA-376 Part 1 §17.3.2.15 and ST_HighlightColor §17.18.40: serialize every legal required val token, including explicit none; omit absent direct formatting; reject invalid tokens; retain independent shading. Both conformance profiles pass SDK validation. Default inheritance and highlight-over-shading display precedence are read/render obligations and receive no credit here.',
  requirements: ['write.highlight-palette'],
}];
