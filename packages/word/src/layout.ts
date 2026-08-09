import type {
  WordBlock,
  WordBreakType,
  WordDocument,
  WordHyperlink,
  WordInline,
  WordParagraph,
  WordRun,
  WordSectionProperties,
  WordTable,
  WordHeaderFooterStory,
  WordNoteStory,
} from "./document.ts";
import type { ComputedWordParagraphFormat, ComputedWordTextFormat, WordTabStop } from "./styles.ts";
import { WordError } from "./document.ts";
import type { WordListMarker } from "./numbering.ts";
import { resolveWordTableGrid, type ResolvedWordTableCell } from "./table-grid.ts";
import type { WordDrawing } from "./drawings.ts";

const TWIPS_PER_POINT = 20;
const CSS_PIXELS_PER_POINT = 4 / 3;
const DEFAULT_TAB_POINTS = 36;

export interface WordTextMeasurement {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
}

export interface WordTextMeasurer {
  /** Measures shaped text in points using the computed Word appearance. */
  measure(text: string, format: ComputedWordTextFormat): WordTextMeasurement;
}

export interface WordLayoutOptions {
  readonly maxPages?: number;
  readonly maxFragments?: number;
}

export interface WordLayout {
  readonly pages: readonly WordLayoutPage[];
  readonly fragmentCount: number;
}

export interface WordLayoutPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly section: WordSectionProperties;
  readonly columns: readonly WordLayoutColumn[];
  readonly headerLines: readonly WordLayoutLine[];
  readonly footerLines: readonly WordLayoutLine[];
  readonly headerTables: readonly WordLayoutTable[];
  readonly footerTables: readonly WordLayoutTable[];
  readonly noteLines: readonly WordLayoutLine[];
  readonly noteTables: readonly WordLayoutTable[];
  readonly noteSeparatorY: number | undefined;
}

export interface WordLayoutColumn {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly WordLayoutLine[];
  readonly tables: readonly WordLayoutTable[];
  readonly unsupportedBlocks: readonly { readonly elementId: number; readonly localName: string; readonly y: number }[];
}

export interface WordLayoutTable {
  readonly tableElementId: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly WordLayoutTableCell[];
}

export interface WordLayoutTableCell {
  readonly cellElementId: number;
  readonly continuationElementIds: readonly number[];
  readonly row: number;
  readonly column: number;
  readonly columnSpan: number;
  readonly rowSpan: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly WordLayoutLine[];
  readonly tables: readonly WordLayoutTable[];
}

export interface WordLayoutLine {
  readonly paragraphElementId: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly fragments: readonly WordLayoutFragment[];
  readonly marker: WordLayoutMarker | undefined;
}

export interface WordLayoutMarker {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
  readonly format: ComputedWordTextFormat;
}

export interface WordLayoutFragment {
  readonly kind: "text" | "tab" | "drawing" | "note";
  readonly runElementId: number;
  readonly contentElementId: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly format: ComputedWordTextFormat;
  readonly hyperlink: string | undefined;
  readonly drawing: WordDrawing | undefined;
  readonly note: { readonly kind: "footnote" | "endnote"; readonly id: number } | undefined;
}

interface LayoutBudget {
  readonly maxPages: number;
  readonly maxFragments: number;
  fragments: number;
}

interface MutableColumn {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lines: WordLayoutLine[];
  readonly tables: WordLayoutTable[];
  readonly unsupportedBlocks: Array<{ readonly elementId: number; readonly localName: string; readonly y: number }>;
}

interface MutablePage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly section: WordSectionProperties;
  readonly columns: MutableColumn[];
  headerLines: WordLayoutLine[];
  footerLines: WordLayoutLine[];
  headerTables: WordLayoutTable[];
  footerTables: WordLayoutTable[];
  noteLines: WordLayoutLine[];
  noteTables: WordLayoutTable[];
  noteSeparatorY: number | undefined;
}

type WordLayoutDocumentContext = Pick<WordDocument, "package" | "part" | "source" | "conformance" | "styles" | "numbering" | "drawings" | "blocks">;

type ParagraphAtom = GlyphAtom | TabAtom | DrawingAtom | NoteAtom | BreakAtom;

interface AtomBase {
  readonly runElementId: number;
  readonly contentElementId: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly format: ComputedWordTextFormat;
  readonly hyperlink: string | undefined;
}

interface GlyphAtom extends AtomBase {
  readonly kind: "glyph";
  readonly text: string;
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly breakAfter: boolean;
  readonly whitespace: boolean;
}

interface TabAtom extends AtomBase {
  readonly kind: "tab";
}

interface DrawingAtom extends AtomBase {
  readonly kind: "drawing";
  readonly width: number;
  readonly flowWidth: number;
  readonly ascent: number;
  readonly descent: number;
  readonly drawing: WordDrawing | undefined;
}

interface NoteAtom extends AtomBase {
  readonly kind: "note";
  readonly text: string;
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly noteKind: "footnote" | "endnote";
  readonly noteId: number;
}

interface BreakAtom extends AtomBase {
  readonly kind: "break";
  readonly breakType: WordBreakType;
}

interface PreparedParagraph {
  readonly paragraph: WordParagraph;
  readonly format: ComputedWordParagraphFormat;
  readonly lines: readonly PreparedLine[];
  readonly marker: PreparedMarker | undefined;
}

interface PreparedMarker {
  readonly source: WordListMarker;
  readonly text: string;
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly format: ComputedWordTextFormat;
}

interface PreparedTable {
  readonly table: WordTable;
  readonly xOffset: number;
  readonly width: number;
  readonly columnOffsets: readonly number[];
  readonly rowHeights: readonly number[];
  readonly cells: readonly PreparedTableCell[];
}

interface PreparedTableCell {
  readonly resolved: ResolvedWordTableCell;
  readonly width: number;
  readonly contentHeight: number;
  readonly paragraphs: readonly PreparedParagraph[];
  readonly nestedTables: readonly PreparedTable[];
  readonly margins: { readonly top: number; readonly end: number; readonly bottom: number; readonly start: number };
  readonly verticalAlignment: "top" | "center" | "bottom";
}

interface PreparedLine {
  readonly atoms: readonly Exclude<ParagraphAtom, BreakAtom>[];
  readonly startOffset: number;
  readonly endOffset: number;
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly breakAfter: WordBreakType | undefined;
}

/** Lays out the supported WordprocessingML flow into explicit page and line geometry. */
export function layoutWordDocument(
  document: WordDocument,
  measurer: WordTextMeasurer,
  options: WordLayoutOptions = {},
): WordLayout {
  const budget: LayoutBudget = {
    maxPages: limit(options.maxPages, 10_000, "page"),
    maxFragments: limit(options.maxFragments, 1_000_000, "fragment"),
    fragments: 0,
  };
  const pages: MutablePage[] = [];
  const sections = documentSections(document.blocks, document.finalSection);
  const listMarkers = document.numbering.markers(document);
  let page: MutablePage | undefined;
  let columnIndex = 0;
  let cursorY = 0;

  const addPage = (section: WordSectionProperties, parity?: "even" | "odd"): MutablePage => {
    if (parity !== undefined && pages.length > 0 && ((pages.length + 1) % 2 === 0 ? "even" : "odd") !== parity) {
      createPage(section, pages, budget);
    }
    const created = createPage(section, pages, budget);
    page = created;
    columnIndex = 0;
    cursorY = created.columns[0]!.y;
    return created;
  };

  const advanceColumn = (section: WordSectionProperties): void => {
    if (page === undefined || page.section !== section || columnIndex + 1 >= page.columns.length) {
      addPage(section);
      return;
    }
    columnIndex += 1;
    cursorY = page.columns[columnIndex]!.y;
  };

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex]!;
    const isFirst = page === undefined;
    if (isFirst) addPage(section.properties);
    else if (section.properties.breakType === "nextColumn") advanceColumn(section.properties);
    else if (section.properties.breakType === "continuous" && samePageGeometry(page!.section, section.properties)) {
      // Continuous sections share the current page but can change the remaining column set only on the next page.
    } else addPage(section.properties, section.properties.breakType === "evenPage" ? "even" : section.properties.breakType === "oddPage" ? "odd" : undefined);

    for (let blockIndex = 0; blockIndex < section.blocks.length; blockIndex += 1) {
      const block = section.blocks[blockIndex]!;
      if (block.kind === "table") {
        let target = page!.columns[columnIndex]!;
        const preparedTable = prepareTable(document, block, target.width, measurer, listMarkers);
        const groups = tableRowGroups(preparedTable);
        const headerRows = leadingHeaderRows(preparedTable);
        let groupIndex = 0;
        while (groupIndex < groups.length) {
          target = page!.columns[columnIndex]!;
          const atTop = cursorY === target.y;
          const repeated = groupIndex > 0 ? headerRows : [];
          const repeatedHeight = rowSetHeight(preparedTable, repeated);
          const selected = [...repeated];
          let used = repeatedHeight;
          while (groupIndex < groups.length) {
            const group = groups[groupIndex]!;
            const groupHeight = rowSetHeight(preparedTable, group);
            if (selected.length > repeated.length && cursorY + used + groupHeight > target.y + target.height) break;
            if (selected.length === repeated.length && cursorY + used + groupHeight > target.y + target.height && !atTop) break;
            selected.push(...group);
            used += groupHeight;
            groupIndex += 1;
            if (cursorY + used >= target.y + target.height) break;
          }
          if (selected.length === repeated.length) {
            advanceColumn(section.properties);
            continue;
          }
          const slice = slicePreparedTable(preparedTable, selected);
          target.tables.push(placeTable(slice, target.x, cursorY, budget));
          cursorY += used;
          if (groupIndex < groups.length) advanceColumn(section.properties);
        }
        continue;
      }
      if (block.kind !== "paragraph") {
        const column = page!.columns[columnIndex]!;
        column.unsupportedBlocks.push(Object.freeze({ elementId: block.elementId, localName: block.localName, y: cursorY }));
        continue;
      }
      let prepared = prepareParagraph(document, block, page!.columns[columnIndex]!.width, measurer, listMarkers.get(block.elementId));
      const nextBlock = section.blocks[blockIndex + 1];
      const requiredHeight = paragraphHeight(prepared) + (prepared.format.keepNext && nextBlock?.kind === "paragraph"
        ? firstLineHeight(prepareParagraph(document, nextBlock, page!.columns[columnIndex]!.width, measurer, listMarkers.get(nextBlock.elementId)))
        : 0);
      const currentColumn = page!.columns[columnIndex]!;
      if ((prepared.format.pageBreakBefore || prepared.format.keepLines && requiredHeight > currentColumn.y + currentColumn.height - cursorY) && cursorY > currentColumn.y) {
        advanceColumn(section.properties);
        prepared = prepareParagraph(document, block, page!.columns[columnIndex]!.width, measurer, listMarkers.get(block.elementId));
      }
      cursorY += points(prepared.format.spacingBeforeTwips);
      for (let lineIndex = 0; lineIndex < prepared.lines.length; lineIndex += 1) {
        const line = prepared.lines[lineIndex]!;
        let column = page!.columns[columnIndex]!;
        const lineHeight = line.ascent + line.descent;
        if (cursorY + lineHeight > column.y + column.height && cursorY > column.y) {
          // Widow control keeps at least two lines together at either side when practical.
          const remaining = prepared.lines.length - lineIndex;
          if (prepared.format.widowControl && lineIndex === 1 && column.lines.at(-1)?.paragraphElementId === block.elementId) {
            const moved = column.lines.pop();
            if (moved !== undefined) cursorY = moved.y;
            advanceColumn(section.properties);
            column = page!.columns[columnIndex]!;
            if (moved !== undefined) {
              const translated = translateLine(moved, column.x - moved.x, cursorY - moved.y);
              column.lines.push(translated);
              cursorY += translated.height;
            }
          } else {
            advanceColumn(section.properties);
            column = page!.columns[columnIndex]!;
          }
        }
        const laidOut = placeLine(block, prepared.format, line, column, cursorY, budget, lineIndex === 0 ? prepared.marker : undefined);
        column.lines.push(laidOut);
        cursorY += laidOut.height;
        if (line.breakAfter === "page") addPage(section.properties);
        else if (line.breakAfter === "column") advanceColumn(section.properties);
      }
      cursorY += points(prepared.format.spacingAfterTwips);
    }
  }
  decorateNotes(document, pages, measurer, budget);
  decorateHeaderFooters(document, pages, measurer, budget, sections);
  return Object.freeze({
    pages: Object.freeze(pages.map(freezePage)),
    fragmentCount: budget.fragments,
  });
}

export function wordPointsToCssPixels(pointsValue: number): number {
  if (!Number.isFinite(pointsValue)) throw new TypeError("Word layout points must be finite.");
  return pointsValue * CSS_PIXELS_PER_POINT;
}

function prepareTable(
  document: WordLayoutDocumentContext,
  table: WordTable,
  availableWidth: number,
  measurer: WordTextMeasurer,
  listMarkers: ReadonlyMap<number, WordListMarker>,
): PreparedTable {
  const grid = resolveWordTableGrid(table);
  const gridTotal = Math.max(1, grid.columnWidthsTwips.reduce((sum, value) => sum + value, 0));
  const requested = table.properties.width?.type === "dxa" ? points(table.properties.width.value)
    : table.properties.width?.type === "pct" ? availableWidth * table.properties.width.value / 5_000
    : points(gridTotal);
  const width = Math.max(1, Math.min(availableWidth, requested || availableWidth));
  const xOffset = table.properties.alignment === "center" ? Math.max(0, (availableWidth - width) / 2)
    : table.properties.alignment === "end" ? Math.max(0, availableWidth - width)
    : Math.min(availableWidth - 1, points(table.properties.indentTwips));
  const scale = width / gridTotal;
  const columnWidths = grid.columnWidthsTwips.map((value) => value * scale);
  const columnOffsets = [0];
  for (const value of columnWidths) columnOffsets.push(columnOffsets.at(-1)! + value);
  const preparedCells: PreparedTableCell[] = [];
  const rowHeights = grid.rows.map((row) => row.source.heightTwips === undefined ? 0 : points(row.source.heightTwips));
  for (const row of grid.rows) for (const cell of row.cells) {
    const cellWidth = columnOffsets[cell.column + cell.columnSpan]! - columnOffsets[cell.column]!;
    const sourceMargins = cell.source.margins ?? table.properties.cellMargins;
    const margins = Object.freeze({ top: points(sourceMargins.topTwips), end: points(sourceMargins.endTwips), bottom: points(sourceMargins.bottomTwips), start: points(sourceMargins.startTwips) });
    const innerWidth = Math.max(1, cellWidth - margins.start - margins.end);
    const paragraphs = cell.source.blocks.filter((block): block is WordParagraph => block.kind === "paragraph")
      .map((paragraph) => prepareParagraph(document, paragraph, innerWidth, measurer, listMarkers.get(paragraph.elementId)));
    const nestedTables = cell.source.blocks.filter((block): block is WordTable => block.kind === "table")
      .map((nested) => prepareTable(document, nested, innerWidth, measurer, listMarkers));
    const contentHeight = paragraphs.reduce((sum, paragraph) => sum + paragraphHeight(paragraph), 0) +
      nestedTables.reduce((sum, nested) => sum + nested.rowHeights.reduce((height, row) => height + row, 0), 0) + margins.top + margins.bottom;
    preparedCells.push(Object.freeze({ resolved: cell, width: cellWidth, contentHeight, paragraphs: Object.freeze(paragraphs), nestedTables: Object.freeze(nestedTables), margins, verticalAlignment: cell.source.verticalAlignment }));
    if (cell.rowSpan === 1) rowHeights[cell.row] = Math.max(rowHeights[cell.row] ?? 0, contentHeight);
  }
  for (const cell of preparedCells.filter((item) => item.resolved.rowSpan > 1)) {
    const end = Math.min(rowHeights.length, cell.resolved.row + cell.resolved.rowSpan);
    const current = rowHeights.slice(cell.resolved.row, end).reduce((sum, value) => sum + value, 0);
    if (current < cell.contentHeight) rowHeights[end - 1] = (rowHeights[end - 1] ?? 0) + cell.contentHeight - current;
  }
  for (let index = 0; index < rowHeights.length; index += 1) {
    const source = grid.rows[index]!.source;
    rowHeights[index] = source.heightRule === "exact" && source.heightTwips !== undefined
      ? Math.max(1, points(source.heightTwips))
      : Math.max(rowHeights[index] ?? 0, 12);
  }
  return Object.freeze({ table, xOffset, width, columnOffsets: Object.freeze(columnOffsets), rowHeights: Object.freeze(rowHeights), cells: Object.freeze(preparedCells) });
}

function leadingHeaderRows(prepared: PreparedTable): readonly number[] {
  const rows: number[] = [];
  for (let index = 0; index < prepared.table.rows.length && prepared.table.rows[index]!.repeatHeader; index += 1) rows.push(index);
  return Object.freeze(rows);
}

/** Groups rows which cannot be separated because of cantSplit or a vertical merge. */
function tableRowGroups(prepared: PreparedTable): readonly (readonly number[])[] {
  const groups: number[][] = [];
  let start = 0;
  while (start < prepared.rowHeights.length) {
    let end = start + 1;
    for (;;) {
      const spanningEnd = prepared.cells
        .filter((cell) => cell.resolved.row < end && cell.resolved.row + cell.resolved.rowSpan > end)
        .reduce((maximum, cell) => Math.max(maximum, cell.resolved.row + cell.resolved.rowSpan), end);
      if (spanningEnd === end) break;
      end = Math.min(prepared.rowHeights.length, spanningEnd);
    }
    // cantSplit prevents splitting the row itself; rows are already the minimum pagination unit.
    groups.push(Array.from({ length: end - start }, (_, index) => start + index));
    start = end;
  }
  return Object.freeze(groups.map((group) => Object.freeze(group)));
}

function rowSetHeight(prepared: PreparedTable, rows: readonly number[]): number {
  return rows.reduce((sum, row) => sum + prepared.rowHeights[row]!, 0);
}

function slicePreparedTable(prepared: PreparedTable, rows: readonly number[]): PreparedTable {
  const rowMap = new Map(rows.map((row, index) => [row, index]));
  const cells = prepared.cells.flatMap((cell): PreparedTableCell[] => {
    const row = rowMap.get(cell.resolved.row);
    if (row === undefined) return [];
    const covered = Array.from({ length: cell.resolved.rowSpan }, (_, index) => cell.resolved.row + index);
    if (!covered.every((sourceRow) => rowMap.has(sourceRow))) return [];
    return [Object.freeze({
      ...cell,
      resolved: Object.freeze({ ...cell.resolved, row, rowSpan: covered.length }),
    })];
  });
  return Object.freeze({
    ...prepared,
    rowHeights: Object.freeze(rows.map((row) => prepared.rowHeights[row]!)),
    cells: Object.freeze(cells),
  });
}

function placeTable(prepared: PreparedTable, columnX: number, y: number, budget: LayoutBudget): WordLayoutTable {
  const rowOffsets = [0];
  for (const height of prepared.rowHeights) rowOffsets.push(rowOffsets.at(-1)! + height);
  const x = columnX + prepared.xOffset;
  const cells = prepared.cells.map((cell): WordLayoutTableCell => {
    const cellY = y + rowOffsets[cell.resolved.row]!;
    const cellHeight = rowOffsets[Math.min(rowOffsets.length - 1, cell.resolved.row + cell.resolved.rowSpan)]! - rowOffsets[cell.resolved.row]!;
    const bodyHeight = Math.max(0, cellHeight - cell.margins.top - cell.margins.bottom);
    const textHeight = cell.paragraphs.reduce((sum, paragraph) => sum + paragraphHeight(paragraph), 0);
    const vertical = cell.verticalAlignment === "center" ? Math.max(0, (bodyHeight - textHeight) / 2)
      : cell.verticalAlignment === "bottom" ? Math.max(0, bodyHeight - textHeight) : 0;
    const fake: MutableColumn = {
      index: 0,
      x: x + prepared.columnOffsets[cell.resolved.column]! + cell.margins.start,
      y: cellY + cell.margins.top + vertical,
      width: Math.max(1, cell.width - cell.margins.start - cell.margins.end),
      height: bodyHeight,
      lines: [],
      tables: [],
      unsupportedBlocks: [],
    };
    let cursor = fake.y;
    for (const paragraph of cell.paragraphs) {
      cursor += points(paragraph.format.spacingBeforeTwips);
      for (let index = 0; index < paragraph.lines.length; index += 1) {
        const line = paragraph.lines[index]!;
        const laidOut = placeLine(paragraph.paragraph, paragraph.format, line, fake, cursor, budget, index === 0 ? paragraph.marker : undefined);
        fake.lines.push(laidOut);
        cursor += laidOut.height;
      }
      cursor += points(paragraph.format.spacingAfterTwips);
    }
    for (const nested of cell.nestedTables) {
      const table = placeTable(nested, fake.x, cursor, budget);
      fake.tables.push(table);
      cursor += table.height;
    }
    return Object.freeze({
      cellElementId: cell.resolved.source.elementId,
      continuationElementIds: cell.resolved.continuationElementIds,
      row: cell.resolved.row,
      column: cell.resolved.column,
      columnSpan: cell.resolved.columnSpan,
      rowSpan: cell.resolved.rowSpan,
      x: x + prepared.columnOffsets[cell.resolved.column]!,
      y: cellY,
      width: cell.width,
      height: cellHeight,
      lines: Object.freeze(fake.lines),
      tables: Object.freeze(fake.tables),
    });
  });
  return Object.freeze({ tableElementId: prepared.table.elementId, x, y, width: prepared.width, height: rowOffsets.at(-1)!, cells: Object.freeze(cells) });
}

function prepareParagraph(
  document: WordLayoutDocumentContext,
  paragraph: WordParagraph,
  columnWidth: number,
  measurer: WordTextMeasurer,
  markerSource?: WordListMarker,
): PreparedParagraph {
  const computed = document.styles.paragraphFormat(document, paragraph);
  const format = markerSource === undefined ? computed : Object.freeze({
    ...computed,
    indentStartTwips: computed.indentStartTwips !== 0 ? computed.indentStartTwips : markerSource.indentStartTwips ?? 720,
    hangingTwips: computed.hangingTwips !== 0 ? computed.hangingTwips : markerSource.hangingTwips ?? 360,
  });
  const width = Math.max(1, columnWidth - points(format.indentStartTwips + format.indentEndTwips));
  const atoms = paragraphAtoms(document, paragraph, measurer);
  const lines = breakLines(atoms, width, format);
  const marker = markerSource === undefined ? undefined : prepareMarker(document, paragraph, markerSource, measurer);
  return Object.freeze({ paragraph, format, lines: Object.freeze(lines), marker });
}

function prepareMarker(document: WordLayoutDocumentContext, paragraph: WordParagraph, source: WordListMarker, measurer: WordTextMeasurer): PreparedMarker {
  const firstRun = paragraph.inlines.flatMap((inline) => inline.kind === "run" ? [inline] : inline.kind === "hyperlink" || inline.kind === "insertion" ? inline.runs : [])[0];
  const format = firstRun === undefined ? DEFAULT_MARKER_FORMAT : document.styles.runFormat(document, paragraph, firstRun);
  const text = source.text + (source.suffix === "space" ? " " : source.suffix === "tab" ? "\t" : "");
  const measurement = validMeasurement(measurer.measure(source.text, format));
  return Object.freeze({ source, text, width: measurement.width, ascent: measurement.ascent, descent: measurement.descent, format });
}

function paragraphAtoms(document: WordLayoutDocumentContext, paragraph: WordParagraph, measurer: WordTextMeasurer): ParagraphAtom[] {
  const atoms: ParagraphAtom[] = [];
  let logicalOffset = 0;
  let fieldDepth = 0;
  let resultDepth = 0;
  const addRun = (run: WordRun, hyperlink: string | undefined): void => {
    const format = document.styles.runFormat(document, paragraph, run);
    for (const content of run.contents) {
      if (content.kind === "field-character") {
        if (content.fieldType === "begin") fieldDepth += 1;
        else if (content.fieldType === "separate" && fieldDepth > 0) resultDepth = fieldDepth;
        else if (content.fieldType === "end") {
          if (resultDepth === fieldDepth) resultDepth = 0;
          fieldDepth = Math.max(0, fieldDepth - 1);
        }
        continue;
      }
      if (content.kind === "field-instruction" || content.kind === "deleted-text" || fieldDepth > 0 && resultDepth !== fieldDepth) continue;
      if (content.kind === "text") {
        for (const grapheme of graphemes(content.value)) {
          const measurement = validMeasurement(measurer.measure(grapheme, format));
          const startOffset = logicalOffset;
          logicalOffset += grapheme.length;
          atoms.push(Object.freeze({
            kind: "glyph",
            runElementId: run.elementId,
            contentElementId: content.elementId,
            text: grapheme,
            width: measurement.width,
            ascent: measurement.ascent,
            descent: measurement.descent,
            breakAfter: isBreakOpportunity(grapheme),
            whitespace: /^\s+$/u.test(grapheme),
            startOffset,
            endOffset: logicalOffset,
            format,
            hyperlink,
          }));
        }
      } else if (content.kind === "tab") {
        atoms.push(controlAtom("tab", run, content.elementId, logicalOffset, format, hyperlink));
        logicalOffset += 1;
      } else if (content.kind === "break") {
        atoms.push(Object.freeze({
          ...controlAtom("break", run, content.elementId, logicalOffset, format, hyperlink),
          breakType: content.breakType,
        }));
        logicalOffset += 1;
      } else if (content.kind === "drawing") {
        const drawing = document.drawings.get(content.elementId);
        const width = drawing?.widthPoints ?? format.fontSizePoints;
        const height = drawing?.heightPoints ?? format.fontSizePoints;
        const anchored = drawing?.placement === "anchor";
        const flows = !anchored || drawing.anchor?.wrap !== "none" && drawing.anchor?.behindDocument !== true;
        atoms.push(Object.freeze({
          ...controlAtom("drawing", run, content.elementId, logicalOffset, format, hyperlink),
          width,
          flowWidth: flows ? width : 0,
          ascent: flows ? height : 0,
          descent: 0,
          drawing,
        }));
        logicalOffset += 1;
      } else if (content.kind === "footnote-reference" || content.kind === "endnote-reference") {
        const noteFormat = Object.freeze({ ...format, fontSizePoints: Math.max(1, format.fontSizePoints * 0.7), verticalAlign: "superscript" as const });
        const text = String(Math.max(1, content.id));
        const measurement = validMeasurement(measurer.measure(text, noteFormat));
        atoms.push(Object.freeze({
          ...controlAtom("note", run, content.elementId, logicalOffset, noteFormat, hyperlink),
          text,
          width: measurement.width,
          ascent: measurement.ascent + noteFormat.fontSizePoints * 0.3,
          descent: measurement.descent,
          noteKind: content.kind === "footnote-reference" ? "footnote" : "endnote",
          noteId: content.id,
        }));
        logicalOffset += 1;
      }
    }
  };
  const addInline = (inline: WordInline): void => {
    if (inline.kind === "run") addRun(inline, undefined);
    else if (inline.kind === "hyperlink") inline.runs.forEach((run) => addRun(run, hyperlinkTarget(inline)));
    else if (inline.kind === "insertion") inline.runs.forEach((run) => addRun(run, undefined));
  };
  paragraph.inlines.forEach(addInline);
  return atoms;
}

function breakLines(atoms: readonly ParagraphAtom[], width: number, format: ComputedWordParagraphFormat): PreparedLine[] {
  const result: PreparedLine[] = [];
  let line: Exclude<ParagraphAtom, BreakAtom>[] = [];
  let lineWidth = 0;
  let lastBreak = -1;
  let offset = atoms[0]?.startOffset ?? 0;
  const push = (breakAfter?: WordBreakType): void => {
    let last = line.at(-1);
    while (last?.kind === "glyph" && last.whitespace) {
      lineWidth -= last.width;
      line.pop();
      last = line.at(-1);
    }
    const ascent = Math.max(formatLineHeight(format) * 0.8, ...line.map(atomAscent));
    const descent = Math.max(formatLineHeight(format) * 0.2, ...line.map(atomDescent));
    result.push(Object.freeze({
      atoms: Object.freeze(line),
      startOffset: line[0]?.startOffset ?? offset,
      endOffset: line.at(-1)?.endOffset ?? offset,
      width: Math.max(0, lineWidth),
      ascent,
      descent,
      breakAfter,
    }));
    offset = line.at(-1)?.endOffset ?? offset;
    line = [];
    lineWidth = 0;
    lastBreak = -1;
  };
  for (const atom of atoms) {
    if (atom.kind === "break") {
      push(atom.breakType);
      offset = atom.endOffset;
      continue;
    }
    const atomWidth = atom.kind === "tab" ? tabWidth(lineWidth, format.tabs) : atom.width;
    const materialized = atom.kind === "tab" ? Object.freeze({ ...atom, width: atomWidth }) : atom;
    if (line.length > 0 && lineWidth + atomWidth > width) {
      if (lastBreak >= 0) {
        const carry = line.splice(lastBreak + 1);
        lineWidth = line.reduce((sum, item) => sum + atomWidthValue(item), 0);
        push();
        line = carry.filter((item) => item.kind !== "glyph" || !item.whitespace);
        lineWidth = line.reduce((sum, item) => sum + atomWidthValue(item), 0);
      } else push();
    }
    if (line.length === 0 && materialized.kind === "glyph" && materialized.whitespace) {
      offset = materialized.endOffset;
      continue;
    }
    line.push(materialized);
    lineWidth += atomWidthValue(materialized);
    if (materialized.kind === "glyph" && materialized.breakAfter) lastBreak = line.length - 1;
  }
  if (line.length > 0 || result.length === 0) push();
  return result;
}

function placeLine(
  paragraph: WordParagraph,
  format: ComputedWordParagraphFormat,
  line: PreparedLine,
  column: MutableColumn,
  y: number,
  budget: LayoutBudget,
  marker: PreparedMarker | undefined,
): WordLayoutLine {
  const startIndent = points(format.indentStartTwips + (line.startOffset === 0 ? format.firstLineTwips - format.hangingTwips : 0));
  const available = Math.max(0, column.width - startIndent - points(format.indentEndTwips));
  const adjustment = format.alignment === "center" ? (available - line.width) / 2
    : format.alignment === "end" ? available - line.width : 0;
  const x = column.x + startIndent + Math.max(0, adjustment);
  const fragments: WordLayoutFragment[] = [];
  let cursorX = x;
  for (const atom of line.atoms) {
    const previous = fragments.at(-1);
    const atomWidth = atomWidthValue(atom);
    const canMerge = atom.kind === "glyph" && previous?.kind === "text" &&
      previous.runElementId === atom.runElementId && previous.contentElementId === atom.contentElementId &&
      previous.endOffset === atom.startOffset;
    if (canMerge) {
      fragments[fragments.length - 1] = Object.freeze({
        ...previous,
        text: previous.text + atom.text,
        width: previous.width + atomWidth,
        endOffset: atom.endOffset,
      });
    } else {
      budget.fragments += 1;
      if (budget.fragments > budget.maxFragments) throw new WordError("limit_exceeded", `Layout exceeds ${budget.maxFragments} fragments.`);
      const ascent = atomAscent(atom);
      const descent = atomDescent(atom);
      fragments.push(Object.freeze({
        kind: atom.kind === "glyph" ? "text" : atom.kind,
        runElementId: atom.runElementId,
        contentElementId: atom.contentElementId,
        text: atom.kind === "glyph" || atom.kind === "note" ? atom.text : atom.kind === "tab" ? "\t" : "\uFFFC",
        x: atom.kind === "drawing" && atom.drawing?.placement === "anchor" ? column.x + (atom.drawing.anchor?.horizontalOffsetPoints ?? cursorX - column.x) : cursorX,
        y: atom.kind === "drawing" && atom.drawing?.placement === "anchor" ? y + (atom.drawing.anchor?.verticalOffsetPoints ?? 0) : y + line.ascent - ascent,
        width: atom.kind === "drawing" ? atom.width : atomWidth,
        height: atom.kind === "drawing" ? atom.drawing?.heightPoints ?? ascent + descent : ascent + descent,
        baseline: y + line.ascent,
        startOffset: atom.startOffset,
        endOffset: atom.endOffset,
        format: atom.format,
        hyperlink: atom.hyperlink,
        drawing: atom.kind === "drawing" ? atom.drawing : undefined,
        note: atom.kind === "note" ? Object.freeze({ kind: atom.noteKind, id: atom.noteId }) : undefined,
      }));
    }
    cursorX += atomWidth;
  }
  return Object.freeze({
    paragraphElementId: paragraph.elementId,
    x,
    y,
    width: line.width,
    height: line.ascent + line.descent,
    baseline: y + line.ascent,
    startOffset: line.startOffset,
    endOffset: line.endOffset,
    fragments: Object.freeze(fragments),
    marker: marker === undefined ? undefined : Object.freeze({
      text: marker.text,
      x: Math.max(column.x, x - points(format.hangingTwips)),
      y: y + line.ascent - marker.ascent,
      width: marker.width,
      height: marker.ascent + marker.descent,
      baseline: y + line.ascent,
      format: marker.format,
    }),
  });
}

function decorateHeaderFooters(
  document: WordDocument,
  pages: MutablePage[],
  measurer: WordTextMeasurer,
  budget: LayoutBudget,
  sections: readonly { readonly properties: WordSectionProperties; readonly blocks: readonly WordBlock[] }[],
): void {
  const effective = new Map<WordSectionProperties, ReadonlyMap<string, string>>();
  const inherited = new Map<string, string>();
  for (const section of sections) {
    for (const reference of [...section.properties.headerReferences, ...section.properties.footerReferences]) {
      inherited.set(`${reference.kind}:${reference.type}`, reference.relationshipId);
    }
    effective.set(section.properties, new Map(inherited));
  }
  const sectionPageCounts = new Map<WordSectionProperties, number>();
  for (const page of pages) {
    const sectionPageIndex = sectionPageCounts.get(page.section) ?? 0;
    sectionPageCounts.set(page.section, sectionPageIndex + 1);
    const references = effective.get(page.section) ?? new Map();
    for (const kind of ["header", "footer"] as const) {
      const preferredType = page.section.titlePage && sectionPageIndex === 0 && references.has(`${kind}:first`) ? "first"
        : (page.index + 1) % 2 === 0 && references.has(`${kind}:even`) ? "even" : "default";
      const relationshipId = references.get(`${kind}:${preferredType}`);
      if (relationshipId === undefined) continue;
      const story = document.headerFooters.find((item) => item.kind === kind && item.relationshipId === relationshipId);
      if (story === undefined) continue;
      const context = storyContext(document, story);
      const left = points(page.section.marginLeftTwips + page.section.gutterTwips);
      const width = Math.max(1, page.width - left - points(page.section.marginRightTwips));
      const flow = layoutStory(context, left, width, measurer, budget);
      const top = kind === "header" ? points(page.section.headerDistanceTwips) : Math.max(0, page.height - points(page.section.footerDistanceTwips) - flow.height);
      const lines = flow.lines.map((line) => translateLine(line, 0, top));
      const tables = flow.tables.map((table) => translateTable(table, 0, top));
      if (kind === "header") { page.headerLines = lines; page.headerTables = tables; }
      else { page.footerLines = lines; page.footerTables = tables; }
    }
  }
}

function storyContext(document: WordDocument, story: WordHeaderFooterStory | WordNoteStory): WordLayoutDocumentContext {
  return {
    package: document.package,
    part: story.part,
    source: story.source,
    conformance: document.conformance,
    styles: document.styles,
    numbering: document.numbering,
    drawings: story.drawings,
    blocks: story.blocks,
  };
}

function decorateNotes(document: WordDocument, pages: MutablePage[], measurer: WordTextMeasurer, budget: LayoutBudget): void {
  const endnotes = new Set<number>();
  for (const page of pages) {
    const footnotes = new Set<number>();
    for (const fragment of pageFragments(page)) {
      if (fragment.note?.kind === "footnote") footnotes.add(fragment.note.id);
      else if (fragment.note?.kind === "endnote") endnotes.add(fragment.note.id);
    }
    layoutPageNotes(document, page, [...footnotes].map((id) => document.notes.find((note) => note.kind === "footnote" && note.id === id)).filter((note): note is WordNoteStory => note !== undefined), measurer, budget);
  }
  const last = pages.at(-1);
  if (last !== undefined && endnotes.size > 0) {
    const stories = [...endnotes].map((id) => document.notes.find((note) => note.kind === "endnote" && note.id === id)).filter((note): note is WordNoteStory => note !== undefined);
    layoutPageNotes(document, last, stories, measurer, budget, true);
  }
}

function layoutPageNotes(document: WordDocument, page: MutablePage, stories: readonly WordNoteStory[], measurer: WordTextMeasurer, budget: LayoutBudget, append = false): void {
  if (stories.length === 0) return;
  const left = points(page.section.marginLeftTwips + page.section.gutterTwips);
  const width = Math.max(1, page.width - left - points(page.section.marginRightTwips));
  const flows = stories.map((story) => ({ story, flow: layoutStory(storyContext(document, story), left + 18, Math.max(1, width - 18), measurer, budget) }));
  const total = flows.reduce((sum, item) => sum + item.flow.height, 0) + 6;
  let cursor = Math.max(0, page.height - points(page.section.marginBottomTwips) - total);
  if (append && page.noteLines.length > 0) cursor = Math.max(cursor, page.noteLines.at(-1)!.y + page.noteLines.at(-1)!.height + 4);
  page.noteSeparatorY ??= cursor;
  cursor += 6;
  for (const { story, flow } of flows) {
    const translated = flow.lines.map((line) => translateLine(line, 0, cursor));
    const first = translated[0];
    if (first !== undefined) {
      translated[0] = Object.freeze({
        ...first,
        marker: Object.freeze({ text: String(Math.max(1, story.id)), x: left, y: first.y, width: 14, height: first.height, baseline: first.baseline, format: first.fragments[0]?.format ?? DEFAULT_MARKER_FORMAT }),
      });
    }
    page.noteLines.push(...translated);
    page.noteTables.push(...flow.tables.map((table) => translateTable(table, 0, cursor)));
    cursor += flow.height;
  }
}

function pageFragments(page: MutablePage): readonly WordLayoutFragment[] {
  const body = page.columns.flatMap((column) => [...column.lines.flatMap((line) => line.fragments), ...column.tables.flatMap((table) => table.cells.flatMap((cell) => cell.lines.flatMap((line) => line.fragments)))]);
  return body;
}

function layoutStory(
  context: WordLayoutDocumentContext,
  x: number,
  width: number,
  measurer: WordTextMeasurer,
  budget: LayoutBudget,
): { readonly lines: readonly WordLayoutLine[]; readonly tables: readonly WordLayoutTable[]; readonly height: number } {
  const column: MutableColumn = { index: 0, x, y: 0, width, height: Number.MAX_SAFE_INTEGER, lines: [], tables: [], unsupportedBlocks: [] };
  const markers = context.numbering.markers(context);
  let cursor = 0;
  for (const block of context.blocks) {
    if (block.kind === "paragraph") {
      const paragraph = prepareParagraph(context, block, width, measurer, markers.get(block.elementId));
      cursor += points(paragraph.format.spacingBeforeTwips);
      for (let index = 0; index < paragraph.lines.length; index += 1) {
        const line = placeLine(block, paragraph.format, paragraph.lines[index]!, column, cursor, budget, index === 0 ? paragraph.marker : undefined);
        column.lines.push(line);
        cursor += line.height;
      }
      cursor += points(paragraph.format.spacingAfterTwips);
    } else if (block.kind === "table") {
      const table = prepareTable(context, block, width, measurer, markers);
      column.tables.push(placeTable(table, x, cursor, budget));
      cursor += table.rowHeights.reduce((sum, value) => sum + value, 0);
    }
  }
  return Object.freeze({ lines: Object.freeze(column.lines), tables: Object.freeze(column.tables), height: cursor });
}

function translateTable(table: WordLayoutTable, dx: number, dy: number): WordLayoutTable {
  return Object.freeze({
    ...table,
    x: table.x + dx,
    y: table.y + dy,
    cells: Object.freeze(table.cells.map((cell) => Object.freeze({
      ...cell,
      x: cell.x + dx,
      y: cell.y + dy,
      lines: Object.freeze(cell.lines.map((line) => translateLine(line, dx, dy))),
      tables: Object.freeze(cell.tables.map((nested) => translateTable(nested, dx, dy))),
    }))),
  });
}

function createPage(section: WordSectionProperties, pages: MutablePage[], budget: LayoutBudget): MutablePage {
  if (pages.length >= budget.maxPages) throw new WordError("limit_exceeded", `Layout exceeds ${budget.maxPages} pages.`);
  const width = points(section.pageWidthTwips);
  const height = points(section.pageHeightTwips);
  const left = points(section.marginLeftTwips + section.gutterTwips);
  const top = points(section.marginTopTwips);
  const bodyWidth = Math.max(1, width - left - points(section.marginRightTwips));
  const bodyHeight = Math.max(1, height - top - points(section.marginBottomTwips));
  const gap = points(section.columnSpaceTwips);
  const columnWidth = Math.max(1, (bodyWidth - gap * (section.columnCount - 1)) / section.columnCount);
  const columns: MutableColumn[] = Array.from({ length: section.columnCount }, (_, index) => ({
    index,
    x: left + index * (columnWidth + gap),
    y: top,
    width: columnWidth,
    height: bodyHeight,
    lines: [],
    tables: [],
    unsupportedBlocks: [],
  }));
  const page: MutablePage = { index: pages.length, width, height, section, columns, headerLines: [], footerLines: [], headerTables: [], footerTables: [], noteLines: [], noteTables: [], noteSeparatorY: undefined };
  pages.push(page);
  return page;
}

function documentSections(
  blocks: readonly WordBlock[],
  finalSection: WordSectionProperties,
): readonly { readonly properties: WordSectionProperties; readonly blocks: readonly WordBlock[] }[] {
  const sections: Array<{ readonly properties: WordSectionProperties; readonly blocks: readonly WordBlock[] }> = [];
  let pending: WordBlock[] = [];
  for (const block of blocks) {
    pending.push(block);
    if (block.kind === "paragraph" && block.section !== undefined) {
      sections.push(Object.freeze({ properties: block.section, blocks: Object.freeze(pending) }));
      pending = [];
    }
  }
  if (pending.length > 0 || sections.length === 0) sections.push(Object.freeze({ properties: finalSection, blocks: Object.freeze(pending) }));
  return Object.freeze(sections);
}

function freezePage(page: MutablePage): WordLayoutPage {
  return Object.freeze({
    index: page.index,
    width: page.width,
    height: page.height,
    section: page.section,
    headerLines: Object.freeze(page.headerLines),
    footerLines: Object.freeze(page.footerLines),
    headerTables: Object.freeze(page.headerTables),
    footerTables: Object.freeze(page.footerTables),
    noteLines: Object.freeze(page.noteLines),
    noteTables: Object.freeze(page.noteTables),
    noteSeparatorY: page.noteSeparatorY,
    columns: Object.freeze(page.columns.map((column): WordLayoutColumn => Object.freeze({
      index: column.index,
      x: column.x,
      y: column.y,
      width: column.width,
      height: column.height,
      lines: Object.freeze(column.lines),
      tables: Object.freeze(column.tables),
      unsupportedBlocks: Object.freeze(column.unsupportedBlocks),
    }))),
  });
}

function translateLine(line: WordLayoutLine, dx: number, dy: number): WordLayoutLine {
  return Object.freeze({
    ...line,
    x: line.x + dx,
    y: line.y + dy,
    baseline: line.baseline + dy,
    fragments: Object.freeze(line.fragments.map((fragment) => Object.freeze({
      ...fragment,
      x: fragment.x + dx,
      y: fragment.y + dy,
      baseline: fragment.baseline + dy,
    }))),
    marker: line.marker === undefined ? undefined : Object.freeze({ ...line.marker, x: line.marker.x + dx, y: line.marker.y + dy, baseline: line.marker.baseline + dy }),
  });
}

function paragraphHeight(paragraph: PreparedParagraph): number {
  return points(paragraph.format.spacingBeforeTwips + paragraph.format.spacingAfterTwips) +
    paragraph.lines.reduce((sum, line) => sum + line.ascent + line.descent, 0);
}

function firstLineHeight(paragraph: PreparedParagraph): number {
  const first = paragraph.lines[0];
  return first === undefined ? 0 : points(paragraph.format.spacingBeforeTwips) + first.ascent + first.descent;
}

function formatLineHeight(format: ComputedWordParagraphFormat): number {
  if (format.lineSpacing.rule === "auto") return Math.max(1, 11 * format.lineSpacing.value / 240 * 1.2);
  return Math.max(1, points(format.lineSpacing.value));
}

function tabWidth(currentX: number, stops: readonly WordTabStop[]): number {
  const currentTwips = currentX * TWIPS_PER_POINT;
  const next = stops.find((stop) => stop.alignment !== "clear" && stop.positionTwips > currentTwips)?.positionTwips;
  if (next !== undefined) return Math.max(1, points(next) - currentX);
  return Math.max(1, Math.ceil((currentX + 0.001) / DEFAULT_TAB_POINTS) * DEFAULT_TAB_POINTS - currentX);
}

function controlAtom<K extends "tab" | "drawing" | "break" | "note">(
  kind: K,
  run: WordRun,
  contentElementId: number,
  offset: number,
  format: ComputedWordTextFormat,
  hyperlink: string | undefined,
): AtomBase & { readonly kind: K } {
  return {
    kind,
    runElementId: run.elementId,
    contentElementId,
    startOffset: offset,
    endOffset: offset + 1,
    format,
    hyperlink,
  };
}

function atomWidthValue(atom: Exclude<ParagraphAtom, BreakAtom>): number {
  return atom.kind === "tab" ? (atom as TabAtom & { readonly width?: number }).width ?? DEFAULT_TAB_POINTS : atom.kind === "drawing" ? atom.flowWidth : atom.width;
}

function atomAscent(atom: Exclude<ParagraphAtom, BreakAtom>): number {
  return atom.kind === "tab" ? atom.format.fontSizePoints * 0.8 : atom.ascent;
}

function atomDescent(atom: Exclude<ParagraphAtom, BreakAtom>): number {
  return atom.kind === "tab" ? atom.format.fontSizePoints * 0.2 : atom.descent;
}

function validMeasurement(measurement: WordTextMeasurement): WordTextMeasurement {
  if (![measurement.width, measurement.ascent, measurement.descent].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new TypeError("A Word text measurer must return finite non-negative geometry.");
  }
  return measurement;
}

function graphemes(value: string): string[] {
  const Segmenter = Intl.Segmenter;
  if (Segmenter === undefined) return Array.from(value);
  return [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((segment) => segment.segment);
}

function isBreakOpportunity(value: string): boolean {
  return /^\s+$/u.test(value) || value === "-" || value === "\u2010" || value === "\u2013" || value === "\u200B";
}

function hyperlinkTarget(hyperlink: WordHyperlink): string | undefined {
  return hyperlink.target ?? (hyperlink.anchor === undefined ? undefined : `#${hyperlink.anchor}`);
}

function points(twips: number): number {
  return twips / TWIPS_PER_POINT;
}

function limit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) throw new RangeError(`Maximum ${label} count must be a positive integer.`);
  return resolved;
}

function samePageGeometry(left: WordSectionProperties, right: WordSectionProperties): boolean {
  return left.pageWidthTwips === right.pageWidthTwips && left.pageHeightTwips === right.pageHeightTwips &&
    left.marginTopTwips === right.marginTopTwips && left.marginRightTwips === right.marginRightTwips &&
    left.marginBottomTwips === right.marginBottomTwips && left.marginLeftTwips === right.marginLeftTwips &&
    left.gutterTwips === right.gutterTwips;
}

const DEFAULT_MARKER_FORMAT: ComputedWordTextFormat = Object.freeze({
  fontFamily: "Calibri",
  fontSizePoints: 11,
  bold: false,
  italic: false,
  underline: "none",
  strike: false,
  color: "#000000",
  highlight: undefined,
  verticalAlign: "baseline",
  rightToLeft: false,
});
