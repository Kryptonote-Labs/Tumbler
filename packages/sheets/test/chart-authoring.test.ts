import { expect, test } from 'bun:test';
import { createSpreadsheet, applySpreadsheetCommand, spreadsheetChartContent, spreadsheetDrawingObjectId, createChartWorkbook, refreshChartWorkbook } from '../src/index.ts';
import { createOoxmlChart, convertChartType, readChartData } from '@tumblerjs/charts';

const source = () => createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Sales', values: [2, 4] }] });
test('spreadsheet native chart insertion, type editing and deletion retain one editable drawing', () => {
  const original = createSpreadsheet();
  let chart = applySpreadsheetCommand(original, { name: 'insert-chart', sheetId: '1', x: 100, y: 60, width: 480, height: 320, content: { xml: new TextDecoder().decode(source()) } });
  const drawing = chart.worksheet.drawing!;
  expect(drawing.charts).toHaveLength(1);
  const id = spreadsheetDrawingObjectId(drawing, drawing.charts[0]!.anchor);
  if (id === undefined) throw new Error('Chart object ID is missing.');
  const content = spreadsheetChartContent(chart, id);
  const converted = convertChartType(new TextEncoder().encode(content.xml), { type: 'radarChart', radarStyle: 'filled' });
  chart = applySpreadsheetCommand(chart, { name: 'edit-chart', sheetId: '1', objectId: id, content: { ...content, xml: new TextDecoder().decode(converted) } });
  expect(chart.worksheet.drawing?.charts[0]?.model).toMatchObject({ status: 'supported', kind: 'radar', radarStyle: 'filled' });
  const removed = applySpreadsheetCommand(chart, { name: 'delete-drawing', sheetId: '1', objectId: id });
  expect(removed.worksheet.drawing?.charts).toHaveLength(0);
  expect(original.worksheet.drawing).toBeUndefined();
});

test('embedded chart workbook recalculates formulas and preserves unchanged literal values', () => {
  const workbook = createChartWorkbook(source());
  const edited = workbook.artifact.editFormula('B2', '3*5').editCell('A3', 'Changed');
  const chart = readChartData(refreshChartWorkbook(workbook.source, edited));
  expect(chart[0]?.series[0]?.values?.values).toEqual([15, 4]);
  expect(chart[0]?.series[0]?.categories?.values).toEqual(['A', 'Changed']);
});

test('extending a chart workbook preserves separate bound ranges with identical cached labels', async () => {
  const { extendChartWorkbook } = await import('../src/index.ts');
  const { bindChartData } = await import('@tumblerjs/charts');
  const source = createOoxmlChart({ type: 'lineChart', categories: ['A', 'B'], series: [{ name: 'One', values: [1, 2] }, { name: 'Two', values: [3, 4] }] });
  const bound = bindChartData(source, readChartData(source).map(plot => ({ ...plot, series: plot.series.map((series, index) => ({ ...series, categories: { ...series.categories!, formula: `Sheet1!${index ? 'C' : 'A'}2:${index ? 'C' : 'A'}3` } })) })));
  const extended = readChartData(extendChartWorkbook(bound, createSpreadsheet()).source);
  expect(extended[0]?.series.map(series => series.categories?.formula)).toEqual(['Sheet1!A2:A3', 'Sheet1!C2:C3']);
});

test('chart inspection reflects live source formulas without mutating the workbook', () => {
  const created = createChartWorkbook(source());
  let artifact = applySpreadsheetCommand(created.artifact, { name: 'insert-chart', sheetId: '1', x: 10, y: 10, width: 480, height: 320, content: { xml: new TextDecoder().decode(created.source) } });
  artifact = applySpreadsheetCommand(artifact, { name: 'set-formula', sheetId: '1', reference: 'B2', formula: '6*7' });
  const drawing = artifact.worksheet.drawing!;
  const objectId = spreadsheetDrawingObjectId(drawing, drawing.charts[0]!.anchor);
  if (objectId === undefined) throw new Error('Chart object ID is missing.');
  const before = artifact.bytes();
  const content = spreadsheetChartContent(artifact, objectId);
  expect(readChartData(new TextEncoder().encode(content.xml))[0]?.series[0]?.values?.values).toEqual([42, 4]);
  expect(artifact.bytes()).toEqual(before);
});
