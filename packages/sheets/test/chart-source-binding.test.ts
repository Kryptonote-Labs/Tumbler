import { expect, test } from 'bun:test';
import { applySpreadsheetCommand, spreadsheetChartContent, spreadsheetDrawingObjectId, createChartWorkbook } from '../src/index.ts';
import { createOoxmlChart, convertChartType, readChartData } from '@tumblerjs/charts';
const source = () => createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Sales', values: [2, 4] }] });

test('type changes bind new numeric roles to the existing host data sheet in the same edit', () => {
  const created = createChartWorkbook(source());
  let artifact = applySpreadsheetCommand(created.artifact.editFormula('B2', '6*7'), { name: 'add-sheet', nameValue: 'Charts' }).selectSheet('Charts');
  artifact = applySpreadsheetCommand(artifact, { name: 'insert-chart', sheetId: 'Charts', x: 10, y: 10, width: 480, height: 320, content: { xml: new TextDecoder().decode(created.source) } });
  const drawing = artifact.worksheet.drawing!, id = spreadsheetDrawingObjectId(drawing, drawing.charts[0]!.anchor)!;
  const current = spreadsheetChartContent(artifact, id);
  const converted = convertChartType(new TextEncoder().encode(current.xml), { type: 'scatterChart' });
  artifact = applySpreadsheetCommand(artifact, { name: 'edit-chart', sheetId: 'Charts', objectId: id, content: { xml: new TextDecoder().decode(converted) }, bindUnboundData: true });
  const data = readChartData(new TextEncoder().encode(spreadsheetChartContent(artifact, id).xml))[0]!.series[0]!;
  expect(data.xValues?.formula).toBe("'Sheet1'!$C$2:$C$3");
  expect(data.values?.values).toEqual([42, 4]);
  expect(artifact.selectSheet('Sheet1').worksheet.cell('B2')?.formula).toBe('6*7');
  artifact = artifact.editCellOnSheet('Sheet1', 'C2', 15);
  expect(readChartData(new TextEncoder().encode(spreadsheetChartContent(artifact, id).xml))[0]!.series[0]!.xValues?.values).toEqual([15, 2]);
  expect(artifact.activeSheet.name).toBe('Charts');
});

test('new roles never overwrite blank cells in existing chart source ranges', async () => {
  const { updateChartData } = await import('@tumblerjs/charts');
  const created = createChartWorkbook(source());
  const rebound = updateChartData(created.source, readChartData(created.source).map(plot => ({ ...plot, series: plot.series.map(series => ({ ...series, values: { ...series.values!, formula: "'Sheet1'!$C$2:$C$3" } })) })));
  let artifact = applySpreadsheetCommand(created.artifact, { name: 'insert-chart', sheetId: '1', x: 10, y: 10, width: 480, height: 320, content: { xml: new TextDecoder().decode(rebound) } });
  const drawing = artifact.worksheet.drawing!, objectId = spreadsheetDrawingObjectId(drawing, drawing.charts[0]!.anchor)!;
  artifact = applySpreadsheetCommand(artifact, { name: 'edit-chart', sheetId: '1', objectId, content: { xml: new TextDecoder().decode(convertChartType(rebound, { type: 'scatterChart' })) }, bindUnboundData: true });
  expect(artifact.worksheet.cell('C2')).toBeUndefined();
  expect(artifact.worksheet.cell('C3')).toBeUndefined();
  const values = readChartData(new TextEncoder().encode(spreadsheetChartContent(artifact, objectId).xml))[0]!.series[0]!;
  expect(values.xValues?.formula).toBe("'Sheet1'!$D$2:$D$3");
  expect(Array.from(values.values?.values ?? [], value => value ?? null)).toEqual([null, null]);
});
