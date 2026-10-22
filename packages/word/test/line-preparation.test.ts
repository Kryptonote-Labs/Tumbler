import { expect, test } from 'bun:test';
import { layoutWordDocument, type WordLayoutOptions } from '../src/index.ts';
import { lineDocument, fixedMeasurer } from './line-layout-fixture.ts';

test('preparation budgets stop whitespace before measuring the whole paragraph', () => {
  for (const options of [{ maxCharacters: 100 }, { maxAtoms: 100 }, { maxMeasurements: 100 }] satisfies WordLayoutOptions[]) {
    let calls = 0;
    expect(() => layoutWordDocument(lineDocument(' '.repeat(150_000)), { measure(text) { calls++; return fixedMeasurer.measure(text); } }, options)).toThrow('Layout exceeds 100 prepared');
    expect(calls).toBeLessThanOrEqual(101);
  }
});

test('large permitted whitespace has no argument-count limit and retains offsets', () => {
  const layout = layoutWordDocument(lineDocument(' '.repeat(150_000)), fixedMeasurer, { maxCharacters: 200_000, maxAtoms: 200_000, maxMeasurements: 200_001 });
  expect(layout.pages[0]!.columns[0]!.lines[0]!.endOffset).toBe(150_000);
  expect(layout.fragmentCount).toBe(0);
});

test('page previews stop preparing within one long paragraph, including keepLines lookahead', () => {
  for (const properties of ['', '<w:keepLines/><w:widowControl/>']) {
    let calls = 0;
    const document = lineDocument('word '.repeat(40_000), properties);
    const layout = layoutWordDocument(document, { measure(text) { calls++; return fixedMeasurer.measure(text); } }, { pageLimit: 1, maxMeasurements: 500 });
    expect(layout.truncated).toBe(true);
    expect(layout.pages).toHaveLength(1);
    expect(calls).toBeLessThan(200);
  }
});

test('fragment and page limits stop consuming a long paragraph', () => {
  for (const options of [{ maxFragments: 1 }, { maxPages: 1 }] satisfies WordLayoutOptions[]) {
    let calls = 0;
    expect(() => layoutWordDocument(lineDocument('word '.repeat(40_000)), { measure(text) { calls++; return fixedMeasurer.measure(text); } }, options)).toThrow();
    expect(calls).toBeLessThan(120);
  }
});
