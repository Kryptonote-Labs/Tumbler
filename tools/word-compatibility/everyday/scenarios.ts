import assert from 'node:assert/strict';
import { createWordArtifact, openWordArtifact, WordEditingSession, wordParagraphText, type WordArtifact } from '../../../packages/word/src/index.ts';
import type { Scenario } from '../scenarios.ts';
import type { Requirement } from '../model.ts';

function paragraphs(artifact: WordArtifact) { return artifact.document.blocks.filter(block => block.kind === 'paragraph'); }
function range(artifact: WordArtifact, index: number, start: number, end = start) {
  const paragraph = paragraphs(artifact)[index];
  assert.ok(paragraph);
  return { anchor: { paragraphElementId: paragraph.elementId, offset: start }, focus: { paragraphElementId: paragraph.elementId, offset: end } };
}
function texts(artifact: WordArtifact) { return paragraphs(artifact).map(paragraph => wordParagraphText(artifact.document, paragraph)); }
const topic = 'ecma-1:17.3.3.31';
export const everydayScenarios: readonly Scenario[] = [
  { id: 'everyday-letter', title: 'Author, edit, format and round-trip a letter', topics: [topic], dimensions: ['edit'], oracles: ['assertion', 'openxml', 'libreoffice'],
    run() {
      const original = createWordArtifact({ defaultFormat: { fontFamily: 'Liberation Serif', fontSizePoints: 11 }, paragraphs: [
        { runs: [{ text: 'Project update' }] }, { runs: [{ text: 'Hello Alex, we meet Monday.' }] }, { runs: [{ text: 'Regards, the team' }] },
      ] });
      const history = new WordEditingSession(original);
      history.replaceText(range(original, 1, 20, 26), 'Tuesday');
      assert.deepEqual(history.undo().bytes(), original.bytes());
      const redone = history.redo();
      const edited = redone.applyFormatting(range(redone, 0, 0, 14), { text: { bold: { set: true }, fontSize: { set: 18 } }, block: { horizontalAlignment: { set: 'center' } } });
      const verify = (artifact: WordArtifact) => {
        assert.deepEqual(texts(artifact), ['Project update', 'Hello Alex, we meet Tuesday.', 'Regards, the team']);
        const [heading, body] = paragraphs(artifact);
        assert.ok(heading && body);
        assert.equal(artifact.document.styles.paragraphFormat(artifact.document, heading).alignment, 'center');
        for (const [paragraph, fontSize, bold] of [[heading, 18, true], ...paragraphs(artifact).slice(1).map(paragraph => [paragraph, 11, false] as const)] as const) {
          const runs = paragraph.inlines.filter(item => item.kind === 'run');
          assert.ok(runs.length > 0);
          for (const run of runs) {
            const format = artifact.document.styles.runFormat(artifact.document, paragraph, run);
            assert.equal(format.fontSizePoints, fontSize);
            assert.equal(format.bold, bold);
          }
        }
      };
      verify(openWordArtifact(edited.bytes()));
      return { fixtures: [{ name: 'edited-letter', bytes: edited.bytes(), verify }] };
    },
  },
  { id: 'everyday-notes', title: 'Split, join and undo meeting-note paragraphs', topics: [topic], dimensions: ['edit'], oracles: ['assertion', 'openxml'],
    run() {
      const original = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Discuss budget' }] }, { runs: [{ text: 'Next: café 😀' }] }] });
      const history = new WordEditingSession(original);
      const split = history.replaceText(range(original, 0, 7), '\n');
      const splitExpected = ['Discuss', ' budget', 'Next: café 😀'];
      assert.deepEqual(texts(split), splitExpected);
      const all = paragraphs(split);
      const joined = split.replaceText({ anchor: { paragraphElementId: all[0]!.elementId, offset: 7 }, focus: { paragraphElementId: all[1]!.elementId, offset: 0 } }, '');
      assert.deepEqual(texts(joined), ['Discuss budget', 'Next: café 😀']);
      assert.deepEqual(history.undo().bytes(), original.bytes());
      assert.deepEqual(texts(history.redo()), splitExpected);
      return { fixtures: [
        { name: 'split-notes', bytes: split.bytes(), verify: artifact => assert.deepEqual(texts(artifact), splitExpected) },
        { name: 'joined-notes', bytes: joined.bytes(), verify: artifact => assert.deepEqual(texts(artifact), ['Discuss budget', 'Next: café 😀']) },
      ] };
    },
  },
];
export const everydayRequirements: readonly Requirement[] = everydayScenarios.map(scenario => ({
  id: scenario.id.replace('everyday-', 'everyday.'), title: scenario.title, dimension: 'edit', topics: [topic],
  criteria: scenario.id === 'everyday-letter' ? 'Replace the meeting day, undo/redo, format the heading and reopen the letter through LibreOffice with exact paragraph text, heading alignment, 18pt bold heading and unaffected 11pt plain body.' : 'Split and rejoin a meeting-note paragraph, preserve the adjacent Unicode paragraph, undo exactly and redo the split; both outputs pass SDK validation.',
  checks: scenario.oracles.map(oracle => ({ scenario: scenario.id, oracle })),
}));
