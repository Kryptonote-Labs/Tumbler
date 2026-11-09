import { describe, expect, test } from 'bun:test';
import {
  createSpreadsheet,
  applySpreadsheetCommand,
  readSpreadsheetSheetProperties,
} from '../src/index.ts';

describe('spreadsheet interaction commands', () => {
  test('replaces literal source text with case and whole-word options while retaining formulas', () => {
    let artifact = createSpreadsheet();
    artifact = applySpreadsheetCommand(artifact, {
      name: 'set-range',
      sheetId: '1',
      reference: 'A1',
      values: [['Cat cat catch', '=LEN("cat")', 12]],
    });
    artifact = applySpreadsheetCommand(artifact, {
      name: 'replace-text',
      sheetId: '1',
      query: 'cat',
      replacement: '$&',
      wholeWord: true,
      matchCase: true,
    });
    expect(artifact.worksheet.cell('A1')?.value).toMatchObject({
      type: 'string',
      value: 'Cat $& catch',
    });
    expect(artifact.worksheet.cell('B1')?.formula).toBe('LEN("$&")');
    expect(artifact.worksheet.cell('C1')?.value).toMatchObject({ type: 'number', value: 12 });
  });
  test('replace one stays in the requested cell and keeps numeric cells numeric', () => {
    let artifact = applySpreadsheetCommand(createSpreadsheet(), {
      name: 'set-range',
      sheetId: '1',
      reference: 'A1',
      values: [[12, 12]],
    });
    artifact = applySpreadsheetCommand(artifact, {
      name: 'replace-text',
      sheetId: '1',
      query: '12',
      replacement: '34',
      reference: 'A1',
    });
    expect(artifact.worksheet.cell('A1')?.value).toMatchObject({ type: 'number', value: 34 });
    expect(artifact.worksheet.cell('B1')?.value).toMatchObject({ type: 'number', value: 12 });
  });
  test('hiding the active sheet selects a visible sheet and permits unhiding', () => {
    let artifact = applySpreadsheetCommand(createSpreadsheet(), { name: 'add-sheet' });
    artifact = applySpreadsheetCommand(artifact, {
      name: 'set-sheet-state',
      sheetId: '1',
      state: 'hidden',
    });
    expect(artifact.activeSheet.sheetId).toBe(2);
    expect(() =>
      applySpreadsheetCommand(artifact, { name: 'set-sheet-state', sheetId: '2', state: 'hidden' }),
    ).toThrow();
    artifact = applySpreadsheetCommand(artifact, {
      name: 'set-sheet-state',
      sheetId: '1',
      state: 'visible',
    });
    expect(artifact.workbook.sheet(1)?.state).toBe('visible');
  });
  test('tab colours survive subsequent cell edits and can be removed', () => {
    let artifact = applySpreadsheetCommand(createSpreadsheet(), {
      name: 'set-tab-color',
      sheetId: '1',
      color: 'ff8800',
    });
    artifact = applySpreadsheetCommand(artifact, {
      name: 'set-cell',
      sheetId: '1',
      reference: 'A1',
      value: 'hello',
    });
    expect(
      readSpreadsheetSheetProperties(artifact.workbook, artifact.activeSheet).tabColor,
    ).toMatchObject({ type: 'rgb', argb: 'FFFF8800' });
    artifact = applySpreadsheetCommand(artifact, {
      name: 'set-tab-color',
      sheetId: '1',
      color: null,
    });
    expect(
      readSpreadsheetSheetProperties(artifact.workbook, artifact.activeSheet).tabColor,
    ).toBeUndefined();
    expect(artifact.worksheet.cell('A1')?.value).toMatchObject({ type: 'string', value: 'hello' });
  });
});
