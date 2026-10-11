import { expect, test } from 'bun:test';
import { openWordArtifact } from '../../../packages/word/src/index.ts';
import { renderCases, renderInput } from '../render/cases.ts';
import { compareLayout } from '../render/scenarios.ts';
import reference from '../render/reference/geometry.json';

test('reference geometry rejects changed page size, page assignment and line advances', () => {
  const item = renderCases.find(item => item.id === 'spacing-single')!;
  const artifact = openWordArtifact(renderInput(item, 'strict').bytes);
  const pages = reference.records.find(record => record.id === `${item.id}-strict`)!.pages;
  for (const mutate of [
    (copy: typeof pages) => { copy[0]!.width += 1; },
    (copy: typeof pages) => { copy.push(copy[0]!); },
    (copy: typeof pages) => { copy[0]!.words[0]!.text = 'Wrong'; },
    (copy: typeof pages) => { copy[0]!.words[1]!.y += 1; },
    (copy: typeof pages) => { copy[0]!.words[0]!.x += 1; },
  ]) {
    const copy = structuredClone(pages);
    mutate(copy);
    expect(() => compareLayout(artifact, copy, true)).toThrow();
  }
});
