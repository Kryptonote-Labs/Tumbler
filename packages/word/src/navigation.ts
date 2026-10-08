import type {
  WordLayout,
  WordLayoutColumn,
  WordLayoutLine,
  WordLayoutTableCell,
} from "./layout.ts";

interface LinePlacement {
  readonly line: WordLayoutLine;
  readonly cell?: WordLayoutTableCell;
}

export interface WordLineLocation {
  readonly pageIndex: number;
  readonly paragraphElementId: number;
  readonly startOffset: number;
  readonly story?: "header" | "footer";
}

export interface WordLineNavigationTarget {
  readonly pageIndex: number;
  readonly line: WordLayoutLine;
  readonly x: number;
}

type LineFlow = Pick<WordLayoutColumn, "x" | "lines" | "tables">;
const columnLines = new WeakMap<LineFlow, readonly LinePlacement[]>();

function linesInColumn(column: LineFlow) {
  const cached = columnLines.get(column);
  if (cached) return cached;
  const lines: LinePlacement[] = [];
  const visit = (flow: Pick<WordLayoutColumn, "lines" | "tables">, cell?: WordLayoutTableCell) => {
    lines.push(...flow.lines.map((line) => ({ line, cell })));
    for (const table of flow.tables) for (const cell of table.cells) visit(cell, cell);
  };
  visit(column);
  columnLines.set(column, lines);
  return lines;
}

/** Move one visual line, preserving x within the column across body pages.
 * Table navigation follows the current cell before moving to the next row.
 * Header/footer movement stays within the current page's story.
 * Character hit testing and selection remain the renderer's responsibility.
 */
export function wordAdjacentLine(
  layout: WordLayout,
  current: WordLineLocation,
  direction: "up" | "down",
  x: number,
): WordLineNavigationTarget | undefined {
  const page = layout.pages[current.pageIndex];
  if (!page) return undefined;
  const columns: readonly LineFlow[] = current.story
    ? [
        {
          x: 0,
          lines: current.story === "header" ? page.headerLines : page.footerLines,
          tables: current.story === "header" ? page.headerTables : page.footerTables,
        },
      ]
    : page.columns;
  const matches = ({ line }: LinePlacement) =>
    line.paragraphElementId === current.paragraphElementId &&
    line.startOffset === current.startOffset;
  const columnIndex = columns.findIndex((column) => linesInColumn(column).some(matches));
  const column = columns[columnIndex];
  if (!column) return undefined;
  const source = linesInColumn(column).find(matches)!;
  const sign = direction === "down" ? 1 : -1;
  const horizontal = ({ line }: LinePlacement, targetX: number) =>
    Math.max(line.x - targetX, targetX - line.x - line.width, 0);
  const nearest = (lines: readonly LinePlacement[], targetX: number) =>
    [...lines].sort(
      (a, b) => sign * (a.line.y - b.line.y) || horizontal(a, targetX) - horizontal(b, targetX),
    )[0];
  const candidates = linesInColumn(column).filter(
    (candidate) => sign * (candidate.line.y - source.line.y) > 0.01,
  );
  const inCell = source.cell && candidates.filter((candidate) => candidate.cell === source.cell);
  const targetX = source.cell
    ? Math.max(source.cell.x, Math.min(source.cell.x + source.cell.width - 0.01, x))
    : x;
  const target = nearest(
    inCell?.length
      ? inCell
      : candidates.filter(
          (candidate) =>
            !candidate.cell ||
            (targetX >= candidate.cell.x && targetX < candidate.cell.x + candidate.cell.width),
        ),
    targetX,
  );
  if (target) return { pageIndex: page.index, line: target.line, x };
  if (current.story) return undefined;

  // Columns form a reading flow. Empty columns and pages do not consume arrow presses.
  let pageIndex = current.pageIndex;
  let nextColumn = columnIndex + sign;
  while (pageIndex >= 0 && pageIndex < layout.pages.length) {
    const nextPage = layout.pages[pageIndex]!;
    while (nextColumn >= 0 && nextColumn < nextPage.columns.length) {
      const next = nextPage.columns[nextColumn]!;
      const nextX = next.x + x - column.x;
      const target = nearest(linesInColumn(next), nextX);
      if (target) return { pageIndex, line: target.line, x: nextX };
      nextColumn += sign;
    }
    pageIndex += sign;
    nextColumn = direction === "down" ? 0 : (layout.pages[pageIndex]?.columns.length ?? 0) - 1;
  }
  return undefined;
}
