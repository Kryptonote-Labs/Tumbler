import { expect, test } from 'bun:test';
import { NativeWordDocument, createWordArtifact, type WordContentBlock, type WordTextMeasurer } from '../src/index.ts';

const measurer: WordTextMeasurer = {
  measure: (text, format) => ({ width: text.length * format.fontSizePoints / 2, ascent: format.fontSizePoints * .8, descent: format.fontSizePoints * .2 }),
};
const paragraph = (text: string): WordContentBlock => ({ kind: 'paragraph', runs: [{ text }] });

for (const [name, blocks] of [
  ['paragraphs', Array.from({ length: 150 }, (_, i) => paragraph(`Paragraph ${i} with text that wraps onto several lines. `.repeat(3)))],
  ['table', [{ kind: 'table', rows: Array.from({ length: 90 }, (_, i) => [{ blocks: [paragraph(`Row ${i} `.repeat(20))] }]) }]],
] satisfies [string, WordContentBlock[]][]) {
  test(`progressive ${name} layout resumes and matches synchronous pagination`, () => {
    const model = new NativeWordDocument({ content: blocks, page: { width: 300, height: 300, margin: 20 } });
    const iterator = model.layoutProgressively(measurer);
    let step = iterator.next();
    expect(step.done).toBe(false);
    expect(step.value.pages.length).toBe(1);
    const first = JSON.stringify(step.value);
    const initial = step.value;
    let yields = 0;
    while (!step.done) { yields++; step = iterator.next(); }
    expect(yields).toBeGreaterThan(2);
    expect(JSON.stringify(initial)).toBe(first);
    expect(step.value).toEqual(model.layout(measurer));
  });
}

test('initial collaborative content replaces source content without losing retained properties', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Original' }] }] });
  const content = [paragraph('Edited')];
  const direct = new NativeWordDocument({ source, content });
  const updated = new NativeWordDocument({ source });
  updated.update(content);
  const contentLayout = (model: NativeWordDocument) => model.layout(measurer).pages.map(page => ({
    width: page.width, height: page.height,
    lines: page.columns.flatMap(column => column.lines.map(line => ({ x: line.x, y: line.y, width: line.width,
      fragments: line.fragments.map(fragment => ({ text: fragment.text, format: fragment.format })) }))),
  }));
  expect(contentLayout(direct)).toEqual(contentLayout(updated));
  expect(direct.paragraphs().map(p => p.text)).toEqual(['Edited']);
});

test('an abandoned pagination can be replaced after an edit', () => {
  const model = new NativeWordDocument({ content: Array.from({ length: 100 }, () => paragraph('Old '.repeat(30))) });
  const iterator = model.layoutProgressively(measurer);
  expect(iterator.next().done).toBe(false);
  iterator.return(model.layout(measurer));
  model.update([paragraph('New')]);
  const final = model.layoutProgressively(measurer).next();
  expect(final.done).toBe(true);
  expect(final.value).toEqual(model.layout(measurer));
});

test('progressive layout resolves total-page fields on completion', () => {
  const doc = new NativeWordDocument({ page: { width: 150, height: 100, margin: 20 }, content: Array.from({ length: 30 }, () => paragraph('Body')) });
  doc.updateStory({ section: 0, kind: 'footer', type: 'default' }, [{ kind: 'paragraph', runs: [
    { text: '\uFFFC', field: 'PAGE' }, { text: ' of ' }, { text: '\uFFFC', field: 'NUMPAGES' },
  ] }]);
  const iterator = doc.layoutProgressively(measurer);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  expect(step.value).toEqual(doc.layout(measurer));
  expect(step.value.pages.map(page => page.footerLines.flatMap(line => line.fragments.map(fragment => fragment.text)).join('')))
    .toEqual(step.value.pages.map((_, i) => `${i + 1} of ${step.value.pages.length}`));
});
