import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutWordDocument, openWordArtifact, wordParagraphText, type WordArtifact } from '../../../packages/word/src/index.ts';
import { sha256 } from '../inventory.ts';
import type { Scenario } from '../scenarios.ts';
import { renderCases, renderInput } from './cases.ts';
import reference from './reference/geometry.json';

export const renderTopics = { size: 'ecma-1:17.6.13', breaks: 'ecma-1:17.3.3.1', spacing: 'ecma-1:17.3.1.33' } as const;
export type ReferencePage = typeof reference.records[number]['pages'][number];
// Fixed Liberation Serif 11pt vertical metrics already used by line-spacing.test.ts.
// Width is synthetic: these fixtures do not qualify glyph widths, shaping or wrapping.
const measure = { measure: (text: string) => ({ width: text.length * 5, ascent: 10.25, descent: 2.4 }) };
const close = (actual: number, expected: number, label: string) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 0.1, `${label}: ${actual} differs from ${expected} by more than 0.1pt`);

export function compareLayout(artifact: WordArtifact, pages: readonly ReferencePage[], compareAdvances: boolean) {
  const actual = layoutWordDocument(artifact.document, measure).pages;
  assert.equal(actual.length, pages.length, 'reference page count');
  actual.forEach((page, index) => {
    const expected = pages[index]!;
    close(page.width, expected.width, 'page width');
    close(page.height, expected.height, 'page height');
    const lines = page.columns.flatMap(column => column.lines).filter(line => line.fragments.some(fragment => fragment.text));
    assert.deepEqual(lines.map(line => line.fragments.map(fragment => fragment.text).join('')), expected.words.map(word => word.text), 'exact text and page assignment');
    lines.forEach((line, i) => {
      close(line.fragments.find(fragment => fragment.text)!.x, expected.words[i]!.x, 'text left edge');
      if (compareAdvances) close(line.baseline - lines[0]!.baseline, expected.words[i]!.y - expected.words[0]!.y, 'baseline advance');
    });
  });
}

export const renderScenarios: readonly Scenario[] = (['strict', 'transitional'] as const).flatMap(profile => {
  return renderCases.map(item => ({
    id: `render-${item.id}-${profile}`, title: `Compare ${item.id} with pinned LibreOffice PDF (${profile})`,
    topics: [renderTopics[item.group]], dimensions: ['render'], oracles: ['assertion', 'openxml', 'reference-layout'],
    run() {
      const input = renderInput(item, profile);
      const verify = (artifact: WordArtifact) => {
        assert.equal(artifact.document.conformance, profile);
        const text = artifact.document.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(artifact.document, block)).join('').replaceAll('\n', '');
        assert.equal(text, item.group === 'spacing' || item.id === 'explicit-line-breaks' ? 'AlphaBravoCharlie' : 'AlphaBravo');
      };
      return { fixtures: [{ name: item.id, bytes: input.bytes, verify }], referenceLayout() {
        const id = `${item.id}-${profile}`, record = reference.records.find(record => record.id === id);
        assert.ok(record, `missing reference ${id}`);
        assert.equal(sha256(new TextEncoder().encode(input.xml)), record.inputSha256, 'reference input must match current fixture');
        const pdf = readFileSync(new URL(`./reference/${id}.pdf`, import.meta.url));
        assert.equal(sha256(pdf), record.pdfSha256, 'reference PDF digest');
        compareLayout(openWordArtifact(input.bytes), record.pages, item.compareAdvances);
        return [{ name: `${id}.pdf`, bytes: pdf }, { name: 'geometry.json', bytes: readFileSync(new URL('./reference/geometry.json', import.meta.url)) }];
      } };
    },
  }));
});
