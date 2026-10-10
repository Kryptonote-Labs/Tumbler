import { resolveTableBorders, type WordLayoutTableBorder } from './table-borders.ts';
import type { WordCellBorders } from './table-format.ts';
import type {
  WordBlock,
  WordPositionalTab,
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

import { hasPageFields, type WordPageField } from './page-fields.ts';

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

export interface WordPageStory {
  readonly section: number;
  readonly type: 'default' | 'first' | 'even';
  readonly relationshipId?: string;
}

export interface WordLayoutPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly section: WordSectionProperties;
  readonly storyOverflow?: boolean;
  readonly headerStory?: WordPageStory;
  readonly footerStory?: WordPageStory;
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
  readonly borders?: readonly WordLayoutTableBorder[];
  readonly tableElementId: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly WordLayoutTableCell[];
}

export interface WordLayoutTableCell {
  readonly borders?: WordCellBorders;
  readonly shading?: string;
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
  readonly field?: WordPageField;
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
  readonly cache?: WordLayoutCache | undefined;
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
  storyOverflow?: boolean;
  headerStory?: WordPageStory;
  footerStory?: WordPageStory;
  headerLines: WordLayoutLine[];
  footerLines: WordLayoutLine[];
  headerTables: WordLayoutTable[];
  footerTables: WordLayoutTable[];
  noteLines: WordLayoutLine[];
  noteTables: WordLayoutTable[];
  noteSeparatorY: number | undefined;
}

export interface WordLayoutSource {
  /** OOXML compatibility setting; absent/false lets trailing spaces hang past the margin. */
  readonly wrapTrailSpaces?: boolean;
  readonly blocks: readonly WordBlock[];
  readonly drawings: ReadonlyMap<number, WordDrawing>;
  readonly finalSection: WordSectionProperties;
  readonly listMarkers: ReadonlyMap<number, WordListMarker>;
  paragraphFormat(paragraph: WordParagraph): ComputedWordParagraphFormat;
  runFormat(paragraph: WordParagraph, run: WordRun | undefined): ComputedWordTextFormat;
  readonly cache?: WordLayoutCache | undefined;
}
export type WordLayoutDocumentContext = Pick<WordLayoutSource, "blocks" | "drawings" | "paragraphFormat" | "runFormat" | "cache" | "listMarkers" | "wrapTrailSpaces"> & { readonly pageFields?: Readonly<Record<WordPageField, number>> };

export interface WordLayoutStories {
  readonly evenAndOddHeaders?: boolean;
  readonly bindings?: readonly { section: number; kind: "header" | "footer"; type: "default" | "first" | "even"; relationshipId: string }[];
  readonly headerFooters: readonly (Pick<WordHeaderFooterStory, 'kind' | 'type' | 'relationshipId'> & { readonly context: WordLayoutDocumentContext })[];
  readonly notes: readonly (Pick<WordNoteStory, 'kind' | 'id' | 'type'> & { readonly context: WordLayoutDocumentContext })[];
}

const storySources = new WeakMap<WordDocument, WordLayoutStories>();
/** Compile story styles once. Repeated page layout reads only semantic nodes and computed formats. */
export function wordLayoutStories(document: WordDocument): WordLayoutStories {
  const cached = storySources.get(document);
  if (cached) return cached;
  const result = {
    evenAndOddHeaders: document.evenAndOddHeaders,
    headerFooters: document.headerFooters.map(story => ({ kind: story.kind, type: story.type, relationshipId: story.relationshipId, context: compileStory(document, story) })),
    notes: document.notes.map(story => ({ kind: story.kind, type: story.type, id: story.id, context: compileStory(document, story) })),
  };
  storySources.set(document, result);
  return result;
}

/** Prepared geometry belongs to immutable blocks and the font measurer that produced it. */
export class WordLayoutCache {
  pages: readonly WordLayoutPage[] = [];
  readonly translated = new WeakMap<WordLayoutLine, { dx: number; dy: number; value: WordLayoutLine }>();
  readonly lines = new WeakMap<PreparedLine, { marker: PreparedMarker | undefined; value: WordLayoutLine }>();
  readonly paragraphs = new WeakMap<WordParagraph, { width: number; marker: string; measurer: WordTextMeasurer; wrapTrailSpaces: boolean; value: PreparedParagraph }>();
  readonly tables = new WeakMap<WordTable, {
    width: number;
    wrapTrailSpaces: boolean;
    measurer: WordTextMeasurer;
    markers: readonly (readonly [number, string])[];
    value: PreparedTable;
  }>();
  // Keep slices from only the current and preceding layout, including very long tables.
  layoutRevision = 0;
  readonly tableSlices = new WeakMap<PreparedTable, {
    revision: number;
    previous: Map<string, PreparedTable>;
    current: Map<string, PreparedTable>;
  }>();
  readonly tablePlacements = new WeakMap<PreparedTable, {
    x: number; y: number; fragments: number; value: WordLayoutTable;
  }>();
  measuredParagraphs = 0;
  preparedTables = 0;
}

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
  readonly field?: WordPageField;
  readonly kind: "glyph";
  readonly text: string;
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly breakAfter: boolean;
  readonly whitespace: boolean;
}

interface TabAtom extends AtomBase {
  readonly position?: WordPositionalTab;
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
  readonly cellsByRow: readonly (readonly PreparedTableCell[])[];
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
  return layoutWordSource({
    blocks: document.blocks, drawings: document.drawings, finalSection: document.finalSection, wrapTrailSpaces: document.wrapTrailSpaces,
    listMarkers: document.numbering.markers(document),
    paragraphFormat: paragraph => document.styles.paragraphFormat(document, paragraph),
    runFormat: (paragraph, run) => document.styles.runFormat(document, paragraph, run),
  }, measurer, options, wordLayoutStories(document));
}

/** Shared pagination for package-backed and native document models. */
export function layoutWordSource(
  document: WordLayoutSource,
  measurer: WordTextMeasurer,
  options: WordLayoutOptions = {},
  stories?: WordLayoutStories,
): WordLayout {
  const needsTotal = stories?.headerFooters.some(story => hasPageFields(story.context.blocks, 'NUMPAGES'));
  let total = 1;
  const seen = new Set<number>();
  while (true) {
    const layout = layoutWordSourcePass(document, measurer, options, stories, total);
    if (!needsTotal || layout.pages.length === total) return layout;
    if (seen.has(layout.pages.length)) throw new WordError('invalid_document', 'Page count fields did not reach a stable layout.');
    seen.add(total);
    total = layout.pages.length;
  }
}

function layoutWordSourcePass(document: WordLayoutSource, measurer: WordTextMeasurer, options: WordLayoutOptions, stories: WordLayoutStories | undefined, totalPages: number): WordLayout {
  if (document.cache) document.cache.layoutRevision += 1;
  const budget: LayoutBudget = {
    cache: document.cache,
    maxPages: limit(options.maxPages, 10_000, "page"),
    maxFragments: limit(options.maxFragments, 1_000_000, "fragment"),
    fragments: 0,
  };
  const pages: MutablePage[] = [];
  const sections = documentSections(document.blocks, document.finalSection);
  const listMarkers = document.listMarkers;
  let page: MutablePage | undefined;
  let columnIndex = 0;
  let cursorY = 0;

  const sectionPageCounts = new Map<WordSectionProperties, number>();
  const appendPage = (section: WordSectionProperties) => {
    const created = createPage(section, pages, budget);
    const index = sectionPageCounts.get(section) ?? 0;
    sectionPageCounts.set(section, index + 1);
    if (stories) {
      decorateHeaderFooters(stories, [created], measurer, budget, sections, new Map([[section, index]]), totalPages);
      const headerBottom = Math.max(points(section.marginTopTwips), ...created.headerLines.map(line => line.y + line.height), ...created.headerTables.map(table => table.y + table.height));
      const footerTop = Math.min(created.height - points(section.marginBottomTwips), ...created.footerLines.map(line => line.y), ...created.footerTables.map(table => table.y));
      // A repeated story that fills the page cannot be resolved by adding identical pages.
      // Keep body content within its section margins and expose the collision to the host.
      // This is a layout fallback, not an authoring limit: all story content remains in the model/export.
      if (footerTop <= headerBottom) created.storyOverflow = true;
      else for (const [columnIndex, column] of created.columns.entries()) created.columns[columnIndex] = { ...column, y: headerBottom, height: footerTop - headerBottom };
    }
    return created;
  };
  const addPage = (section: WordSectionProperties, parity?: "even" | "odd"): MutablePage => {
    if (parity !== undefined && pages.length > 0 && ((pages.length + 1) % 2 === 0 ? "even" : "odd") !== parity) {
      appendPage(section);
    }
    const created = appendPage(section);
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
          const slice = slicePreparedTable(preparedTable, selected, document.cache);
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
              const translated = translateLine(moved, column.x - moved.x, cursorY - moved.y, budget.cache);
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
  if (stories) {
    decorateNotes(stories, pages, measurer, budget);
  }
  const frozenPages = Object.freeze(pages.map((page, index) => freezePage(page, document.cache?.pages[index])));
  if (document.cache) document.cache.pages = frozenPages;
  return Object.freeze({
    pages: frozenPages,
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
  const wrapTrailSpaces = document.wrapTrailSpaces ?? false;
  const cached = document.cache?.tables.get(table);
  if (cached && cached.width === availableWidth && cached.measurer === measurer && cached.wrapTrailSpaces === wrapTrailSpaces &&
    cached.markers.every(([id, marker]) => marker === JSON.stringify(listMarkers.get(id) ?? null))) return cached.value;
  if (document.cache) document.cache.preparedTables += 1;
  const grid = resolveWordTableGrid(table);
  const gridTotal = Math.max(1, grid.columnWidthsTwips.reduce((sum, value) => sum + value, 0));
  const requested = table.properties.width?.type === "dxa" ? points(table.properties.width.value)
    : table.properties.width?.type === "pct" ? availableWidth * table.properties.width.value / 5_000
    : points(gridTotal);
  const explicitWidth = table.properties.width?.type === "dxa" || table.properties.width?.type === "pct";
  const width = Math.max(1, explicitWidth ? requested || availableWidth : Math.min(availableWidth, requested || availableWidth));
  const xOffset = table.properties.alignment === "center" ? Math.max(0, (availableWidth - width) / 2)
    : table.properties.alignment === "end" ? Math.max(0, availableWidth - width)
    : Math.min(availableWidth - 1, points(table.properties.indentTwips));
  const scale = width / gridTotal;
  const columnWidths = grid.columnWidthsTwips.map((value) => value * scale);
  const columnOffsets = [0];
  for (const value of columnWidths) columnOffsets.push(columnOffsets.at(-1)! + value);
  const preparedCells: PreparedTableCell[] = [];
  const rowHeights = grid.rows.map((row) => row.source.heightRule === "auto" || row.source.heightTwips === undefined ? 0 : points(row.source.heightTwips));
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
  const cellsByRow = rowHeights.map((): PreparedTableCell[] => []);
  for (const cell of preparedCells) cellsByRow[cell.resolved.row]!.push(cell);
  const value = Object.freeze({ table, xOffset, width, columnOffsets: Object.freeze(columnOffsets), rowHeights: Object.freeze(rowHeights), cells: Object.freeze(preparedCells), cellsByRow: Object.freeze(cellsByRow.map(row => Object.freeze(row))) });
  if (document.cache) {
    const markers: [number, string][] = [];
    const collect = (blocks: readonly WordBlock[]) => {
      for (const block of blocks) {
        if (block.kind === "paragraph") markers.push([block.elementId, JSON.stringify(listMarkers.get(block.elementId) ?? null)]);
        else if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) collect(cell.blocks);
      }
    };
    for (const row of table.rows) for (const cell of row.cells) collect(cell.blocks);
    document.cache.tables.set(table, { width: availableWidth, measurer, markers, wrapTrailSpaces, value });
  }
  return value;
}

function leadingHeaderRows(prepared: PreparedTable): readonly number[] {
  const rows: number[] = [];
  for (let index = 0; index < prepared.table.rows.length && prepared.table.rows[index]!.repeatHeader; index += 1) rows.push(index);
  return Object.freeze(rows);
}

/** Groups rows which cannot be separated because of cantSplit or a vertical merge. */
function tableRowGroups(prepared: PreparedTable): readonly (readonly number[])[] {
  const groups: number[][] = [];
  const rowEnds = prepared.rowHeights.map((_, row) => row + 1);
  for (const cell of prepared.cells) {
    const { row, rowSpan } = cell.resolved;
    rowEnds[row] = Math.max(rowEnds[row]!, Math.min(rowEnds.length, row + rowSpan));
  }
  let start = 0;
  while (start < rowEnds.length) {
    let end = start + 1;
    for (let row = start; row < end; row += 1) end = Math.max(end, rowEnds[row]!);
    // cantSplit prevents splitting the row itself; rows are already the minimum pagination unit.
    groups.push(Array.from({ length: end - start }, (_, index) => start + index));
    start = end;
  }
  return Object.freeze(groups.map((group) => Object.freeze(group)));
}

function rowSetHeight(prepared: PreparedTable, rows: readonly number[]): number {
  return rows.reduce((sum, row) => sum + prepared.rowHeights[row]!, 0);
}

function slicePreparedTable(prepared: PreparedTable, rows: readonly number[], cache?: WordLayoutCache): PreparedTable {
  let slices = cache?.tableSlices.get(prepared);
  if (cache && (!slices || slices.revision !== cache.layoutRevision)) {
    slices = { revision: cache.layoutRevision, previous: slices?.current ?? new Map(), current: new Map() };
    cache.tableSlices.set(prepared, slices);
  }
  const key = rows.join(',');
  const cached = slices?.current.get(key) ?? slices?.previous.get(key);
  if (cached) {
    slices!.current.set(key, cached);
    return cached;
  }
  const rowMap = new Map(rows.map((row, index) => [row, index]));
  const cells = rows.flatMap(row => prepared.cellsByRow[row]!).flatMap((cell): PreparedTableCell[] => {
    const row = rowMap.get(cell.resolved.row);
    if (row === undefined) return [];
    const covered = Array.from({ length: cell.resolved.rowSpan }, (_, index) => cell.resolved.row + index);
    if (!covered.every((sourceRow) => rowMap.has(sourceRow))) return [];
    return [Object.freeze({
      ...cell,
      resolved: Object.freeze({ ...cell.resolved, row, rowSpan: covered.length }),
    })];
  });
  const cellsByRow = rows.map((): PreparedTableCell[] => []);
  for (const cell of cells) cellsByRow[cell.resolved.row]!.push(cell);
  const value = Object.freeze({
    ...prepared,
    rowHeights: Object.freeze(rows.map((row) => prepared.rowHeights[row]!)),
    cells: Object.freeze(cells),
    cellsByRow: Object.freeze(cellsByRow.map(row => Object.freeze(row))),
  });
  slices?.current.set(key, value);
  return value;
}

function placeTable(prepared: PreparedTable, columnX: number, y: number, budget: LayoutBudget): WordLayoutTable {
  const cached = budget.cache?.tablePlacements.get(prepared);
  if (cached && cached.x === columnX && cached.y === y) {
    budget.fragments += cached.fragments;
    if (budget.fragments > budget.maxFragments) throw new WordError("limit_exceeded", `Layout exceeds ${budget.maxFragments} fragments.`);
    return cached.value;
  }
  const before = budget.fragments;
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
      borders: cell.resolved.source.borders ?? {},
      ...(cell.resolved.source.shading ?? prepared.table.properties.shading ? { shading: cell.resolved.source.shading ?? prepared.table.properties.shading! } : {}),
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
  const frame = { x, y, width: prepared.width, height: rowOffsets.at(-1)! };
  const value = Object.freeze({ tableElementId: prepared.table.elementId, ...frame, cells: Object.freeze(cells), borders: Object.freeze(resolveTableBorders(cells, frame, prepared.table.properties.borders)) });
  budget.cache?.tablePlacements.set(prepared, { x: columnX, y, fragments: budget.fragments - before, value });
  return value;
}

function prepareParagraph(
  document: WordLayoutDocumentContext,
  paragraph: WordParagraph,
  columnWidth: number,
  measurer: WordTextMeasurer,
  markerSource?: WordListMarker,
): PreparedParagraph {
  const wrapTrailSpaces = document.wrapTrailSpaces ?? false;
  const markerKey = JSON.stringify(markerSource);
  const cached = document.cache?.paragraphs.get(paragraph);
  if (cached && cached.width === columnWidth && cached.marker === markerKey && cached.measurer === measurer && cached.wrapTrailSpaces === wrapTrailSpaces) return cached.value;
  if (document.cache) document.cache.measuredParagraphs++;
  const computed = document.paragraphFormat(paragraph);
  const format = markerSource === undefined ? computed : Object.freeze({
    ...computed,
    indentStartTwips: computed.indentStartTwips !== 0 ? computed.indentStartTwips : markerSource.indentStartTwips ?? 720,
    hangingTwips: computed.hangingTwips !== 0 ? computed.hangingTwips : markerSource.hangingTwips ?? 360,
  });
  const width = Math.max(1, columnWidth - points(format.indentStartTwips + format.indentEndTwips));
  const atoms = paragraphAtoms(document, paragraph, measurer);
  const emptyRun = atoms.length === 0 ? paragraph.inlines.find(inline => inline.kind === 'run') : undefined;
  const mark = validMeasurement(measurer.measure(' ', document.runFormat(paragraph, emptyRun)));
  // List hanging indents position the marker, not the first line of text.
  const textFormat = markerSource ? { ...format, firstLineTwips: 0, hangingTwips: 0 } : format;
  const lines = breakLines(atoms, width, textFormat, mark, wrapTrailSpaces);
  const marker = markerSource === undefined ? undefined : prepareMarker(document, paragraph, markerSource, measurer);
  const value = Object.freeze({ paragraph, format, lines: Object.freeze(lines), marker });
  document.cache?.paragraphs.set(paragraph, { width: columnWidth, marker: markerKey, measurer, wrapTrailSpaces, value });
  return value;
}

function prepareMarker(document: WordLayoutDocumentContext, paragraph: WordParagraph, source: WordListMarker, measurer: WordTextMeasurer): PreparedMarker {
  const firstRun = paragraph.inlines.flatMap((inline) => inline.kind === "run" ? [inline] : inline.kind === "hyperlink" || inline.kind === "insertion" ? inline.runs : [])[0];
  const format = document.runFormat(paragraph, firstRun);
  const text = source.text + (source.suffix === "space" ? " " : source.suffix === "tab" ? "\t" : "");
  const measurement = validMeasurement(measurer.measure(source.text, format));
  return Object.freeze({ source, text, width: measurement.width, ascent: measurement.ascent, descent: measurement.descent, format });
}

function paragraphAtoms(document: WordLayoutDocumentContext, paragraph: WordParagraph, measurer: WordTextMeasurer): ParagraphAtom[] {
  return resolvedParagraphAtoms(paragraph, measurer, (run) => document.runFormat(paragraph, run), document.drawings, document.pageFields);
}

function resolvedParagraphAtoms(
  paragraph: WordParagraph,
  measurer: WordTextMeasurer,
  resolveFormat: (run: WordRun) => ComputedWordTextFormat,
  drawings: ReadonlyMap<number, WordDrawing>,
  pageFields?: Readonly<Record<WordPageField, number>>,
): ParagraphAtom[] {
  const atoms: ParagraphAtom[] = [];
  let logicalOffset = 0;
  let fieldDepth = 0;
  let resultDepth = 0;
  const addRun = (run: WordRun, hyperlink: string | undefined): void => {
    const format = resolveFormat(run);
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
      if (content.kind === 'page-field') {
        const text = String(pageFields?.[content.field] ?? 1);
        const measurement = validMeasurement(measurer.measure(text, format));
        atoms.push(Object.freeze({ kind: 'glyph', field: content.field, runElementId: run.elementId,
          contentElementId: content.elementId, text, ...measurement, breakAfter: false, whitespace: false,
          startOffset: logicalOffset, endOffset: ++logicalOffset, format, hyperlink }));
      } else if (content.kind === "text") {
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
        atoms.push({ ...controlAtom("tab", run, content.elementId, logicalOffset, format, hyperlink), ...(content.position ? { position: content.position } : {}) });
        logicalOffset += 1;
      } else if (content.kind === "break") {
        atoms.push(Object.freeze({
          ...controlAtom("break", run, content.elementId, logicalOffset, format, hyperlink),
          breakType: content.breakType,
        }));
        logicalOffset += 1;
      } else if (content.kind === "drawing") {
        const drawing = drawings.get(content.elementId);
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

function breakLines(atoms: readonly ParagraphAtom[], width: number, format: ComputedWordParagraphFormat, mark: WordTextMeasurement, wrapTrailSpaces: boolean): PreparedLine[] {
  const result: PreparedLine[] = [];
  let line: Exclude<ParagraphAtom, BreakAtom>[] = [];
  let lineWidth = 0;
  let lastBreak = -1;
  let offset = atoms[0]?.startOffset ?? 0;
  const push = (breakAfter?: WordBreakType): void => {
    const logicalStart = line[0]?.startOffset ?? offset;
    const logicalEnd = line.at(-1)?.endOffset ?? offset;
    // Include trailing whitespace and the paragraph mark in vertical metrics even when unpainted.
    const naturalAscent = Math.max(mark.ascent, ...line.map(atomAscent));
    const naturalDescent = Math.max(mark.descent, ...line.map(atomDescent));
    const naturalHeight = naturalAscent + naturalDescent;
    const height = format.lineSpacing.rule === 'auto'
      ? Math.max(1, Math.floor(Math.round(naturalHeight * TWIPS_PER_POINT) * format.lineSpacing.value / 240) / TWIPS_PER_POINT)
      : format.lineSpacing.rule === 'exact' ? Math.max(1, points(format.lineSpacing.value))
        : Math.max(1, naturalHeight, points(format.lineSpacing.value));
    const leading = height - naturalHeight;
    // Automatic spacing advances the next line without moving this line's baseline.
    // Resolve it in whole twips, as with authored exact/at-least spacing.
    const ascent = format.lineSpacing.rule === 'auto' ? naturalAscent : naturalAscent + leading / 2;
    const descent = height - ascent;
    let last = line.at(-1);
    while (last?.kind === "glyph" && last.whitespace) {
      lineWidth -= last.width;
      line.pop();
      last = line.at(-1);
    }
    result.push(Object.freeze({
      atoms: Object.freeze(line),
      startOffset: logicalStart,
      endOffset: logicalEnd,
      width: Math.max(0, lineWidth),
      ascent,
      descent,
      breakAfter,
    }));
    offset = logicalEnd;
    line = [];
    lineWidth = 0;
    lastBreak = -1;
  };
  for (const [index, atom] of atoms.entries()) {
    if (atom.kind === "break") {
      push(atom.breakType);
      offset = atom.endOffset;
      continue;
    }
    let atomWidth = atom.kind === "tab" ? tabAdvance(atom, atoms, index, lineWidth, width, format, result.length === 0) : atom.width;
    if (atom.kind === "tab" && atom.position && atomWidth < 0 && line.length) {
      push();
      atomWidth = tabAdvance(atom, atoms, index, 0, width, format, false);
    }
    atomWidth = Math.max(0, atomWidth);
    let materialized = atom.kind === "tab" ? Object.freeze({ ...atom, width: atomWidth }) : atom;
    // ISO/IEC 29500 wrapTrailSpaces: ordinary trailing spaces hang by default.
    // Keep their logical offsets; push() removes only their painted advance.
    const hangingSpace = !wrapTrailSpaces && materialized.kind === "glyph" && materialized.text === " ";
    if (!hangingSpace && line.length > 0 && lineWidth + atomWidthValue(materialized) > Math.max(1, width - (result.length === 0 ? points(format.firstLineTwips - format.hangingTwips) : 0))) {
      if (lastBreak >= 0) {
        const carry = line.splice(lastBreak + 1);
        lineWidth = line.reduce((sum, item) => sum + atomWidthValue(item), 0);
        push();
        line = carry;
        lineWidth = line.reduce((sum, item) => sum + atomWidthValue(item), 0);
      } else push();
      if (atom.kind === "tab") materialized = Object.freeze({ ...atom, width: Math.max(0, tabAdvance(atom, atoms, index, lineWidth, width, format, result.length === 0)) });
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
  const startIndent = points(format.indentStartTwips + (line.startOffset === 0 && !marker ? format.firstLineTwips - format.hangingTwips : 0));
  const available = Math.max(0, column.width - startIndent - points(format.indentEndTwips));
  const adjustment = format.alignment === "center" ? (available - line.width) / 2
    : format.alignment === "end" ? available - line.width : 0;
  const x = column.x + startIndent + Math.max(0, adjustment);
  const cached = budget.cache?.lines.get(line);
  if (cached && cached.marker === marker) {
    budget.fragments += cached.value.fragments.length;
    if (budget.fragments > budget.maxFragments) throw new WordError("limit_exceeded", `Layout exceeds ${budget.maxFragments} fragments.`);
    const value = cached.value.x === x && cached.value.y === y ? cached.value : translateLine(cached.value, x - cached.value.x, y - cached.value.y);
    budget.cache!.lines.set(line, { marker, value });
    return value;
  }
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
        ...(atom.kind === "glyph" && atom.field ? { field: atom.field } : {}),
        runElementId: atom.runElementId,
        contentElementId: atom.contentElementId,
        text: atom.kind === "glyph" || atom.kind === "note" ? atom.text : atom.kind === "tab" ? "\t" : "\uFFFC",
        x: atom.kind === "drawing" && atom.drawing?.placement === "anchor" ? (atom.drawing.anchor?.horizontalRelativeTo === "page" ? 0 : column.x) + (atom.drawing.anchor?.horizontalOffsetPoints ?? cursorX - column.x) : cursorX,
        y: atom.kind === "drawing" && atom.drawing?.placement === "anchor" ? (atom.drawing.anchor?.verticalRelativeTo === "page" ? 0 : atom.drawing.anchor?.verticalRelativeTo === "paragraph" ? column.lines.find(item => item.paragraphElementId === paragraph.elementId)?.y ?? y : y) + (atom.drawing.anchor?.verticalOffsetPoints ?? 0) : y + line.ascent - ascent,
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
  const value = Object.freeze({
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
  // Anchors may depend on page/paragraph origins rather than this line's translation.
  if (budget.cache && !line.atoms.some(atom => atom.kind === "drawing" && atom.drawing?.placement === "anchor")) {
    budget.cache.lines.set(line, { marker, value });
  }
  return value;
}

function decorateHeaderFooters(
  document: WordLayoutStories,
  pages: MutablePage[],
  measurer: WordTextMeasurer,
  budget: LayoutBudget,
  sections: readonly { readonly properties: WordSectionProperties; readonly blocks: readonly WordBlock[] }[],
  sectionPageCounts = new Map<WordSectionProperties, number>(),
  totalPages = pages.length,
): void {
  const effective = new Map<WordSectionProperties, ReadonlyMap<string, { relationshipId: string; section: number }>>();
  const inherited = new Map<string, { relationshipId: string; section: number }>();
  for (const [sectionIndex, section] of sections.entries()) {
    for (const reference of [...section.properties.headerReferences, ...section.properties.footerReferences]) {
      inherited.set(`${reference.kind}:${reference.type}`, { relationshipId: reference.relationshipId, section: sectionIndex });
    }
    for (const binding of document.bindings ?? []) if (binding.section === sectionIndex) inherited.set(`${binding.kind}:${binding.type}`, { relationshipId: binding.relationshipId, section: sectionIndex });
    effective.set(section.properties, new Map(inherited));
  }
  for (const page of pages) {
    const sectionPageIndex = sectionPageCounts.get(page.section) ?? 0;
    sectionPageCounts.set(page.section, sectionPageIndex + 1);
    const references = effective.get(page.section);
    for (const kind of ["header", "footer"] as const) {
      const preferredType = page.section.titlePage && sectionPageIndex === 0 ? "first"
        : document.evenAndOddHeaders && (page.index + 1) % 2 === 0 ? "even" : "default";
      const reference = references?.get(`${kind}:${preferredType}`);
      const relationshipId = reference?.relationshipId;
      const pageStory: WordPageStory = { section: reference?.section ?? sections.findIndex(item => item.properties === page.section), type: preferredType, ...(relationshipId === undefined ? {} : { relationshipId }) };
      if (kind === 'header') page.headerStory = pageStory;
      else page.footerStory = pageStory;
      if (relationshipId === undefined) continue;
      const story = document.headerFooters.find((item) => item.kind === kind && item.relationshipId === relationshipId);
      if (story === undefined) continue;
      const source = story.context;
      const context: WordLayoutDocumentContext = hasPageFields(source.blocks)
        ? { blocks: source.blocks, drawings: source.drawings, listMarkers: source.listMarkers,
            paragraphFormat: paragraph => source.paragraphFormat(paragraph), runFormat: (paragraph, run) => source.runFormat(paragraph, run),
            pageFields: { PAGE: page.index + 1, NUMPAGES: totalPages } }
        : source;
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

function compileStory(document: WordDocument, story: WordHeaderFooterStory | WordNoteStory): WordLayoutDocumentContext {
  const context = { package: document.package, part: story.part, source: story.source, conformance: document.conformance };
  const paragraphs = new Map<WordParagraph, ComputedWordParagraphFormat>();
  const defaults = new Map<WordParagraph, ComputedWordTextFormat>();
  const runs = new Map<WordRun, ComputedWordTextFormat>();
  const visit = (blocks: readonly WordBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'table') for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
      else if (block.kind === 'paragraph') {
        paragraphs.set(block, document.styles.paragraphFormat(context, block));
        defaults.set(block, document.styles.runFormat(context, block));
        for (const inline of block.inlines) {
          for (const run of inline.kind === 'run' ? [inline] : inline.kind === 'hyperlink' || inline.kind === 'insertion' ? inline.runs : [])
            runs.set(run, document.styles.runFormat(context, block, run));
        }
      }
    }
  };
  visit(story.blocks);
  return {
    wrapTrailSpaces: document.wrapTrailSpaces,
    drawings: story.drawings, blocks: story.blocks, listMarkers: document.numbering.markers({ ...context, blocks: story.blocks }),
    cache: new WordLayoutCache(),
    paragraphFormat: paragraph => paragraphs.get(paragraph)!,
    runFormat: (paragraph, run) => (run && runs.get(run)) || defaults.get(paragraph)!,
  };
}

function decorateNotes(document: WordLayoutStories, pages: MutablePage[], measurer: WordTextMeasurer, budget: LayoutBudget): void {
  const endnotes = new Set<number>();
  for (const page of pages) {
    const footnotes = new Set<number>();
    for (const fragment of pageFragments(page)) {
      if (fragment.note?.kind === "footnote") footnotes.add(fragment.note.id);
      else if (fragment.note?.kind === "endnote") endnotes.add(fragment.note.id);
    }
    layoutPageNotes(document, page, [...footnotes].map((id) => document.notes.find((note) => note.kind === "footnote" && note.id === id)).filter((note): note is WordLayoutStories['notes'][number] => note !== undefined), measurer, budget);
  }
  const last = pages.at(-1);
  if (last !== undefined && endnotes.size > 0) {
    const stories = [...endnotes].map((id) => document.notes.find((note) => note.kind === "endnote" && note.id === id)).filter((note): note is WordLayoutStories['notes'][number] => note !== undefined);
    layoutPageNotes(document, last, stories, measurer, budget, true);
  }
}

function layoutPageNotes(document: WordLayoutStories, page: MutablePage, stories: WordLayoutStories['notes'], measurer: WordTextMeasurer, budget: LayoutBudget, append = false): void {
  if (stories.length === 0) return;
  const left = points(page.section.marginLeftTwips + page.section.gutterTwips);
  const width = Math.max(1, page.width - left - points(page.section.marginRightTwips));
  const flows = stories.map((story) => ({ story, flow: layoutStory(story.context, left + 18, Math.max(1, width - 18), measurer, budget) }));
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
  const markers = context.listMarkers;
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
    ...(table.borders ? { borders: table.borders.map(edge => ({ ...edge, x: edge.x + dx, y: edge.y + dy })) } : {}),
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

function sameItems<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function freezePage(page: MutablePage, previous?: WordLayoutPage): WordLayoutPage {
  const columns = page.columns.map((column, index): WordLayoutColumn => {
    const old = previous?.columns[index];
    if (old && old.index === column.index && old.x === column.x && old.y === column.y &&
      old.width === column.width && old.height === column.height &&
      sameItems(old.lines, column.lines) && sameItems(old.tables, column.tables) &&
      sameItems(old.unsupportedBlocks, column.unsupportedBlocks)) return old;
    return Object.freeze({ ...column, lines: Object.freeze(column.lines), tables: Object.freeze(column.tables), unsupportedBlocks: Object.freeze(column.unsupportedBlocks) });
  });
  if (previous && previous.index === page.index && previous.width === page.width &&
    previous.height === page.height && previous.section === page.section &&
    previous.noteSeparatorY === page.noteSeparatorY && sameItems(previous.columns, columns) &&
    previous.storyOverflow === page.storyOverflow &&
    JSON.stringify(previous.headerStory) === JSON.stringify(page.headerStory) && JSON.stringify(previous.footerStory) === JSON.stringify(page.footerStory) &&
    sameItems(previous.headerLines, page.headerLines) && sameItems(previous.footerLines, page.footerLines) &&
    sameItems(previous.headerTables, page.headerTables) && sameItems(previous.footerTables, page.footerTables) &&
    sameItems(previous.noteLines, page.noteLines) && sameItems(previous.noteTables, page.noteTables)) return previous;
  return Object.freeze({
    index: page.index,
    width: page.width,
    height: page.height,
    section: page.section,
    ...(page.storyOverflow ? { storyOverflow: true } : {}),
    ...(page.headerStory ? { headerStory: page.headerStory } : {}),
    ...(page.footerStory ? { footerStory: page.footerStory } : {}),
    headerLines: Object.freeze(page.headerLines),
    footerLines: Object.freeze(page.footerLines),
    headerTables: Object.freeze(page.headerTables),
    footerTables: Object.freeze(page.footerTables),
    noteLines: Object.freeze(page.noteLines),
    noteTables: Object.freeze(page.noteTables),
    noteSeparatorY: page.noteSeparatorY,
    columns: Object.freeze(columns),
  });
}

function translateLine(line: WordLayoutLine, dx: number, dy: number, cache?: WordLayoutCache): WordLayoutLine {
  if (dx === 0 && dy === 0) return line;
  const cached = cache?.translated.get(line);
  if (cached && cached.dx === dx && cached.dy === dy) return cached.value;
  const value = Object.freeze({
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
  cache?.translated.set(line, { dx, dy, value });
  return value;
}

function paragraphHeight(paragraph: PreparedParagraph): number {
  return points(paragraph.format.spacingBeforeTwips + paragraph.format.spacingAfterTwips) +
    paragraph.lines.reduce((sum, line) => sum + line.ascent + line.descent, 0);
}

function firstLineHeight(paragraph: PreparedParagraph): number {
  const first = paragraph.lines[0];
  return first === undefined ? 0 : points(paragraph.format.spacingBeforeTwips) + first.ascent + first.descent;
}

/** Measure each tab-delimited segment once. Aligned tabs position its content, not its start. */
function tabAdvance(tab: TabAtom, atoms: readonly ParagraphAtom[], index: number, currentX: number, width: number, format: ComputedWordParagraphFormat, first: boolean): number {
  const indent = points(format.indentStartTwips + (first ? format.firstLineTwips - format.hangingTwips : 0));
  const absoluteX = currentX + indent;
  const stop = tab.position ? undefined : format.tabs.find(stop => stop.alignment !== "clear" && stop.alignment !== "bar" && points(stop.positionTwips) > absoluteX);
  const alignment = tab.position?.alignment ?? stop?.alignment ?? "start";
  let target: number;
  if (tab.position) {
    const marginWidth = width + points(format.indentStartTwips + format.indentEndTwips);
    const left = tab.position.relativeTo === "margin" ? 0 : points(format.indentStartTwips);
    const right = tab.position.relativeTo === "margin" ? marginWidth : marginWidth - points(format.indentEndTwips);
    target = alignment === "center" ? (left + right) / 2 : alignment === "right" ? right : left;
  } else target = stop ? points(stop.positionTwips) : Math.ceil((absoluteX + 0.001) / DEFAULT_TAB_POINTS) * DEFAULT_TAB_POINTS;
  let following = 0;
  if (alignment !== "start" && alignment !== "left") {
    for (let next = index + 1; next < atoms.length; next++) {
      const atom = atoms[next]!;
      if (atom.kind === "tab" || atom.kind === "break") break;
      if (alignment === "decimal" && atom.kind === "glyph" && atom.text === ".") break;
      following += atomWidthValue(atom);
    }
  }
  const shift = alignment === "center" ? following / 2 : following;
  return target - absoluteX - shift;
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

/** Layout native paragraphs with already resolved styles, without an OPC package or XML. */
export function layoutWordResolvedParagraph(
  paragraph: WordParagraph,
  width: number,
  measurer: WordTextMeasurer,
  textFormat: ComputedWordTextFormat,
  format: ComputedWordParagraphFormat,
): readonly WordLayoutLine[] {
  if (!Number.isFinite(width) || width <= 0) throw new RangeError("Paragraph width must be positive.");
  const atoms = resolvedParagraphAtoms(paragraph, measurer, () => textFormat, new Map());
  const lines = breakLines(atoms, Math.max(1, width - points(format.indentStartTwips + format.indentEndTwips)), format,
    validMeasurement(measurer.measure(' ', textFormat)), false);
  const column: MutableColumn = { index: 0, x: 0, y: 0, width, height: Infinity, lines: [], tables: [], unsupportedBlocks: [] };
  const budget = { maxPages: Infinity, maxFragments: Infinity, fragments: 0 };
  let y = points(format.spacingBeforeTwips);
  return lines.map((line) => {
    const placed = placeLine(paragraph, format, line, column, y, budget, undefined);
    y += placed.height;
    return placed;
  });
}
