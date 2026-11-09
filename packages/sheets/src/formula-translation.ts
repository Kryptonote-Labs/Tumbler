import { parseFormula, type FormulaExpression, type FormulaReferenceExpression } from '@tumblerjs/formulas';
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, formatCellReference, type CellAddress } from './references.ts';

/** Shift relative references for a copied cell, retaining absolute references and unknown syntax. */
export function translateSpreadsheetFormula(formula: string, origin: CellAddress, target: CellAddress): string {
  let parsed: ReturnType<typeof parseFormula>;
  try { parsed = parseFormula(formula); } catch { return formula; }
  const references: FormulaReferenceExpression[] = [];
  collectReferenceExpressions(parsed.expression, references);
  let result = formula;
  for (const reference of references.sort((left, right) => right.start - left.start)) {
    const shiftedStart = shiftReference(reference.startReference, origin, target);
    const shiftedEnd = reference.endReference === undefined ? undefined : shiftReference(reference.endReference, origin, target);
    const qualifier = reference.sheet === undefined ? "" : `${quoteSheetName(reference.sheet)}!`;
    const replacement = `${qualifier}${formatFormulaReference(shiftedStart)}${shiftedEnd === undefined ? "" : `:${formatFormulaReference(shiftedEnd)}`}`;
    result = result.slice(0, reference.start) + replacement + result.slice(reference.end);
  }
  return result;
}

function collectReferenceExpressions(expression: FormulaExpression, result: FormulaReferenceExpression[]): void {
  switch (expression.kind) {
    case "reference": result.push(expression); break;
    case "unary":
    case "percent": collectReferenceExpressions(expression.operand, result); break;
    case "binary": collectReferenceExpressions(expression.left, result); collectReferenceExpressions(expression.right, result); break;
    case "function": expression.arguments.forEach((argument) => collectReferenceExpressions(argument, result)); break;
    default: break;
  }
}

function shiftReference(
  reference: FormulaReferenceExpression["startReference"],
  origin: CellAddress,
  target: CellAddress,
): FormulaReferenceExpression["startReference"] {
  const row = reference.absoluteRow ? reference.row : reference.row + target.row - origin.row;
  const column = reference.absoluteColumn ? reference.column : reference.column + target.column - origin.column;
  if (row < 1 || row > EXCEL_MAX_ROWS || column < 1 || column > EXCEL_MAX_COLUMNS) {
    throw new RangeError("A relative formula reference moved outside the worksheet grid.");
  }
  return Object.freeze({ ...reference, row, column });
}

function formatFormulaReference(reference: FormulaReferenceExpression["startReference"]): string {
  const plain = formatCellReference({ row: reference.row, column: reference.column });
  const match = /^([A-Z]+)([0-9]+)$/.exec(plain)!;
  return `${reference.absoluteColumn ? "$" : ""}${match[1]}${reference.absoluteRow ? "$" : ""}${match[2]}`;
}

function quoteSheetName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
}

