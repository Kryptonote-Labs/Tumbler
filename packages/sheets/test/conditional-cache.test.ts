import { expect, test } from 'bun:test';
import {
  applySpreadsheetCommand,
  createSpreadsheet,
  formatCellReference,
  projectSpreadsheetConditionalStyles,
  SpreadsheetStyles,
  SpreadsheetWorksheet,
  type SpreadsheetConditionalFormattingOperator,
} from '../src/index.ts';

const operators: SpreadsheetConditionalFormattingOperator[] = [
  'equal',
  'notEqual',
  'lessThan',
  'lessThanOrEqual',
  'greaterThan',
  'greaterThanOrEqual',
  'between',
  'notBetween',
];
test.each(operators)(
  'repeated numeric %s rules retain formula-engine behavior for other value types',
  (operator) => {
    const artifact = applySpreadsheetCommand(createSpreadsheet(), {
      name: 'set-range',
      sheetId: '1',
      reference: 'A1',
      values: [[0, 0, 1, 1, -1, -1, '0', null, true]],
    });
    const styles = new SpreadsheetStyles({
      fonts: artifact.worksheet.styles.fonts,
      fills: artifact.worksheet.styles.fills,
      borders: artifact.worksheet.styles.borders,
      cellFormats: artifact.worksheet.styles.cellFormats,
      differentialFormats: [{ font: { bold: true }, fill: undefined, border: undefined }],
    });
    const formulas = operator === 'between' || operator === 'notBetween' ? ['-1', '1'] : ['0'];
    const sheet = (constants: string[]) =>
      new SpreadsheetWorksheet({
        ...artifact.worksheet,
        styles,
        conditionalFormatting: [
          {
            pivot: false,
            ranges: [{ start: { row: 1, column: 1 }, end: { row: 1, column: 9 } }],
            rules: [
              {
                kind: 'cellIs',
                operator,
                formulas: constants,
                priority: 1,
                stopIfTrue: false,
                differentialFormatId: 0,
                sourceOrder: 0,
              },
            ],
          },
        ],
      });
    const cached = projectSpreadsheetConditionalStyles(sheet(formulas));
    const evaluated = projectSpreadsheetConditionalStyles(
      sheet(formulas.map((formula) => `(${formula})`)),
    );
    for (let column = 1; column <= 9; column++) {
      const reference = formatCellReference({ row: 1, column });
      expect(cached.formats(reference)).toEqual(evaluated.formats(reference));
    }
    expect(cached.diagnostics).toEqual([]);
  },
);
