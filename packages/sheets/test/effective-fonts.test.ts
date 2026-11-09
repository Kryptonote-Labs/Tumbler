import { expect, test } from 'bun:test';
import {
  applySpreadsheetCommand, createSpreadsheet, createSpreadsheetNativeArchive,
  openSpreadsheetArtifact, openSpreadsheetNativeArchive,
} from '../src/index.ts';
import { buildWorkbookFixture } from './workbook-fixture.ts';
import { officeThemeXml } from '@tumblerjs/ooxml';

const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

test('new workbook font defaults remain explicit after formatting and XLSX/native reopening', () => {
  const blank = createSpreadsheet();
  expect(blank.formattingState('A1').text).toMatchObject({
    fontFamily: { state: 'value', value: 'Aptos' }, fontSize: { state: 'value', value: 11 },
  });
  const title = applySpreadsheetCommand(blank, { name: 'format-cells', sheetId: '1', range: 'A1', patch: { text: { bold: { set: true }, fontSize: { set: 20 } } } });
  for (const artifact of [title, openSpreadsheetArtifact(title.bytes()), openSpreadsheetNativeArchive(createSpreadsheetNativeArchive(title))]) {
    expect(artifact.formattingState('A1').text).toMatchObject({ fontFamily: { state: 'value', value: 'Aptos' }, fontSize: { state: 'value', value: 20 } });
    expect(artifact.worksheet.styles.resolve(0).font).toMatchObject({ name: 'Aptos', size: 11 });
  }
});

test('omitted cell font properties use Normal while explicit families and mixed ranges remain distinct', () => {
  const bytes = buildWorkbookFixture({
    stylesXml: `<styleSheet xmlns="${ns}"><fonts><font><name val="Georgia"/><sz val="13"/></font><font><b/><sz val="20"/></font><font><name val="Arial"/></font></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf fontId="0"/><xf fontId="1"/><xf fontId="2"/></cellXfs></styleSheet>`,
    sheets: [{ name: 'Sheet1', sheetId: 1, relationshipId: 'sheet1', xml: `<worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1" s="1"/><c r="B1" s="2"/></row></sheetData></worksheet>` }],
  });
  const artifact = openSpreadsheetArtifact(bytes);
  expect(artifact.formattingState('A1').text).toMatchObject({ fontFamily: { state: 'value', value: 'Georgia' }, fontSize: { state: 'value', value: 20 } });
  expect(artifact.formattingState('B1').text).toMatchObject({ fontFamily: { state: 'value', value: 'Arial' }, fontSize: { state: 'value', value: 13 } });
  expect(artifact.formattingState('A1:B1').text.fontFamily).toEqual({ state: 'mixed' });
  expect(artifact.worksheet.cellStyle('A1').font.name).toBeUndefined();
  expect(artifact.bytes()).toEqual(bytes);
});

test('legacy styleless and empty font records resolve named defaults without modifying their source', () => {
  for (const stylesXml of [undefined, `<styleSheet xmlns="${ns}"><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf/></cellXfs></styleSheet>`]) {
    const bytes = buildWorkbookFixture(stylesXml === undefined ? {} : { stylesXml });
    const artifact = openSpreadsheetArtifact(bytes);
    expect(artifact.formattingState('A1').text).toMatchObject({ fontFamily: { state: 'value', value: 'Aptos' }, fontSize: { state: 'value', value: 11 } });
    expect(artifact.bytes()).toEqual(bytes);
  }
});

test('theme-only workbooks use their body font even without a Styles part', () => {
  const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ themeXml: officeThemeXml().replace('typeface="Aptos"', 'typeface="Custom Body"') }));
  expect(artifact.formattingState('A1').text.fontFamily).toEqual({ state: 'value', value: 'Custom Body' });
});
