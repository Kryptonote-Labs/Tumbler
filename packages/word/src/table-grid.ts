import { WordError, type WordTable, type WordTableCell, type WordTableRow } from "./document.ts";

export interface ResolvedWordTable {
  readonly table: WordTable;
  readonly columnCount: number;
  readonly columnWidthsTwips: readonly number[];
  readonly rows: readonly ResolvedWordTableRow[];
}

export interface ResolvedWordTableRow {
  readonly source: WordTableRow;
  readonly rowIndex: number;
  readonly cells: readonly ResolvedWordTableCell[];
}

export interface ResolvedWordTableCell {
  readonly source: WordTableCell;
  readonly continuationElementIds: readonly number[];
  readonly row: number;
  readonly column: number;
  readonly columnSpan: number;
  readonly rowSpan: number;
}

interface MutableCell {
  readonly source: WordTableCell;
  readonly continuationElementIds: number[];
  readonly row: number;
  readonly column: number;
  readonly columnSpan: number;
  rowSpan: number;
}

/** Resolves the visual table grid while retaining every source cell identity. */
export function resolveWordTableGrid(table: WordTable): ResolvedWordTable {
  const declaredColumns = table.gridColumnWidthsTwips.length;
  // §17.4.15 ignores a leading offset beyond the declared grid. §17.4.14
  // does not let a conflicting trailing count enlarge it; cell spans can (§17.4.17).
  const leadingColumns = (row: WordTableRow) => row.gridBefore > declaredColumns ? 0 : row.gridBefore;
  const estimated = table.rows.reduce((maximum, row) => Math.max(maximum, leadingColumns(row) + row.cells.reduce((sum, cell) => sum + cell.gridSpan, 0)), declaredColumns);
  if (estimated > 32_767) throw new WordError("limit_exceeded", "A resolved table exceeds 32767 grid columns.");
  let active = new Map<number, MutableCell>();
  const rows: Array<{ readonly source: WordTableRow; readonly rowIndex: number; readonly cells: MutableCell[] }> = [];
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex]!;
    const cells: MutableCell[] = [];
    let column = leadingColumns(row);
    const nextActive = new Map<number, MutableCell>();
    for (const cell of row.cells) {
      if (cell.verticalMerge === "continue") {
        const origin = active.get(column);
        if (origin === undefined || origin.columnSpan !== cell.gridSpan) {
          throw new WordError("invalid_document", `Vertical merge continuation cell ${cell.elementId} has no matching restart cell.`);
        }
        origin.rowSpan += 1;
        origin.continuationElementIds.push(cell.elementId);
        nextActive.set(column, origin);
      } else {
        const resolved: MutableCell = { source: cell, continuationElementIds: [], row: rowIndex, column, columnSpan: cell.gridSpan, rowSpan: 1 };
        cells.push(resolved);
        if (cell.verticalMerge === "restart") nextActive.set(column, resolved);
      }
      column += cell.gridSpan;
    }
    // A merge only continues from the immediately preceding row, at the
    // same starting column and span. Omitted columns close prior groups too.
    active = nextActive;
    rows.push({ source: row, rowIndex, cells });
  }
  const defaultWidth = estimated === 0 ? 0 : 9_000 / estimated;
  const widths = Array.from({ length: estimated }, (_, index) => table.gridColumnWidthsTwips[index] || defaultWidth);
  return Object.freeze({
    table,
    columnCount: estimated,
    columnWidthsTwips: Object.freeze(widths),
    rows: Object.freeze(rows.map((row) => Object.freeze({
      source: row.source,
      rowIndex: row.rowIndex,
      cells: Object.freeze(row.cells.map((cell) => Object.freeze({ ...cell, continuationElementIds: Object.freeze(cell.continuationElementIds) }))),
    }))),
  });
}
