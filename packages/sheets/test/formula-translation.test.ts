import { expect, test } from 'bun:test';
import { translateSpreadsheetFormula } from '../src/index.ts';

test('copying formulas shifts relative references and preserves absolute references and strings', () => {
  expect(translateSpreadsheetFormula('A1+B1', { row: 1, column: 3 }, { row: 2, column: 3 })).toBe('A2+B2');
  expect(translateSpreadsheetFormula('SUM($A1:B$2)+$C$3+"A1"', { row: 1, column: 3 }, { row: 3, column: 4 })).toBe('SUM($A3:C$2)+$C$3+"A1"');
  expect(translateSpreadsheetFormula("'Another sheet'!A1", { row: 1, column: 1 }, { row: 2, column: 1 })).toBe("'Another sheet'!A2");
});

test('formulas outside the supported parser remain unchanged', () => {
  expect(translateSpreadsheetFormula('Table1[Revenue]', { row: 1, column: 1 }, { row: 2, column: 1 })).toBe('Table1[Revenue]');
});
