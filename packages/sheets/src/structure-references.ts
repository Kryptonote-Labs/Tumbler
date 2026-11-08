import {
  parseFormula,
  tokenizeFormula,
  type FormulaExpression,
  type FormulaReferenceExpression,
} from '@tumblerjs/formulas';
import {
  EXCEL_MAX_COLUMNS,
  EXCEL_MAX_ROWS,
  formatCellReference,
  type CellRange,
} from './references.ts';

export interface SpreadsheetStructureCommand {
  name: 'insert-rows' | 'delete-rows' | 'insert-columns' | 'delete-columns';
  sheetId: string;
  /** One-based row or column before which to insert, or at which to start deleting. */
  index: number;
  count?: number | undefined;
}
export interface StructureChange {
  axis: 'row' | 'column';
  index: number;
  count: number;
  remove: boolean;
  maximum: number;
}

export function interval(
  start: number,
  end: number,
  change: StructureChange,
): [number, number] | undefined {
  if (!change.remove) {
    const first = start >= change.index ? start + change.count : start;
    const last = end >= change.index ? end + change.count : end;
    return first > change.maximum ? undefined : [first, Math.min(last, change.maximum)];
  }
  const boundary = change.index + change.count - 1;
  const first =
    start < change.index ? start : start > boundary ? start - change.count : change.index;
  const last = end < change.index ? end : end > boundary ? end - change.count : change.index - 1;
  return first > last ? undefined : [first, last];
}
export function moveRange(range: CellRange, change: StructureChange): CellRange | undefined {
  const moved = interval(range.start[change.axis], range.end[change.axis], change);
  return moved
    ? {
        start: { ...range.start, [change.axis]: moved[0] },
        end: { ...range.end, [change.axis]: moved[1] },
      }
    : undefined;
}
function references(expression: FormulaExpression, result: FormulaReferenceExpression[]): void {
  switch (expression.kind) {
    case 'reference':
      result.push(expression);
      break;
    case 'binary':
      references(expression.left, result);
      references(expression.right, result);
      break;
    case 'unary':
    case 'percent':
      references(expression.operand, result);
      break;
    case 'function':
      expression.arguments.forEach((argument) => references(argument, result));
      break;
    default:
      break;
  }
}
function formatReference(reference: FormulaReferenceExpression['startReference']) {
  const plain = formatCellReference(reference);
  const column = plain.match(/^[A-Z]+/)![0];
  return `${reference.absoluteColumn ? '$' : ''}${column}${reference.absoluteRow ? '$' : ''}${reference.row}`;
}

/** Rewrites parsed reference spans, keeping strings, dollar signs and surrounding parentheses intact. */
export function rebaseSpreadsheetFormula(
  formula: string,
  contextSheet: string | undefined,
  targetSheet: string,
  command: SpreadsheetStructureCommand,
): string {
  const change = normalize(command);
  const parsed = parseFormula(formula),
    found: FormulaReferenceExpression[] = [];
  references(parsed.expression, found);
  if (!contextSheet && found.some((reference) => reference.sheet === undefined))
    throw new Error(
      'A workbook-scoped relative name cannot yet be rebased safely. The workbook has not changed.',
    );
  const tokens = tokenizeFormula(formula);
  let result = formula;
  for (const reference of found.sort((left, right) => right.start - left.start)) {
    if ((reference.sheet ?? contextSheet)?.toLowerCase() !== targetSheet.toLowerCase()) continue;
    const end = reference.endReference ?? reference.startReference;
    const reverseRow = reference.startReference.row > end.row,
      reverseColumn = reference.startReference.column > end.column;
    let range = moveRange(
      {
        start: {
          row: Math.min(reference.startReference.row, end.row),
          column: Math.min(reference.startReference.column, end.column),
        },
        end: {
          row: Math.max(reference.startReference.row, end.row),
          column: Math.max(reference.startReference.column, end.column),
        },
      },
      change,
    );
    if (range && (reverseRow || reverseColumn)) {
      range = {
        start: {
          row: reverseRow ? range.end.row : range.start.row,
          column: reverseColumn ? range.end.column : range.start.column,
        },
        end: {
          row: reverseRow ? range.start.row : range.end.row,
          column: reverseColumn ? range.start.column : range.end.column,
        },
      };
    }
    // A parenthesized reference's AST span includes the parentheses. Token spans identify only its reference source.
    const source = tokens.filter(
      (token) =>
        token.start >= reference.start && token.end <= reference.end && token.kind !== 'eof',
    );
    const cellTokens = source.filter((token) => token.kind === 'reference');
    const first = cellTokens[0],
      last = cellTokens.at(-1);
    if (!first || !last) throw new Error('Spreadsheet formula reference spans are invalid.');
    const qualified = reference.sheet !== undefined;
    const qualifier = qualified
      ? source.find(
          (token) =>
            token.kind === 'sheet' || token.kind === 'identifier' || token.kind === 'reference',
        )
      : first;
    const start = qualifier!.start;
    const prefix = qualified ? formula.slice(start, first.start) : '';
    const replacement = range
      ? prefix +
        formatReference({ ...reference.startReference, ...range.start }) +
        (reference.endReference
          ? ':' + formatReference({ ...reference.endReference, ...range.end })
          : '')
      : '#REF!';
    result = result.slice(0, start) + replacement + result.slice(last.end);
  }
  return result;
}
export function normalize(command: SpreadsheetStructureCommand): StructureChange {
  const axis = command.name.endsWith('rows') ? 'row' : 'column';
  const maximum = axis === 'row' ? EXCEL_MAX_ROWS : EXCEL_MAX_COLUMNS;
  const count = command.count ?? 1;
  if (
    !Number.isSafeInteger(command.index) ||
    command.index < 1 ||
    command.index > maximum ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    command.index + count - 1 > maximum
  )
    throw new RangeError(`Spreadsheet ${axis} edits must stay within Excel's ${maximum} ${axis}s.`);
  return { axis, maximum, count, index: command.index, remove: command.name.startsWith('delete') };
}
