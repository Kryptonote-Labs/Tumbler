import assert from 'node:assert/strict';
import { createWordArtifact, importWordContent, NativeWordDocument, type WordArtifact } from '../../packages/word/src/index.ts';
import type { Scenario } from './scenarios.ts';
import type { Requirement } from './model.ts';

const topics = ['ecma-1:17.3.2.37', 'ecma-1:17.3.2.15', 'ecma-1:17.3.2.42', 'ecma-1:17.3.2.35'];
export const characterFormattingScenarios: readonly Scenario[] = [{
  id: 'authored-character-formatting', title: 'Author and clear character formatting in an imported document',
  topics, dimensions: ['write', 'edit', 'interoperate'], oracles: ['assertion', 'openxml', 'libreoffice'],
  run() {
    const source = createWordArtifact({ paragraphs: [{ runs: [
      { text: 'Marked', format: { strike: true, highlight: 'yellow', verticalAlign: 'superscript', characterSpacingPoints: 1 } },
      { text: ' unchanged' },
    ] }] });
    const verify = (cleared: boolean) => (artifact: WordArtifact) => {
      const block = importWordContent(artifact)[0];
      assert.ok(block?.kind === 'paragraph');
      assert.equal(block.runs.map(run => run.text).join(''), 'Marked unchanged');
      const format = block.runs[0]!.format!;
      assert.equal(format.strike, !cleared);
      assert.equal(format.verticalAlign, cleared ? 'baseline' : 'superscript');
      assert.equal(format.characterSpacingPoints ?? 0, cleared ? 0 : 1);
      if (!cleared) assert.equal(format.highlight, 'yellow');
      else assert.ok(format.highlight === undefined || format.highlight === 'none');
      assert.equal(block.runs.at(-1)!.format?.strike, false);
    };
    verify(false)(source);
    const blocks = importWordContent(source);
    const first = blocks[0]!;
    assert.ok(first.kind === 'paragraph');
    const model = new NativeWordDocument({ source });
    model.update([{ ...first, runs: [{ ...first.runs[0]!, format: { ...first.runs[0]!.format, strike: false, highlight: 'none', verticalAlign: 'baseline', characterSpacingPoints: 0 } }, ...first.runs.slice(1)] }]);
    const edited = model.artifact();
    verify(true)(edited);
    return { fixtures: [{ name: 'formatted', bytes: source.bytes(), verify: verify(false) }, { name: 'cleared', bytes: edited.bytes(), verify: verify(true) }] };
  },
}];
export const characterFormattingRequirements: readonly Requirement[] = ['write', 'edit', 'interoperate'].map(dimension => ({
  id: `${dimension}.authored-character-formatting`, dimension: dimension as 'write' | 'edit' | 'interoperate',
  title: 'Author and clear strike, highlight, superscript and character spacing', topics,
  criteria: 'The Marked run carries strike, yellow highlight, superscript and 1pt character spacing. An imported native edit clears those properties without changing text or the neighbouring plain run. Both packages pass SDK validation; interoperability additionally verifies LibreOffice output. This is bounded evidence, not complete topic qualification.',
  checks: ['assertion', 'openxml', ...(dimension === 'interoperate' ? ['libreoffice'] : [])].map(oracle => ({ scenario: 'authored-character-formatting', oracle: oracle as 'assertion' | 'openxml' | 'libreoffice' })),
}));
