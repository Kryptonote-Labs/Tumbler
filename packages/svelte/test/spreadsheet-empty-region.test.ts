import { expect, test } from 'bun:test';
import { openOpcPackage } from '../../opc/src/index.ts';
import { openSpreadsheet, openWorksheet } from '@tumblerjs/sheets';
import { buildWorkbookFixture } from '../../sheets/test/workbook-fixture.ts';
import { spreadsheetEmptyRegionStart } from '../src/spreadsheet-empty-region.ts';

const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

test('empty-area rendering excludes authored rows, styled columns, merges and formatting ranges', () => {
  const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
    sheets: [{ name: 'Sheet1', sheetId: 1, relationshipId: 'sheet1', xml: `<worksheet xmlns="${namespace}">
      <dimension ref="A1:D8"/><cols><col min="2" max="3" style="0"/></cols>
      <sheetData><row r="50" s="0" customFormat="1"/></sheetData>
      <mergeCells><mergeCell ref="A60:B60"/></mergeCells>
      <conditionalFormatting sqref="A65:D70"><cfRule type="expression" priority="1"><formula>1</formula></cfRule></conditionalFormatting>
      <hyperlinks><hyperlink ref="J80" location="Sheet1!A1"/></hyperlinks>
    </worksheet>` }],
  })));
  expect(spreadsheetEmptyRegionStart(openWorksheet(workbook, workbook.sheets[0]!))).toEqual({ row: 80, column: 3 });
});

test('a coloured default cell style retains normal cell rendering', () => {
  const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
    stylesXml: `<styleSheet xmlns="${namespace}"><fonts count="1"><font/></fonts><fills count="1"><fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/></patternFill></fill></fills><borders count="1"><border/></borders><cellXfs count="1"><xf fillId="0"/></cellXfs></styleSheet>`,
    sheets: [{ name: 'Sheet1', sheetId: 1, relationshipId: 'sheet1', xml: `<worksheet xmlns="${namespace}"><sheetData/></worksheet>` }],
  })));
  expect(spreadsheetEmptyRegionStart(openWorksheet(workbook, workbook.sheets[0]!))).toBeUndefined();
});
