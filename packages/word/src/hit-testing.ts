import type { WordLayoutColumn, WordLayoutLine, WordLayoutPage, WordLayoutTable, WordLayoutTableCell } from "./layout.ts";

/**
 * Find a body text line at page-relative coordinates in points, before zoom.
 * Inside a table cell, only that cell's content is eligible; nested cells take priority.
 * Outside cells, choose the nearest line vertically, then horizontally. Returns
 * undefined for a page without body text. Resolve the character offset in the renderer.
 */
export function wordLineAtPoint(page: WordLayoutPage, x: number, y: number): WordLayoutLine | undefined {
  const cell = page.columns.map(column => cellAtPoint(column.tables, x, y)).find(cell => cell !== undefined);
  const lines = cell === undefined ? page.columns.flatMap(flowLines) : flowLines(cell);
  let nearest: WordLayoutLine | undefined;
  let verticalDistance = Infinity;
  let horizontalDistance = Infinity;
  for (const line of lines) {
    const vertical = Math.max(line.y - y, y - line.y - line.height, 0);
    const horizontal = Math.max(line.x - x, x - line.x - line.width, 0);
    if (vertical < verticalDistance || vertical === verticalDistance && horizontal < horizontalDistance) {
      nearest = line;
      verticalDistance = vertical;
      horizontalDistance = horizontal;
    }
  }
  return nearest;
}

function cellAtPoint(tables: readonly WordLayoutTable[], x: number, y: number): WordLayoutTableCell | undefined {
  for (const table of tables) for (const cell of table.cells) {
    if (x >= cell.x && x < cell.x + cell.width && y >= cell.y && y < cell.y + cell.height) {
      return cellAtPoint(cell.tables, x, y) ?? cell;
    }
  }
  return undefined;
}

function flowLines(flow: Pick<WordLayoutColumn, "lines" | "tables">): WordLayoutLine[] {
  return [...flow.lines, ...flow.tables.flatMap(table => table.cells.flatMap(flowLines))];
}
