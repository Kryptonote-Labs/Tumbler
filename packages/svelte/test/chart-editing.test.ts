import { expect, test } from 'bun:test';
import { createGridSelection, moveGridSelection } from '@tumblerjs/core';
import {
  chartBytesToBase64,
  createOoxmlChart,
  chartPropertyTree,
  layoutChartScene,
  readChartData,
  type ChartContent,
} from '@tumblerjs/charts';
import {
  applyChartContentEdit,
  applySpreadsheetCommand,
  createChartWorkbook,
  formatCellRange,
  refreshChartWorkbook,
} from '@tumblerjs/sheets';
import {
  applyPresentationCommand as apply,
  createPresentation,
  importNativePresentation,
} from '@tumblerjs/slides';
import {
  CHART_TYPE_FAMILIES,
  currentChartType,
  sameChartType,
} from '../src/chart-properties.ts';

const bytes = (xml: string) => new TextEncoder().encode(xml);
const xml = (source: Uint8Array) => new TextDecoder().decode(source);

function fixture() {
  const workbook = createChartWorkbook(
    createOoxmlChart({
      type: 'barChart',
      categories: ['First', '', 'Last'],
      series: [
        { name: 'Sales', values: [2, null, 4] },
        { name: 'Returns', values: [null, 5, 6] },
        { name: '', values: [null, null, null] },
      ],
    }),
  );
  return {
    ...workbook,
    content: { xml: xml(workbook.source), workbook: chartBytesToBase64(workbook.artifact.bytes()) },
  };
}

const { content: sampleChart } = fixture();
const deck = importNativePresentation(createPresentation());
const slideId = deck.document.slides[0]!.id;
const inserted = apply(deck, {
  name: 'insert-chart',
  slideId,
  bounds: { x: 0, y: 0, width: 480, height: 320 },
  content: sampleChart,
});
const objectKey = inserted.document.slides[0]!.objects.at(-1)!.key;

for (const { change, label } of CHART_TYPE_FAMILIES.flatMap((family) => family.options)) {
  test(`converts to ${label} with blank workbook values`, () => {
    const edited = applyChartContentEdit(sampleChart, change);
    const type = currentChartType(chartPropertyTree(bytes(edited.xml)), 0);
    expect(type && sameChartType(type.change, change)).toBe(true);
    const slide = apply(inserted, { name: 'edit-chart', slideId, objectKey, content: edited })
      .document.slides[0]!;
    const chart = slide.objects.find((object) => object.key === objectKey)?.chart;
    if (chart?.status !== 'supported') throw new Error(`Could not render ${label}`);
    expect(layoutChartScene(chart, 480, 320).marks.length).toBeGreaterThan(0);
    const series = readChartData(bytes(edited.xml))[0]!.series;
    expect(
      series.map((item) => Array.from(item.values?.values ?? [], (point) => point ?? null)),
    ).toEqual([
      [2, null, 4],
      [null, 5, 6],
      [null, null, null],
    ]);
  });
}

test('converts to stacked bar after the last series is removed', () => {
  const { content } = fixture();
  const empty = [0, 0, 0].reduce<ChartContent>(
    (chart, series) => applyChartContentEdit(chart, { series: { action: 'remove', series } }),
    content,
  );
  const change = { type: 'barChart', direction: 'bar', grouping: 'stacked' } as const;
  const converted = applyChartContentEdit(empty, change);
  const source = bytes(converted.xml);
  expect(readChartData(source)[0]!.series).toEqual([]);
  expect(currentChartType(chartPropertyTree(source), 0)?.change).toMatchObject(change);
});

test('clears a rectangular selection and saves shorter chart range bindings', () => {
  const { artifact, source, content } = fixture();
  const bounds = { rows: 4, columns: 4 };
  const start = createGridSelection({ row: 3, column: 1 });
  const right = moveGridSelection(start, 'right', bounds, { extend: true });
  const corner = moveGridSelection(right, 'down', bounds, { extend: true });
  const cleared = applySpreadsheetCommand(artifact, {
    name: 'clear-range',
    sheetId: String(artifact.activeSheet.sheetId),
    range: formatCellRange(corner.range),
  });
  expect(cleared.worksheet.displayText('B4')).toBe('');
  expect(cleared.worksheet.displayText('B2')).toBe('2');

  const sourceWithBlanks = refreshChartWorkbook(source, cleared);
  const updated = {
    ...content,
    xml: xml(sourceWithBlanks),
    workbook: chartBytesToBase64(cleared.bytes()),
  };
  const withoutSeries = applyChartContentEdit(updated, { series: { action: 'remove', series: 2 } });
  const resized = readChartData(bytes(withoutSeries.xml)).map((plot) => ({
    ...plot,
    series: plot.series.map((series, index) => ({
      ...series,
      categories: { ...series.categories!, formula: 'Sheet1!$A$2:$A$3' },
      values: { ...series.values!, formula: index === 0 ? 'Sheet1!$B$2:$B$3' : 'Sheet1!$C$2:$C$3' },
    })),
  }));
  const rebound = applyChartContentEdit(withoutSeries, { data: resized });
  const series = readChartData(bytes(rebound.xml))[0]!.series;
  expect(series.map((item) => item.name)).toEqual(['Sales', 'Returns']);
  expect(series.map((item) => item.categories?.values.length)).toEqual([2, 2]);
  expect(series.map((item) => item.values?.values.length)).toEqual([2, 2]);
});
