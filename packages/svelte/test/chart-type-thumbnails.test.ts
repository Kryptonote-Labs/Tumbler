import { expect, test } from 'bun:test';
import { parseLosslessXml } from '@tumblerjs/ooxml';
import { CHART_TYPE_FAMILIES } from '../src/chart-properties';
import { chartTypePreview } from '../src/chart-type-preview';

const options = CHART_TYPE_FAMILIES.flatMap((family) => family.options);

test('every selectable chart variant has self-contained SVG gallery artwork', async () => {
  for (const option of options) {
    const url = chartTypePreview(option.change);
    expect(url, option.label).toBeDefined();
    const document = parseLosslessXml(await Bun.file(new URL(url!)).bytes());
    expect(document.root.localName, option.label).toBe('svg');
    expect(document.root.attributes.find(attribute => attribute.localName === 'viewBox')?.value).toBe('0 0 120 72');
    expect(document.elements().some(element => ['path','rect','circle','line'].includes(element.localName))).toBe(true);
    expect(document.elements().some(element => ['script','image','use','foreignObject'].includes(element.localName))).toBe(false);
  }
});

test('gallery artwork distinguishes grouping, orientation and dimensional variants', async () => {
  const names = [
    'Clustered column',
    'Stacked column',
    '100% stacked column',
    'Clustered bar',
    '3-D clustered column',
  ];
  const artwork = await Promise.all(
    names.map(async (name) => {
      const option = options.find((option) => option.label === name)!;
      return Bun.file(new URL(chartTypePreview(option.change)!)).text();
    }),
  );
  expect(new Set(artwork).size).toBe(names.length);
});
