import type { WordDrawingAnchor } from './drawings.ts';
import type { WordLayoutLine, WordLayoutPage, WordLayoutTable } from './layout.ts';

const alignedLines = new WeakMap<WordLayoutLine, { key: string; value: WordLayoutLine }>();

/** Resolve horizontal alignment after pagination, when the page and column bounds are known.
 * This also avoids translating page-relative alignment with cached paragraph/table geometry.
 */
export function alignWordPageDrawings(page: WordLayoutPage): WordLayoutPage {
  const left = (page.section.marginLeftTwips + page.section.gutterTwips) / 20;
  const right = page.width - page.section.marginRightTwips / 20;
  const even = page.index % 2 === 1;
  const lines = (items: readonly WordLayoutLine[], columnX: number, columnWidth: number) => items.map(line => {
    if (!line.fragments.some(f => f.drawing?.placement === 'anchor' && f.drawing.anchor?.horizontalAlignment)) return line;
    const key = `${page.width}:${left}:${right}:${even}:${columnX}:${columnWidth}`;
    const cached = alignedLines.get(line);
    if (cached?.key === key) return cached.value;
    const fragments = line.fragments.map(fragment => {
      const anchor = fragment.drawing?.placement === 'anchor' ? fragment.drawing.anchor : undefined;
      if (!anchor?.horizontalAlignment) return fragment;
      const range = bounds(anchor.horizontalRelativeTo, page.width, left, right, columnX, columnWidth, even);
      if (!range) return fragment;
      const alignment = physicalAlignment(anchor.horizontalAlignment, even);
      const x = range[0] + (alignment === 'center' ? (range[1] - fragment.width) / 2 : alignment === 'right' ? range[1] - fragment.width : 0);
      return fragment.x === x ? fragment : Object.freeze({ ...fragment, x });
    });
    const value = fragments.every((f, i) => f === line.fragments[i]) ? line : Object.freeze({ ...line, fragments: Object.freeze(fragments) });
    alignedLines.set(line, { key, value });
    return value;
  });
  const tables = (items: readonly WordLayoutTable[], columnX: number, columnWidth: number): readonly WordLayoutTable[] => items.map(table => {
    const cells = table.cells.map(cell => {
      const nextLines = lines(cell.lines, columnX, columnWidth);
      const nextTables = tables(cell.tables, columnX, columnWidth);
      return same(cell.lines, nextLines) && same(cell.tables, nextTables) ? cell : Object.freeze({ ...cell, lines: Object.freeze(nextLines), tables: Object.freeze(nextTables) });
    });
    return same(table.cells, cells) ? table : Object.freeze({ ...table, cells: Object.freeze(cells) });
  });
  const columns = page.columns.map(column => {
    const nextLines = lines(column.lines, column.x, column.width);
    const nextTables = tables(column.tables, column.x, column.width);
    return same(column.lines, nextLines) && same(column.tables, nextTables) ? column : Object.freeze({ ...column, lines: Object.freeze(nextLines), tables: Object.freeze(nextTables) });
  });
  const stories = {
    headerLines: lines(page.headerLines, left, right - left), footerLines: lines(page.footerLines, left, right - left), noteLines: lines(page.noteLines, left, right - left),
    headerTables: tables(page.headerTables, left, right - left), footerTables: tables(page.footerTables, left, right - left), noteTables: tables(page.noteTables, left, right - left),
  };
  if (same(page.columns, columns) && same(page.headerLines, stories.headerLines) && same(page.footerLines, stories.footerLines) && same(page.noteLines, stories.noteLines) && same(page.headerTables, stories.headerTables) && same(page.footerTables, stories.footerTables) && same(page.noteTables, stories.noteTables)) return page;
  return Object.freeze({ ...page, ...stories, columns: Object.freeze(columns) });
}
function same<T>(a: readonly T[], b: readonly T[]) { return a.length === b.length && a.every((v, i) => v === b[i]); }
function physicalAlignment(alignment: NonNullable<WordDrawingAnchor['horizontalAlignment']>, even: boolean) {
  return alignment === 'inside' ? even ? 'right' : 'left' : alignment === 'outside' ? even ? 'left' : 'right' : alignment;
}
function bounds(relative: string | undefined, width: number, left: number, right: number, columnX: number, columnWidth: number, even: boolean): readonly [number, number] | undefined {
  switch (relative) {
    case 'page': return [0, width];
    case 'margin': return [left, right - left];
    case 'column': return [columnX, columnWidth];
    case 'leftMargin': return [0, left];
    case 'rightMargin': return [right, width - right];
    case 'insideMargin': return even ? [right, width - right] : [0, left];
    case 'outsideMargin': return even ? [0, left] : [right, width - right];
    default: return undefined;
  }
}
