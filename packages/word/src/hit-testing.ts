import { intersectWordContentBounds, wordTableLinesWithClips, wordVisibleLineBounds, type WordContentBounds, type WordClippedLine } from "./table-clipping.ts";
import type { WordLayoutColumn, WordLayoutLine, WordLayoutPage, WordLayoutTable, WordLayoutTableCell } from "./layout.ts";

/**
 * Find a body text line at page-relative coordinates in points, before zoom.
 * Inside a table cell, only that cell's content is eligible; nested cells take priority.
 * Outside cells, choose the nearest line vertically, then horizontally. Returns
 * undefined for a page without body text. Resolve the character offset in the renderer.
 */
export function wordLineAtPoint(page: WordLayoutPage, x: number, y: number): WordLayoutLine | undefined {
  const cell = page.columns.map(column => cellAtPoint(column.tables, x, y)).find(cell => cell !== undefined);
  const lines = cell === undefined ? page.columns.flatMap(flowLines) : [...cell.cell.lines.map(line => ({ line, clip: cell.clip })), ...wordTableLinesWithClips(cell.cell.tables, cell.clip)];
  let nearest: WordLayoutLine | undefined;
  let verticalDistance = Infinity;
  let horizontalDistance = Infinity;
  for (const entry of lines) {
    const bounds = wordVisibleLineBounds(entry);
    if (!bounds) continue;
    const { line } = entry;
    const vertical = Math.max(bounds.y - y, y - bounds.y - bounds.height, 0);
    const horizontal = Math.max(bounds.x - x, x - bounds.x - bounds.width, 0);
    if (vertical < verticalDistance || vertical === verticalDistance && horizontal < horizontalDistance) {
      nearest = line;
      verticalDistance = vertical;
      horizontalDistance = horizontal;
    }
  }
  return nearest;
}

function cellAtPoint(tables: readonly WordLayoutTable[], x: number, y: number, ancestor?: WordContentBounds): { cell: WordLayoutTableCell; clip: WordContentBounds } | undefined {
  for (const table of tables) for (const cell of table.cells) {
    const clip = ancestor ? intersectWordContentBounds(ancestor, cell) : cell;
    if (x >= clip.x && x < clip.x + clip.width && y >= clip.y && y < clip.y + clip.height) {
      return cellAtPoint(cell.tables, x, y, clip) ?? { cell, clip };
    }
  }
  return undefined;
}

function flowLines(flow: Pick<WordLayoutColumn, "lines" | "tables">): WordClippedLine[] {
  return [...flow.lines.map(line => ({ line })), ...wordTableLinesWithClips(flow.tables)];
}
