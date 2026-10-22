import type { WordDrawing, WordLayoutPage, WordLayoutTable } from '@tumblerjs/word';

/** Compact ranks avoid CSS's signed-integer limit on OOXML's unsigned relativeHeight. */
export function wordDrawingStackOrder(page: WordLayoutPage): ReadonlyMap<WordDrawing, number> {
  const drawings: WordDrawing[] = [];
  const lines = (items: WordLayoutPage['headerLines']) => {
    for (const line of items) for (const fragment of line.fragments) {
      if (fragment.drawing?.placement === 'anchor') drawings.push(fragment.drawing);
    }
  };
  const table = (item: WordLayoutTable): void => {
    for (const cell of item.cells) { lines(cell.lines); cell.tables.forEach(table); }
  };
  // Match canvas traversal for equal relativeHeight values.
  [...page.columns.flatMap(c => c.tables), ...page.headerTables, ...page.footerTables, ...page.noteTables].forEach(table);
  lines([...page.columns.flatMap(c => c.lines), ...page.headerLines, ...page.footerLines, ...page.noteLines]);
  drawings.sort((a, b) => (a.anchor?.zOrder ?? 0) - (b.anchor?.zOrder ?? 0));
  return new Map(drawings.map((drawing, index) => [drawing, drawing.anchor?.behindDocument ? index - drawings.length : index + 2]));
}
