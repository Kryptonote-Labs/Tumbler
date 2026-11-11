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
