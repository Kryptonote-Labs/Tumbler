import { describe, expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { createOoxmlChart } from '@tumblerjs/charts';
import { openOpcPackage } from '@tumblerjs/opc';
import { applySpreadsheetCommand, createSpreadsheet, layoutSpreadsheetViewport, openSpreadsheetArtifact, openSpreadsheet, openWorksheet, paintSpreadsheetViewport } from '../src/index.ts';
import { buildWorkbookFixture } from './workbook-fixture.ts';

const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function worksheet(xml: string) {
  const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
    sheets: [{ name: 'Sheet1', sheetId: 1, relationshipId: 'sheet1', xml: `<worksheet xmlns="${namespace}">${xml}</worksheet>` }],
  })));
  return openWorksheet(workbook, workbook.sheets[0]!);
}

describe('spreadsheet viewport', () => {
  test('starts at the saved view and honours its gridline setting', () => {
    const sheet = worksheet('<sheetViews><sheetView workbookViewId="0" showGridLines="0" topLeftCell="C5"/></sheetViews><sheetData/>');
    const layout = layoutSpreadsheetViewport(sheet, { width: 400, height: 200 });
    expect(layout.gridlines).toBe(false);
    expect(layout.rows[0]?.index).toBe(5);
    expect(layout.columns[0]?.index).toBe(3);
  });

  test('keeps frozen rows above the scrolled pane', () => {
    const sheet = worksheet('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A20" state="frozen"/></sheetView></sheetViews><sheetData/>');
    const layout = layoutSpreadsheetViewport(sheet, { width: 400, height: 200, headings: true });
    expect(layout.rows.slice(0, 3).map(row => row.index)).toEqual([1, 20, 21]);
    expect(layout.rows[0]?.start).toBe(layout.columnHeaderHeight);
  });

  test('aligns General numbers right and paints merged ranges as one cell', () => {
    const sheet = worksheet(`<sheetData><row r="1"><c r="A1"><v>42</v></c><c r="B1" t="inlineStr"><is><t>Title</t></is></c></row></sheetData><mergeCells count="1"><mergeCell ref="B1:D2"/></mergeCells>`);
    const layout = layoutSpreadsheetViewport(sheet, { width: 600, height: 200 });
    expect(layout.cells.find(cell => cell.paint.text === '42')?.paint.horizontal).toBe('right');
    const merged = layout.cells.filter(cell => cell.paint.text === 'Title');
    const [b, c, d] = layout.columns.slice(1, 4);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.frame.width).toBe(b!.size + c!.size + d!.size);
    expect(merged[0]?.frame.height).toBe(layout.rows[0]!.size + layout.rows[1]!.size);
  });

  test('keeps the full rectangle of merges scrolled partly out of view', () => {
    const sheet = worksheet(`<sheetViews><sheetView workbookViewId="0" topLeftCell="C1"/></sheetViews><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Title</t></is></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells>`);
    const layout = layoutSpreadsheetViewport(sheet, { width: 600, height: 200 });
    const columns = sheet.columnGeometry();
    const merged = layout.cells.find(cell => cell.paint.text === 'Title');
    expect(merged?.frame.x).toBe(-(columns.size(1) + columns.size(2)));
    expect(merged?.frame.width).toBe(columns.start(5));
  });

  test('lets frozen-row merges extend across frozen columns', () => {
    const sheet = worksheet(`<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" state="frozen"/></sheetView></sheetViews><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Title</t></is></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>`);
    const layout = layoutSpreadsheetViewport(sheet, { width: 600, height: 200 });
    expect(layout.cells.find(cell => cell.paint.text === 'Title')?.clip?.width).toBe(600);
  });

  test('shows hyperlink display text', () => {
    const sheet = worksheet(`<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>source</t></is></c></row></sheetData><hyperlinks><hyperlink ref="A1" location="Sheet1!B1" display="Go to B1"/></hyperlinks>`);
    expect(layoutSpreadsheetViewport(sheet, { width: 400, height: 200 }).cells[0]?.paint.text).toBe('Go to B1');
  });

  test('stacks charts and shapes in drawing order', () => {
    const chart = createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Sales', values: [2] }] });
    let artifact = applySpreadsheetCommand(createSpreadsheet(), { name: 'insert-chart', sheetId: '1', x: 40, y: 40, width: 320, height: 200, content: { xml: new TextDecoder().decode(chart) } });
    artifact = applySpreadsheetCommand(artifact, { name: 'insert-shape', sheetId: '1', x: 60, y: 60, width: 100, height: 80, preset: 'rect' });
    expect(layoutSpreadsheetViewport(artifact.worksheet, { width: 480, height: 320 }).drawings.map(drawing => drawing.kind)).toEqual(['chart', 'object']);
  });

  test('lets frozen-row drawings extend across frozen columns', async () => {
    // The first fixture drawing is anchored in A3 and extends into column B.
    const bytes = new Uint8Array(await Bun.file(new URL('./fixtures/drawings.xlsx', import.meta.url)).arrayBuffer());
    const artifact = applySpreadsheetCommand(openSpreadsheetArtifact(bytes), { name: 'freeze-panes', sheetId: '1', rows: 3, columns: 1 });
    const layout = layoutSpreadsheetViewport(artifact.worksheet, { width: 480, height: 320, headings: true });
    const frozenHeight = layout.rows.slice(0, 3).reduce((total, row) => total + row.size, 0);
    expect(layout.drawings[0]?.clip).toEqual({ x: layout.rowHeaderWidth, y: layout.columnHeaderHeight, width: 480 - layout.rowHeaderWidth, height: frozenHeight });
  });

  test('paints charts anchored in the view', () => {
    const chart = createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Sales', values: [2, 4] }] });
    const artifact = applySpreadsheetCommand(createSpreadsheet(), { name: 'insert-chart', sheetId: '1', x: 40, y: 40, width: 320, height: 200, content: { xml: new TextDecoder().decode(chart) } });
    const layout = layoutSpreadsheetViewport(artifact.worksheet, { width: 480, height: 320 });
    expect(layout.drawings.map(drawing => drawing.kind)).toEqual(['chart']);
    // The layout crosses worker boundaries.
    const transferred = structuredClone(layout);
    const canvas = createCanvas(480, 320);
    paintSpreadsheetViewport(canvas.getContext('2d'), transferred, { path: d => new Path2D(d) });
    const { data } = canvas.getContext('2d').getImageData(40, 40, 320, 200);
    let coloured = 0;
    for (let index = 0; index < data.length; index += 4) if (Math.max(data[index]!, data[index + 1]!, data[index + 2]!) - Math.min(data[index]!, data[index + 1]!, data[index + 2]!) > 60) coloured++;
    expect(coloured).toBeGreaterThan(1000);
  });
});
