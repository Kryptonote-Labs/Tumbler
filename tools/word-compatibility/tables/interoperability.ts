import assert from 'node:assert/strict';
import { wordParagraphText } from '../../../packages/word/src/index.ts';
import type { Scenario } from '../scenarios.ts';
import { cases } from './cases.ts';
import { tablePreservationScenarios } from './preservation.ts';
import { verifyTable } from './scenarios.ts';

// Consumer rewrites may normalise markup; require the independently specified grid and text.
export const tableInteropProbeScenarios: readonly Scenario[] = tablePreservationScenarios
  .filter(scenario => scenario.id.includes('-merge-'))
  .map(preserve => ({
    id: preserve.id.replace('-preserve-', '-interop-'), title: 'Retain merged table semantics through LibreOffice after a neighbouring edit',
    topics: preserve.topics, dimensions: ['interoperate'], oracles: ['assertion', 'openxml', 'libreoffice'],
    run() {
      return { fixtures: preserve.run().fixtures.map(fixture => ({ ...fixture, verify(artifact) {
        const expected = cases.find(item => fixture.name === `${item.name}-before` || fixture.name === `${item.name}-after`)!;
        verifyTable(artifact, expected, false);
        const neighbour = artifact.document.blocks.at(-1);
        assert.ok(neighbour?.kind === 'paragraph');
        assert.equal(wordParagraphText(artifact.document, neighbour), fixture.name.endsWith('-after') ? 'Changed' : 'Neighbour');
      } })) };
    },
  }));

/** Narrow evidence only. The full merge interoperability requirement remains pending. */
export const tableInteropScenarios: readonly Scenario[] = tableInteropProbeScenarios.map(probe => ({
  ...probe, id: probe.id.replace('-merge-', '-independent-merges-'),
  title: 'LibreOffice retains independent vertical merges and restarts after neighbouring edits',
  run: () => ({ fixtures: probe.run().fixtures.filter(fixture => fixture.name.startsWith('independent-merges-and-restart-')) }),
}));
