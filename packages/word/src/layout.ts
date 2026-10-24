import { reflowPreparedTable } from './table-reflow.ts';
import { numberWordLayout } from './line-numbering.ts';
import { balanceWordColumns, type WordColumnLimits } from './column-balance.ts';
import { wordSectionColumns, sameWordColumns } from './section-columns.ts';
import { widowGroupHeight, keepHeightUntil } from './paragraph-pagination.ts';
import { withParagraphSpacing } from './paragraph-spacing.ts';
import { createFieldVisibility } from './field-visibility.ts';
import { alignWordPageDrawings } from './drawing-alignment.ts';
import { resolveWordColour } from './theme-colours.ts';
import { splitPreparedTable, joinPreparedTables, preparedBlockHeight } from './table-pagination.ts';
import { tableBorderInsets, resolveTableBorders, type WordLayoutTableBorder } from './table-borders.ts';
import type { WordCellBorders } from './table-format.ts';
import type {
  WordBlock,
  WordPositionalTab,
  WordBreakType,
  WordDocument,
  WordHyperlink,
  WordParagraph,
  WordRun,
  WordSectionProperties,
  WordTable,
  WordHeaderFooterStory,
  WordNoteStory,
} from "./document.ts";
import type { ComputedWordParagraphFormat, ComputedWordTextFormat, WordTabStop } from "./styles.ts";
import { WordError } from "./document.ts";
import { WordMarkerBudget, type WordMarkerOptions, type WordNumbering, type WordListMarker } from "./numbering.ts";
import { resolveWordTableGrid, type ResolvedWordTableCell } from "./table-grid.ts";
import type { WordDrawing } from "./drawings.ts";

import { hasPageFields, type WordPageField } from './page-fields.ts';

import { validMeasurement, createPreparation, consumePreparation, measurementIdentity, type PreparationBudget } from './layout-preparation.ts';

const TWIPS_PER_POINT = 20;
const CSS_PIXELS_PER_POINT = 4 / 3;
const DEFAULT_TAB_POINTS = 36;

export interface WordTextMeasurement {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
}

export interface WordTextMeasurer {
  /** Measures shaped text in points, including characterSpacingPoints per grapheme in the advance width. */
  measure(text: string, format: ComputedWordTextFormat): WordTextMeasurement;
}

export interface WordLayoutOptions {
  /** Cumulative derived marker UTF-16 units across body and stories, including suffixes. */
  readonly maxMarkerCharacters?: number;
  readonly maxPages?: number;
  readonly maxFragments?: number;
  /** Maximum UTF-16 text units visited while preparing layout. */
  readonly maxCharacters?: number;
  /** Maximum glyph/control atoms prepared, including unpainted whitespace. */
  readonly maxAtoms?: number;
  /** Maximum calls to the supplied text measurer. */
  readonly maxMeasurements?: number;
  /** Stop after this many complete pages, for previews. Unlike maxPages, longer documents are not an error. */
  readonly pageLimit?: number;
}

export interface WordLayout {
  /** Resolved solid page colour shared by every page, including its margins. */
  readonly background?: string;
  readonly pages: readonly WordLayoutPage[];
  readonly fragmentCount: number;
  /** Set when pageLimit stopped layout before the end of the document. */
  readonly truncated?: true;
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
  readonly section?: WordSectionProperties;
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
  readonly lineNumber?: WordLayoutMarker;
  readonly paragraphDecoration?: { readonly x: number; readonly width: number; readonly shading?: string; readonly borders?: import('./table-format.ts').WordCellBorders };
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
  /** Additional advance in points for an isolated justified ordinary space. */
  readonly wordSpacing?: number;
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
  readonly preparation?: PreparationBudget;
}

interface MutableColumn {
  readonly section?: WordSectionProperties;
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
  readonly lineNumberFormat?: ComputedWordTextFormat;
  readonly background?: string | undefined;
  /** OOXML compatibility setting; absent/false lets trailing spaces hang past the margin. */
  readonly wrapTrailSpaces?: boolean;
  /** Suppress justification on lines ending with an explicit line break. */
  readonly doNotExpandShiftReturn?: boolean;
  readonly blocks: readonly WordBlock[];
  readonly drawings: ReadonlyMap<number, WordDrawing>;
  readonly finalSection: WordSectionProperties;
  readonly listMarkers: ReadonlyMap<number, WordListMarker>;
  paragraphFormat(paragraph: WordParagraph): ComputedWordParagraphFormat;
  runFormat(paragraph: WordParagraph, run: WordRun | undefined): ComputedWordTextFormat;
  readonly cache?: WordLayoutCache | undefined;
}
export type WordLayoutDocumentContext = Pick<WordLayoutSource, "blocks" | "drawings" | "paragraphFormat" | "runFormat" | "cache" | "listMarkers" | "wrapTrailSpaces" | "doNotExpandShiftReturn"> & { readonly pageFields?: Readonly<Record<WordPageField, number>> };

export interface WordLayoutStories {
  readonly evenAndOddHeaders?: boolean;
  readonly bindings?: readonly { section: number; kind: "header" | "footer"; type: "default" | "first" | "even"; relationshipId: string }[];
  readonly headerFooters: readonly (Pick<WordHeaderFooterStory, 'kind' | 'type' | 'relationshipId'> & { readonly context: WordLayoutDocumentContext })[];
  readonly notes: readonly (Pick<WordNoteStory, 'kind' | 'id' | 'type'> & { readonly context: WordLayoutDocumentContext })[];
}

const storySources = new WeakMap<WordDocument, WeakMap<WordNumbering, Map<WordHeaderFooterStory | WordNoteStory, WordLayoutDocumentContext>>>();
/** Compile retained story styles once; replacement stories bypass original marker work. */
export function wordLayoutStories(
  document: WordDocument,
  options: WordMarkerOptions & { readonly headerFooterOverrides?: ReadonlyMap<string, WordLayoutDocumentContext>; readonly numbering?: WordNumbering } = {},
  budget = new WordMarkerBudget(options.maxCharacters),
): WordLayoutStories {
  const numbering = options.numbering ?? document.numbering;
  const variants = storySources.get(document) ?? new WeakMap<WordNumbering, Map<WordHeaderFooterStory | WordNoteStory, WordLayoutDocumentContext>>();
  storySources.set(document, variants);
  const cached = variants.get(numbering) ?? new Map<WordHeaderFooterStory | WordNoteStory, WordLayoutDocumentContext>();
  variants.set(numbering, cached);
  const context = (story: WordHeaderFooterStory | WordNoteStory, replacement?: WordLayoutDocumentContext) => {
    const existing = replacement ?? cached.get(story);
    if (existing) {
      accountMarkers(existing.listMarkers, budget);
      return existing;
    }
    const compiled = compileStory(document, story, budget, numbering);
    cached.set(story, compiled);
    return compiled;
  };
  return {
    evenAndOddHeaders: document.evenAndOddHeaders,
    headerFooters: document.headerFooters.map(story => ({ kind: story.kind, type: story.type, relationshipId: story.relationshipId, context: context(story, options.headerFooterOverrides?.get(story.part.name.value)) })),
    notes: document.notes.map(story => ({ kind: story.kind, type: story.type, id: story.id, context: context(story) })),
  };
}

/** Prepared geometry belongs to immutable blocks and the font measurer that produced it. */
export class WordLayoutCache {
  pages: readonly WordLayoutPage[] = [];
  readonly translated = new WeakMap<WordLayoutLine, { dx: number; dy: number; value: WordLayoutLine }>();
  readonly lines = new WeakMap<PreparedLine, { marker: PreparedMarker | undefined; value: WordLayoutLine }>();
  readonly paragraphs = new WeakMap<WordParagraph, { width: number; marker: string; measurer: WordTextMeasurer; wrapTrailSpaces: boolean; doNotExpandShiftReturn: boolean; value: PreparedParagraph }>();
  readonly tables = new WeakMap<WordTable, {
    width: number;
    wrapTrailSpaces: boolean;
    doNotExpandShiftReturn: boolean;
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
  readonly baselineShift?: number;
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

export interface PreparedParagraph {
  /** Own before-spacing, excluding the previous paragraph, for a fresh flow boundary. */
  readonly spacingBeforeAtStartTwips?: number;
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

export interface PreparedTable {
  readonly table: WordTable;
  readonly xOffset: number;
  readonly width: number;
  readonly columnOffsets: readonly number[];
  readonly rowHeights: readonly number[];
  readonly sourceRows: readonly number[];
  readonly cells: readonly PreparedTableCell[];
  readonly cellsByRow: readonly (readonly PreparedTableCell[])[];
}

export interface PreparedTableCell {
  readonly resolved: ResolvedWordTableCell;
  readonly width: number;
  readonly contentHeight: number;
  readonly blocks: readonly (PreparedParagraph | PreparedTable)[];
  readonly margins: { readonly top: number; readonly end: number; readonly bottom: number; readonly start: number };
  readonly verticalAlignment: "top" | "center" | "bottom";
}

interface PreparedLine {
  readonly justify: boolean;
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
  const markerBudget = new WordMarkerBudget(options.maxMarkerCharacters);
  return layoutWordSource({
    background: document.background === undefined ? undefined : resolveWordColour(document.background, document.styles.themeColors),
    lineNumberFormat: document.styles.resolveStyledRun('Normal', 'LineNumber'),
    blocks: document.blocks, drawings: document.drawings, finalSection: document.finalSection, wrapTrailSpaces: document.wrapTrailSpaces, doNotExpandShiftReturn: document.doNotExpandShiftReturn,
    listMarkers: document.numbering.markers(document, {}, markerBudget),
    paragraphFormat: paragraph => document.styles.paragraphFormat(document, paragraph),
    runFormat: (paragraph, run) => document.styles.runFormat(document, paragraph, run),
  }, measurer, options, wordLayoutStories(document, {}, markerBudget));
}

/** Shared pagination for package-backed and native document models. */
export function layoutWordSource(
  document: WordLayoutSource,
  measurer: WordTextMeasurer,
  options: WordLayoutOptions = {},
  stories?: WordLayoutStories,
): WordLayout {
  const iterator = layoutWordSourceProgressively(document, measurer, options, stories, false);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

/** Yield completed pages without restarting pagination; the return value is the final layout.
 * Intermediate layouts are provisional, including total-page fields and notes. */
export function* layoutWordSourceProgressively(
  document: WordLayoutSource,
  measurer: WordTextMeasurer,
  options: WordLayoutOptions = {},
  stories?: WordLayoutStories,
  emitProgress = true,
): Generator<WordLayout, WordLayout, void> {
  const markerBudget = new WordMarkerBudget(options.maxMarkerCharacters);
  accountMarkers(document.listMarkers, markerBudget);
  for (const story of [...stories?.headerFooters ?? [], ...stories?.notes ?? []]) accountMarkers(story.context.listMarkers, markerBudget);
  const needsTotal = stories?.headerFooters.some(story => hasPageFields(story.context.blocks, 'NUMPAGES'));
  let total = 1;
  const seen = new Set<number>();
  while (true) {
    const initial = yield* layoutWordSourcePass(document, measurer, options, stories, total, emitProgress);
    const layout = balanceWordColumns(initial, limits => {
      const pass = layoutWordSourcePass(document, measurer, options, stories, total, false, limits);
      let step = pass.next();
      while (!step.done) step = pass.next();
      return step.value;
    }, id => {
      const paragraph = document.blocks.find(block => block.kind === 'paragraph' && block.elementId === id);
      return paragraph?.kind === 'paragraph' ? document.paragraphFormat(paragraph) : undefined;
    }, new Set(documentSections(document.blocks, document.finalSection).flatMap((section, index, all) => {
      // ECMA-376 §17.18.77: a continuous break balances the preceding section.
      // documentSections omits an empty final section after a trailing boundary.
      const following = all[index + 1]?.properties ?? (section.properties !== document.finalSection ? document.finalSection : undefined);
      return following?.breakType !== 'continuous' ? [section.properties] : [];
    })));

    if (!needsTotal || layout.truncated || layout.pages.length === total) return layout;
    if (seen.has(layout.pages.length)) throw new WordError('invalid_document', 'Page count fields did not reach a stable layout.');
    seen.add(total);
    total = layout.pages.length;
  }
}

function* layoutWordSourcePass(document: WordLayoutSource, measurer: WordTextMeasurer, options: WordLayoutOptions, stories: WordLayoutStories | undefined, totalPages: number, emitProgress: boolean, columnLimits?: WordColumnLimits): Generator<WordLayout, WordLayout, void> {
  if (document.cache) document.cache.layoutRevision += 1;
  const prepared = createPreparation(measurer, options);
  const preparation = prepared.budget;
  measurer = prepared.measurer;
  const budget: LayoutBudget = {
    cache: document.cache,
    preparation,
    maxPages: limit(options.maxPages, 10_000, "page"),
    maxFragments: limit(options.maxFragments, 1_000_000, "fragment"),
    fragments: 0,
  };
  const pages: MutablePage[] = [];
  const pageLimit = options.pageLimit === undefined ? undefined : limit(options.pageLimit, budget.maxPages, "page");
  let truncated = false;
  const sections = documentSections(document.blocks, document.finalSection);
  const completed: WordLayoutPage[] = [];
  function* progress(): Generator<WordLayout, void, void> {
    // Keep the current page mutable for widow control, tables and continuous sections.
    if (!emitProgress || pages.length - 1 <= completed.length) return;
    while (completed.length < pages.length - 1) {
      const page = pages[completed.length]!;
      // Notes are placed at completion and may alter these arrays. Snapshot them.
      const copy = { ...page, columns: page.columns.map(column => ({ ...column,
        lines: [...column.lines], tables: [...column.tables], unsupportedBlocks: [...column.unsupportedBlocks],
      })), headerLines: [...page.headerLines], footerLines: [...page.footerLines],
        headerTables: [...page.headerTables], footerTables: [...page.footerTables],
        noteLines: [...page.noteLines], noteTables: [...page.noteTables] };
      completed.push(alignWordPageDrawings(freezePage(copy)));
    }
    yield numberWordLayout(Object.freeze({ ...(document.background === undefined ? {} : { background: document.background }),
      pages: Object.freeze([...completed]), fragmentCount: budget.fragments, truncated: true as const }), document, measurer);
  }
  const listMarkers = document.listMarkers;
  let page: MutablePage | undefined;
  let columnIndex = 0;
  let cursorY = 0;

  const bodyBottoms = new WeakMap<MutablePage, number>();
  const sectionPageCounts = new Map<WordSectionProperties, number>();
  const appendPage = (section: WordSectionProperties) => {
    // Earlier pages can still change until the next one starts, so the limit allows one page more.
    if (pageLimit !== undefined && pages.length > pageLimit) throw TRUNCATED;
    const created = createPage(section, pages, budget);
    const index = sectionPageCounts.get(section) ?? 0;
    sectionPageCounts.set(section, index + 1);
    if (stories) {
      decorateHeaderFooters(stories, [created], measurer, budget, sections, new Map([[section, index]]), totalPages);
      const headerBottom = created.headerTables.reduce((bottom, table) => Math.max(bottom, table.y + table.height),
        created.headerLines.reduce((bottom, line) => Math.max(bottom, line.y + line.height), points(section.marginTopTwips)));
      const footerTop = created.footerTables.reduce((top, table) => Math.min(top, table.y),
        created.footerLines.reduce((top, line) => Math.min(top, line.y), created.height - points(section.marginBottomTwips)));
      // A repeated story that fills the page cannot be resolved by adding identical pages.
      // Keep body content within its section margins and expose the collision to the host.
      // This is a layout fallback, not an authoring limit: all story content remains in the model/export.
      if (footerTop <= headerBottom) created.storyOverflow = true;
      else for (const [columnIndex, column] of created.columns.entries()) created.columns[columnIndex] = { ...column, y: headerBottom, height: Math.max(1, Math.min(column.y + column.height, footerTop) - headerBottom) };
    }
    bodyBottoms.set(created, Math.min(...created.columns.map(column => column.y + column.height)));
    const limit = columnLimits?.get(section);
    if (limit?.page === created.index) for (const [index, column] of created.columns.entries()) created.columns[index] = { ...column, height: Math.min(column.height, limit.height) };
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
    if (page === undefined || columnIndex + 1 >= page.columns.length) {
      addPage(section);
      return;
    }
    columnIndex += 1;
    cursorY = page.columns[columnIndex]!.y;
  };

  // A continuous section with matching geometry does not interrupt paragraph adjacency.
  const keepBoundaries = new Set<number>();
  let boundaryOffset = 0;
  for (const [index, section] of sections.entries()) {
    const previous = sections[index - 1]?.properties;
    if (!previous || section.properties.breakType !== "continuous" || !samePageGeometry(previous, section.properties) ||
      !sameWordColumns(previous, section.properties)) {
      keepBoundaries.add(boundaryOffset);
    }
    boundaryOffset += section.blocks.length;
  }
  // Retain bounded lookahead across compatible sections; never reconsider each chain suffix.
  const pending = new Map<number, { width: number; prepared: ReturnType<typeof prepareParagraphFlow> }>();
  const prepareBody = (index: number): ReturnType<typeof prepareParagraphFlow> | undefined => {
    const block = document.blocks[index];
    if (block?.kind !== "paragraph") return undefined;
    const cached = pending.get(index);
    const width = page!.columns[columnIndex]!.width;
    if (cached?.width === width) return cached.prepared;
    const prepared = withParagraphSpacing(prepareParagraphFlow(document, block, width, measurer, listMarkers.get(block.elementId), preparation), document.blocks, index, paragraph => document.paragraphFormat(paragraph));
    pending.set(index, { width, prepared });
    return prepared;
  };
  let inKeepChain = false;
  let sectionBlockOffset = 0;
  try {
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const section = sections[sectionIndex]!;
      const isFirst = page === undefined;
      if (isFirst) addPage(section.properties);
      else if (section.properties.breakType === "nextColumn" && samePageGeometry(page!.section, section.properties) &&
        sameWordColumns(page!.columns[columnIndex]!.section ?? page!.section, section.properties)) {
        advanceColumn(section.properties);
      }
      else if (section.properties.breakType === "continuous" && samePageGeometry(page!.section, section.properties)) {
        const current = page!;
        const active = current.columns[columnIndex]!;
        const previous = active.section ?? current.section;
        if (!sameWordColumns(previous, section.properties) || previous.columnCount > 1 || section.properties.columnCount > 1) {
          const top = Math.max(cursorY, ...current.columns.filter(column => column.y === active.y)
            .flatMap(column => [...column.lines.map(line => line.y + line.height), ...column.tables.map(table => table.y + table.height)]));
          const bottom = Math.min(current.height - points(section.properties.marginBottomTwips), bodyBottoms.get(current)!);
          if (top >= bottom) addPage(section.properties);
          else {
            for (let i = 0; i < current.columns.length; i++) {
              const column = current.columns[i]!;
              if (column.y === active.y) current.columns[i] = { ...column, height: Math.max(0, top - column.y) };
            }
            columnIndex = current.columns.length;
            current.columns.push(...wordSectionColumns(section.properties).map((column, i) => ({
              section: section.properties, index: columnIndex + i, x: column.x, y: top, width: column.width, height: Math.min(bottom - top, columnLimits?.get(section.properties)?.page === current.index ? columnLimits.get(section.properties)!.height : Infinity),
              lines: [], tables: [], unsupportedBlocks: [],
            })));
            cursorY = top;
          }
        }
      } else addPage(section.properties, section.properties.breakType === "evenPage" ? "even" : section.properties.breakType === "oddPage" ? "odd" : undefined);

      if (keepBoundaries.has(sectionBlockOffset)) {
        pending.clear();
        inKeepChain = false;
      }
      for (let blockIndex = 0; blockIndex < section.blocks.length; blockIndex += 1) {
        const block = section.blocks[blockIndex]!;
        if (block.kind === "table") {
          inKeepChain = false;
          let target = page!.columns[columnIndex]!;
          let preparedWidth = target.width;
          let preparedTable = prepareTable(document, block, preparedWidth, measurer, listMarkers, preparation);
          const groups = tableRowGroups(preparedTable);
          const headerRows = leadingHeaderRows(preparedTable);
          let groupIndex = 0;
          let continuation: PreparedTable | undefined;
          while (groupIndex < groups.length) {
            target = page!.columns[columnIndex]!;
            if (target.width !== preparedWidth) {
              preparedWidth = target.width;
              preparedTable = prepareTable(document, block, preparedWidth, measurer, listMarkers, preparation);
              if (continuation) continuation = reflowPreparedTable(continuation, preparedTable,
                (paragraph, width, offset) => {
                  const flow = prepareParagraphFlow(document, paragraph, width, measurer, listMarkers.get(paragraph.elementId), preparation, offset);
                  return { ...flow, lines: Object.freeze([...flow.lines]) };
                },
                (table, width) => prepareTable(document, table, width, measurer, listMarkers, preparation));
            }
            const atTop = cursorY === target.y;
            const repeated = groupIndex > 0 || continuation ? headerRows : [];
            const parts: PreparedTable[] = [];
            let used = 0;
            // An oversized header must not consume every continuation page.
            const headerHeight = rowSetHeight(preparedTable, repeated);
            if (repeated.length && headerHeight < target.height) {
              parts.push(slicePreparedTable(preparedTable, repeated, document.cache));
              used = headerHeight;
            }
            const headerParts = parts.length;
            while (groupIndex < groups.length) {
              const group = groups[groupIndex]!;
              const remaining = continuation ?? slicePreparedTable(preparedTable, group, document.cache);
              const height = preparedBlockHeight(remaining);
              const available = target.y + target.height - cursorY - used;
              if (height <= available) {
                parts.push(remaining);
                used += height;
                continuation = undefined;
                groupIndex += 1;
                continue;
              }
              // ISO/IEC 29500-1 §17.4.6: cantSplit moves a row to a fresh page,
              // but even that row must flow across pages when it exceeds a full page.
              const keepRow = !continuation && group.some(row => block.rows[row]!.cantSplit || block.rows[row]!.heightRule === "exact");
              const fresh = atTop && parts.length === headerParts;
              const naturalHeight = bodyBottoms.get(page!)! - page!.columns[0]!.y - used;
              // A balancing candidate cannot make a fitting protected row oversized.
              if (keepRow && (!fresh || height <= naturalHeight && height > available)) break;
              const split = splitPreparedTable(remaining, available, fresh);
              if (!split) break;
              parts.push(split.head);
              used += preparedBlockHeight(split.head);
              continuation = split.tail;
              if (!continuation) groupIndex += 1;
              break;
            }
            if (parts.length > headerParts) {
              const slice = joinPreparedTables(parts);
              target.tables.push(placeTable(slice, target.x, cursorY, budget));
              cursorY += used;
            }
            if (groupIndex < groups.length) advanceColumn(section.properties);
            yield* progress();
          }
          continue;
        }
        if (block.kind !== "paragraph") {
          inKeepChain = false;
          const column = page!.columns[columnIndex]!;
          column.unsupportedBlocks.push(Object.freeze({ elementId: block.elementId, localName: block.localName, y: cursorY }));
          continue;
        }
        const bodyIndex = sectionBlockOffset + blockIndex;
        let prepared = prepareBody(bodyIndex)!;
        const currentColumn = page!.columns[columnIndex]!;
        const available = currentColumn.y + currentColumn.height - cursorY;
        let requiredHeight = 0;
        const successor = keepBoundaries.has(bodyIndex + 1) ? undefined : document.blocks[bodyIndex + 1];
        const chainStart = prepared.format.keepNext && successor?.kind === "paragraph" &&
          !document.paragraphFormat(successor).pageBreakBefore && (!inKeepChain || prepared.format.pageBreakBefore);
        if (chainStart || prepared.format.keepLines) {
          let candidate: ReturnType<typeof prepareParagraphFlow> | undefined = prepared;
          let index = bodyIndex;
          while (candidate) {
            const before = points(candidate.format.spacingBeforeTwips);
            const measured = keepHeightUntil(candidate.lines, currentColumn.height - requiredHeight - before);
            requiredHeight += before + measured.height + (measured.explicitBreak ? 0 : points(candidate.format.spacingAfterTwips));
            if (measured.explicitBreak || requiredHeight > currentColumn.height || !chainStart || !candidate.format.keepNext) break;
            const next = keepBoundaries.has(index + 1) ? undefined : document.blocks[index + 1];
            if (next?.kind !== "paragraph" || document.paragraphFormat(next).pageBreakBefore) break;
            candidate = prepareBody(++index);
          }
        }
        const forcedPage = prepared.format.pageBreakBefore && page!.columns.some(column => column.lines.length || column.tables.length);
        if (forcedPage || requiredHeight > available && cursorY > currentColumn.y) {
          if (forcedPage) addPage(section.properties);
          else advanceColumn(section.properties);
          if (page!.columns[columnIndex]!.width !== currentColumn.width) {
            pending.clear();
            prepared = prepareBody(bodyIndex)!;
          }
        }
        let sequence = prepared.lines;
        inKeepChain = prepared.format.keepNext;
        pending.delete(bodyIndex);
        // A previous paragraph's after-spacing belongs to the old column. At a fresh
        // boundary retain only this paragraph's authored before-spacing.
        const before = cursorY === page!.columns[columnIndex]!.y
          ? document.paragraphFormat(block).spacingBeforeTwips : prepared.format.spacingBeforeTwips;
        cursorY += points(before);
        for (let lineIndex = 0; ; lineIndex += 1) {
          let line = prepared.lines.get(lineIndex);
          if (!line) break;
          let column = page!.columns[columnIndex]!;
          const lineHeight = line.ascent + line.descent;
          const pairHeight = prepared.format.widowControl ? widowGroupHeight(sequence, lineIndex, column.height) : 0;
          const required = pairHeight <= column.height ? Math.max(lineHeight, pairHeight) : lineHeight;
          if (cursorY + required > column.y + column.height &&
            (column.lines.length > 0 || column.tables.length > 0 || column.unsupportedBlocks.length > 0)) {
            const width = column.width;
            advanceColumn(section.properties);
            column = page!.columns[columnIndex]!;
            if (column.width !== width) {
              prepared = prepareParagraphFlow(document, block, column.width, measurer, listMarkers.get(block.elementId), preparation, line.startOffset);
              sequence = prepared.lines;
              lineIndex = 0;
              line = sequence.get(0);
              if (!line) break;
            }
          }
          const laidOut = placeLine(block, prepared.format, line, column, cursorY, budget, line.startOffset === 0 ? prepared.marker : undefined);
          column.lines.push(laidOut);
          cursorY += laidOut.height;
          const width = column.width;
          if (line.breakAfter === "page") addPage(section.properties);
          else if (line.breakAfter === "column") advanceColumn(section.properties);
          if (page!.columns[columnIndex]!.width !== width) {
            prepared = prepareParagraphFlow(document, block, page!.columns[columnIndex]!.width, measurer, listMarkers.get(block.elementId), preparation, line.endOffset + 1);
            sequence = prepared.lines;
            lineIndex = -1;
          }
          yield* progress();
        }
        cursorY += points(prepared.format.spacingAfterTwips);
      }
      sectionBlockOffset += section.blocks.length;
    }
  } catch (error) {
    if (error !== TRUNCATED) throw error;
    truncated = true;
  }
  if (pageLimit !== undefined && pages.length > pageLimit) {
    pages.length = pageLimit;
    truncated = true;
  }
  if (stories) {
    decorateNotes(stories, pages, measurer, budget);
  }
  const frozenPages = Object.freeze(pages.map((page, index) => alignWordPageDrawings(freezePage(page, document.cache?.pages[index]))));
  if (document.cache) document.cache.pages = frozenPages;
  return numberWordLayout(Object.freeze({
    ...(document.background === undefined ? {} : { background: document.background }),
    pages: frozenPages,
    fragmentCount: budget.fragments,
    ...(truncated ? { truncated: true as const } : {}),
  }), document, measurer);
}

const TRUNCATED = Symbol("truncated");

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
  preparation?: PreparationBudget,
): PreparedTable {
  const wrapTrailSpaces = document.wrapTrailSpaces ?? false;
  const doNotExpandShiftReturn = document.doNotExpandShiftReturn ?? false;
  const cached = document.cache?.tables.get(table);
  if (cached && cached.width === availableWidth && cached.measurer === measurementIdentity(measurer) && cached.wrapTrailSpaces === wrapTrailSpaces && cached.doNotExpandShiftReturn === doNotExpandShiftReturn &&
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
  const gridCells = grid.rows.flatMap(row => row.cells);
  const borderInsets = tableBorderInsets(gridCells.map(cell => ({
    x: cell.column, y: cell.row, width: cell.columnSpan, height: cell.rowSpan,
    borders: cell.source.borders ?? {},
  })), { x: 0, y: 0, width: grid.columnCount, height: grid.rows.length }, table.properties.borders);
  for (const [index, cell] of gridCells.entries()) {
    const inset = borderInsets[index]!;
    const cellWidth = columnOffsets[cell.column + cell.columnSpan]! - columnOffsets[cell.column]!;
    const sourceMargins = cell.source.margins ?? table.properties.cellMargins;
    const margins = Object.freeze({ top: points(sourceMargins.topTwips) + inset.top, end: points(sourceMargins.endTwips), bottom: points(sourceMargins.bottomTwips) + inset.bottom, start: points(sourceMargins.startTwips) });
    const innerWidth = Math.max(1, cellWidth - margins.start - margins.end);
    const blocks = cell.source.blocks.flatMap((block, index): (PreparedParagraph | PreparedTable)[] =>
      block.kind === "paragraph" ? [withParagraphSpacing(prepareParagraph(document, block, innerWidth, measurer, listMarkers.get(block.elementId), preparation), cell.source.blocks, index, paragraph => document.paragraphFormat(paragraph))]
        : block.kind === "table" ? [prepareTable(document, block, innerWidth, measurer, listMarkers, preparation)] : []);
    const contentHeight = blocks.reduce((sum, block) => sum + preparedBlockHeight(block), 0) + margins.top + margins.bottom;
    preparedCells.push(Object.freeze({ resolved: cell, width: cellWidth, contentHeight, blocks: Object.freeze(blocks), margins, verticalAlignment: cell.source.verticalAlignment }));
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
  const value = Object.freeze({ table, xOffset, width, columnOffsets: Object.freeze(columnOffsets), rowHeights: Object.freeze(rowHeights), sourceRows: Object.freeze(rowHeights.map((_, index) => index)), cells: Object.freeze(preparedCells), cellsByRow: Object.freeze(cellsByRow.map(row => Object.freeze(row))) });
  if (document.cache) {
    const markers: [number, string][] = [];
    const collect = (blocks: readonly WordBlock[]) => {
      for (const block of blocks) {
        if (block.kind === "paragraph") markers.push([block.elementId, JSON.stringify(listMarkers.get(block.elementId) ?? null)]);
        else if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) collect(cell.blocks);
      }
    };
    for (const row of table.rows) for (const cell of row.cells) collect(cell.blocks);
    document.cache.tables.set(table, { width: availableWidth, measurer: measurementIdentity(measurer), markers, wrapTrailSpaces, doNotExpandShiftReturn, value });
  }
  return value;
}

function leadingHeaderRows(prepared: PreparedTable): readonly number[] {
  const rows: number[] = [];
  for (let index = 0; index < prepared.table.rows.length && prepared.table.rows[index]!.repeatHeader; index += 1) rows.push(index);
  return Object.freeze(rows);
}

/** Keep vertically merged cells together while preparing row groups for pagination. */
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
    sourceRows: Object.freeze(rows.map(row => prepared.sourceRows[row]!)),
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
    const textHeight = cell.blocks.reduce((sum, block) => sum + preparedBlockHeight(block), 0);
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
    for (const block of cell.blocks) {
      if ('paragraph' in block) {
        cursor += points(block.format.spacingBeforeTwips);
        for (let index = 0; index < block.lines.length; index += 1) {
          const laidOut = placeLine(block.paragraph, block.format, block.lines[index]!, fake, cursor, budget, index === 0 ? block.marker : undefined);
          fake.lines.push(laidOut);
          cursor += laidOut.height;
        }
        cursor += points(block.format.spacingAfterTwips);
      } else {
        const table = placeTable(block, fake.x, cursor, budget);
        fake.tables.push(table);
        cursor += table.height;
      }
    }
    return Object.freeze({
      borders: cell.resolved.source.borders ?? {},
      ...(cell.resolved.source.shading ?? prepared.table.properties.shading ? { shading: resolveWordColour(cell.resolved.source.shading ?? prepared.table.properties.shading!) } : {}),
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
  document: WordLayoutDocumentContext, paragraph: WordParagraph, columnWidth: number,
  measurer: WordTextMeasurer, markerSource?: WordListMarker, preparation?: PreparationBudget,
): PreparedParagraph {
  const flow = prepareParagraphFlow(document, paragraph, columnWidth, measurer, markerSource, preparation);
  return Object.freeze({ ...flow, lines: Object.freeze([...flow.lines]) });
}

/** Bounded lookahead shared by body pagination and keep/widow policies. */
class PreparedLineSequence implements Iterable<PreparedLine> {
  private readonly values: PreparedLine[] = [];
  private done = false;
  constructor(private readonly iterator: Iterator<PreparedLine>, private readonly completed?: (lines: readonly PreparedLine[]) => void) {}
  get(index: number): PreparedLine | undefined {
    while (!this.done && this.values.length <= index) {
      const next = this.iterator.next();
      if (next.done) {
        this.done = true;
        this.completed?.(Object.freeze(this.values));
      } else this.values.push(next.value);
    }
    return this.values[index];
  }
  heightUntil(maxHeight: number): number {
    let height = 0;
    for (const line of this) {
      height += line.ascent + line.descent;
      if (height > maxHeight) break;
    }
    return height;
  }
  *[Symbol.iterator](): Generator<PreparedLine> {
    for (let index = 0; ; index++) {
      const line = this.get(index);
      if (!line) return;
      yield line;
    }
  }
}

function prepareParagraphFlow(
  document: WordLayoutDocumentContext,
  paragraph: WordParagraph,
  columnWidth: number,
  measurer: WordTextMeasurer,
  markerSource?: WordListMarker,
  preparation?: PreparationBudget,
  startOffset = 0,
) {
  const wrapTrailSpaces = document.wrapTrailSpaces ?? false;
  const doNotExpandShiftReturn = document.doNotExpandShiftReturn ?? false;
  const markerKey = JSON.stringify(markerSource);
  const cached = startOffset === 0 ? document.cache?.paragraphs.get(paragraph) : undefined;
  if (cached && cached.width === columnWidth && cached.marker === markerKey && cached.measurer === measurementIdentity(measurer) && cached.wrapTrailSpaces === wrapTrailSpaces && cached.doNotExpandShiftReturn === doNotExpandShiftReturn) return { ...cached.value, lines: new PreparedLineSequence(cached.value.lines.values()) };
  if (document.cache) document.cache.measuredParagraphs++;
  const computed = document.paragraphFormat(paragraph);
  const format = markerSource === undefined ? computed : Object.freeze({
    ...computed,
    indentStartTwips: computed.indentStartTwips !== 0 ? computed.indentStartTwips : markerSource.indentStartTwips ?? 720,
    hangingTwips: computed.hangingTwips !== 0 ? computed.hangingTwips : markerSource.hangingTwips ?? 360,
  });
  const width = Math.max(1, columnWidth - points(format.indentStartTwips + format.indentEndTwips));
  let preceding: ParagraphAtom | undefined;
  function* suffix() {
    for (const atom of paragraphAtoms(document, paragraph, measurer, preparation)) {
      if (atom.startOffset >= startOffset) yield atom;
      else preceding = atom;
    }
  }
  const atoms = suffix();
  const first = atoms.next();
  const emptyRun = first.done ? paragraph.inlines.find(inline => inline.kind === 'run') : undefined;
  function* remainingAtoms() { if (!first.done) yield first.value; yield* atoms; }
  const mark = validMeasurement(measurer.measure(' ', document.runFormat(paragraph, emptyRun)));
  // List hanging indents position the marker, not the first line of text.
  const textFormat = markerSource || startOffset > 0 ? { ...format, firstLineTwips: 0, hangingTwips: 0 } : format;
  const terminalLine = preceding?.kind === "break" && preceding.breakType === "line" && preceding.endOffset === startOffset;
  const iterator = startOffset > 0 && first.done && !terminalLine ? [][Symbol.iterator]() : breakLines(remainingAtoms(), width, textFormat, mark, wrapTrailSpaces, doNotExpandShiftReturn, startOffset);
  const marker = markerSource === undefined ? undefined : prepareMarker(document, paragraph, markerSource, measurer, preparation);
  const lines = new PreparedLineSequence(iterator, completed => {
    const value = Object.freeze({ paragraph, format, lines: completed, marker });
    if (startOffset === 0) document.cache?.paragraphs.set(paragraph, { width: columnWidth, marker: markerKey, measurer: measurementIdentity(measurer), wrapTrailSpaces, doNotExpandShiftReturn, value });
  });
  return { paragraph, format, lines, marker };
}

function prepareMarker(document: WordLayoutDocumentContext, paragraph: WordParagraph, source: WordListMarker, measurer: WordTextMeasurer, preparation?: PreparationBudget): PreparedMarker {
  consumePreparation(preparation, 'characters', source.text.length);
  let firstRun: WordRun | undefined;
  for (const inline of paragraph.inlines) {
    firstRun = inline.kind === 'run' ? inline : inline.kind === 'hyperlink' || inline.kind === 'insertion' ? inline.runs[0] : undefined;
    if (firstRun) break;
  }
  const format = document.runFormat(paragraph, firstRun);
  const text = source.text + (source.suffix === "space" ? " " : source.suffix === "tab" ? "\t" : "");
  const measurement = validMeasurement(measurer.measure(source.text, format));
  return Object.freeze({ source, text, width: measurement.width, ascent: measurement.ascent, descent: measurement.descent, format });
}

function paragraphAtoms(document: WordLayoutDocumentContext, paragraph: WordParagraph, measurer: WordTextMeasurer, preparation?: PreparationBudget) {
  return resolvedParagraphAtoms(paragraph, measurer, (run) => document.runFormat(paragraph, run), document.drawings, document.pageFields, preparation);
}

function* resolvedParagraphAtoms(
  paragraph: WordParagraph,
  measurer: WordTextMeasurer,
  resolveFormat: (run: WordRun) => ComputedWordTextFormat,
  drawings: ReadonlyMap<number, WordDrawing>,
  pageFields?: Readonly<Record<WordPageField, number>>,
  preparation?: PreparationBudget,
): Generator<ParagraphAtom> {
  let logicalOffset = 0;
  const visible = createFieldVisibility();
  function* addRun(run: WordRun, hyperlink: string | undefined): Generator<ParagraphAtom> {
    const sourceFormat = resolveFormat(run);
    const shifted = sourceFormat.verticalAlign === "superscript" || sourceFormat.verticalAlign === "subscript";
    const baselineShift = sourceFormat.verticalAlign === "superscript" ? -sourceFormat.fontSizePoints * 0.3
      : sourceFormat.verticalAlign === "subscript" ? sourceFormat.fontSizePoints * 0.15 : 0;
    const format = shifted ? Object.freeze({ ...sourceFormat, fontSizePoints: sourceFormat.fontSizePoints * 0.65 }) : sourceFormat;
    const measure = (text: string) => {
      const value = validMeasurement(measurer.measure(text, format));
      return { ...value, ascent: value.ascent - baselineShift, descent: value.descent + baselineShift };
    };
    for (const content of run.contents) {
      if (content.kind !== 'text') consumePreparation(preparation, 'characters');
      if (!visible(content)) continue;
      if (content.kind !== 'text') consumePreparation(preparation, 'atoms');
      if (content.kind === 'page-field') {
        const text = String(pageFields?.[content.field] ?? 1);
        const measurement = measure(text);
        yield Object.freeze({ kind: 'glyph', field: content.field, runElementId: run.elementId,
          contentElementId: content.elementId, text, ...measurement, baselineShift, breakAfter: false, whitespace: false,
          startOffset: logicalOffset, endOffset: ++logicalOffset, format, hyperlink });
      } else if (content.kind === "symbol") {
        const symbolFormat = content.unicodeFallback ? format : Object.freeze({ ...format, fontFamily: content.fontFamily });
        const measurement = validMeasurement(measurer.measure(content.value, symbolFormat));
        const startOffset = logicalOffset;
        logicalOffset += content.value.length;
        yield Object.freeze({ kind: 'glyph', runElementId: run.elementId, contentElementId: content.elementId,
          text: content.value, width: measurement.width, ascent: measurement.ascent - baselineShift, descent: measurement.descent + baselineShift,
          baselineShift, breakAfter: false, whitespace: false, startOffset, endOffset: logicalOffset, format: symbolFormat, hyperlink });
      } else if (content.kind === "text") {
        for (const grapheme of graphemes(content.value, preparation)) {
          consumePreparation(preparation, 'atoms');
          const measurement = measure(grapheme);
          const startOffset = logicalOffset;
          logicalOffset += grapheme.length;
          yield Object.freeze({
            kind: "glyph",
            runElementId: run.elementId,
            contentElementId: content.elementId,
            text: grapheme,
            width: measurement.width,
            ascent: measurement.ascent,
            descent: measurement.descent,
            baselineShift,
            breakAfter: isBreakOpportunity(grapheme),
            whitespace: isBreakableSpace(grapheme),
            startOffset,
            endOffset: logicalOffset,
            format,
            hyperlink,
          });
        }
      } else if (content.kind === "tab") {
        yield { ...controlAtom("tab", run, content.elementId, logicalOffset, format, hyperlink), ...(content.position ? { position: content.position } : {}) };
        logicalOffset += 1;
      } else if (content.kind === "break") {
        yield Object.freeze({
          ...controlAtom("break", run, content.elementId, logicalOffset, format, hyperlink),
          breakType: content.breakType,
        });
        logicalOffset += 1;
      } else if (content.kind === "drawing") {
        const drawing = drawings.get(content.elementId);
        const width = drawing?.widthPoints ?? format.fontSizePoints;
        const height = drawing?.heightPoints ?? format.fontSizePoints;
        const anchored = drawing?.placement === "anchor";
        const flows = !anchored || drawing.anchor?.wrap !== "none" && drawing.anchor?.behindDocument !== true;
        yield Object.freeze({
          ...controlAtom("drawing", run, content.elementId, logicalOffset, format, hyperlink),
          width,
          flowWidth: flows ? width : 0,
          ascent: flows ? height : 0,
          descent: 0,
          drawing,
        });
        logicalOffset += 1;
      } else if (content.kind === "footnote-reference" || content.kind === "endnote-reference") {
        const noteFormat = Object.freeze({ ...sourceFormat, fontSizePoints: sourceFormat.fontSizePoints * 0.65, verticalAlign: "superscript" as const });
        const noteShift = -sourceFormat.fontSizePoints * 0.3;
        const text = String(Math.max(1, content.id));
        const measurement = validMeasurement(measurer.measure(text, noteFormat));
        yield Object.freeze({
          ...controlAtom("note", run, content.elementId, logicalOffset, noteFormat, hyperlink),
          text,
          width: measurement.width,
          ascent: measurement.ascent - noteShift,
          descent: measurement.descent + noteShift,
          baselineShift: noteShift,
          noteKind: content.kind === "footnote-reference" ? "footnote" : "endnote",
          noteId: content.id,
        });
        logicalOffset += 1;
      }
    }
  };
  for (const inline of paragraph.inlines) {
    if (inline.kind === 'run') yield* addRun(inline, undefined);
    else if (inline.kind === 'hyperlink' || inline.kind === 'insertion') {
      for (const run of inline.runs) yield* addRun(run, inline.kind === 'hyperlink' ? hyperlinkTarget(inline) : undefined);
    }
  }
}

function* breakLines(source: Iterable<ParagraphAtom>, width: number, format: ComputedWordParagraphFormat, mark: WordTextMeasurement, wrapTrailSpaces: boolean, doNotExpandShiftReturn = false, startOffset = 0): Generator<PreparedLine> {
  let lineCount = 0;
  let terminalLineBreak = false;
  const iterator: Iterator<ParagraphAtom, void> = source[Symbol.iterator]();
  let pending: ParagraphAtom[] = [];
  let pendingIndex = 0;
  const take = (): ParagraphAtom | undefined => {
    if (pendingIndex < pending.length) return pending[pendingIndex++];
    pending = [];
    pendingIndex = 0;
    const next = iterator.next();
    return next.done ? undefined : next.value;
  };
  function* following(): Generator<ParagraphAtom> {
    for (let index = pendingIndex; ; index++) {
      let atom = pending[index];
      if (!atom) {
        const next = iterator.next();
        if (next.done) return;
        atom = next.value;
        pending.push(atom);
      }
      yield atom;
      if (atom.kind === 'tab' || atom.kind === 'break') return;
    }
  }

  let line: Exclude<ParagraphAtom, BreakAtom>[] = [];
  let lineWidth = 0;
  let lastBreak = -1;
  let offset = startOffset;
  const push = (breakAfter?: WordBreakType, justify = false): PreparedLine => {
    const logicalStart = line[0]?.startOffset ?? offset;
    const logicalEnd = line.at(-1)?.endOffset ?? offset;
    // Include trailing whitespace and the paragraph mark in vertical metrics even when unpainted.
    const naturalAscent = line.reduce((maximum, atom) => Math.max(maximum, atomAscent(atom)), mark.ascent);
    const naturalDescent = line.reduce((maximum, atom) => Math.max(maximum, atomDescent(atom)), mark.descent);
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
    const prepared = Object.freeze({
      justify,
      atoms: Object.freeze(line),
      startOffset: logicalStart,
      endOffset: logicalEnd,
      width: Math.max(0, lineWidth),
      ascent,
      descent,
      breakAfter,
    });
    offset = logicalEnd;
    line = [];
    lineWidth = 0;
    lastBreak = -1;
    lineCount++;
    return prepared;
  };
  for (let atom = take(); atom; atom = take()) {
    terminalLineBreak = atom.kind === "break" && atom.breakType === "line";
    if (atom.kind === "break") {
      yield push(atom.breakType, atom.breakType === "line" && !doNotExpandShiftReturn);
      offset = atom.endOffset;
      continue;
    }
    let atomWidth = atom.kind === "tab" ? tabAdvance(atom, following, lineWidth, width, format, lineCount === 0) : atom.width;
    if (atom.kind === "tab" && atom.position && atomWidth < 0 && line.length) {
      yield push(undefined, true);
      atomWidth = tabAdvance(atom, following, 0, width, format, false);
    }
    atomWidth = Math.max(0, atomWidth);
    let materialized = atom.kind === "tab" ? Object.freeze({ ...atom, width: atomWidth }) : atom;
    // ISO/IEC 29500 wrapTrailSpaces: ordinary trailing spaces hang by default.
    // Keep their logical offsets; push() removes only their painted advance.
    const hangingSpace = !wrapTrailSpaces && materialized.kind === "glyph" && materialized.text === " ";
    if (!hangingSpace && line.length > 0 && lineWidth + atomWidthValue(materialized) > Math.max(1, width - (lineCount === 0 ? points(format.firstLineTwips - format.hangingTwips) : 0))) {
      if (lastBreak >= 0) {
        const carry = line.splice(lastBreak + 1);
        lineWidth = line.reduce((sum, item) => sum + atomWidthValue(item), 0);
        yield push(undefined, true);
        line = carry;
        lineWidth = line.reduce((sum, item) => sum + atomWidthValue(item), 0);
      } else yield push(undefined, true);
      if (atom.kind === "tab") materialized = Object.freeze({ ...atom, width: Math.max(0, tabAdvance(atom, following, lineWidth, width, format, lineCount === 0)) });
    }
    line.push(materialized);
    lineWidth += atomWidthValue(materialized);
    if (materialized.kind === "glyph" && materialized.breakAfter) lastBreak = line.length - 1;
  }
  if (line.length > 0 || lineCount === 0 || terminalLineBreak) yield push();

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
  // Stretch only ordinary spaces between words, after the final tab stop.
  const gaps = new Set<ParagraphAtom>();
  if (format.alignment === 'justify' && line.justify && available > line.width) {
    let hasWord = false;
    for (const atom of line.atoms) {
      if (atom.kind === 'tab') { gaps.clear(); hasWord = false; }
      else if (atom.kind === 'glyph' && atom.text === ' ') { if (hasWord) gaps.add(atom); }
      else hasWord = true;
    }
  }
  const wordSpacing = gaps.size ? (available - line.width) / gaps.size : 0;
  const fragments: WordLayoutFragment[] = [];
  let cursorX = x;
  for (const atom of line.atoms) {
    const previous = fragments.at(-1);
    const expanded = gaps.has(atom);
    const atomWidth = atomWidthValue(atom) + (expanded ? wordSpacing : 0);
    const canMerge = !expanded && !previous?.wordSpacing && atom.kind === "glyph" && previous?.kind === "text" &&
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
        ...(expanded ? { wordSpacing } : {}),
        ...(atom.kind === "glyph" && atom.field ? { field: atom.field } : {}),
        runElementId: atom.runElementId,
        contentElementId: atom.contentElementId,
        text: atom.kind === "glyph" || atom.kind === "note" ? atom.text : atom.kind === "tab" ? "\t" : "\uFFFC",
        x: atom.kind === "drawing" && atom.drawing?.placement === "anchor" ? (atom.drawing.anchor?.horizontalRelativeTo === "page" ? 0 : column.x) + (atom.drawing.anchor?.horizontalOffsetPoints ?? cursorX - column.x) : cursorX,
        y: atom.kind === "drawing" && atom.drawing?.placement === "anchor" ? (atom.drawing.anchor?.verticalRelativeTo === "page" ? 0 : atom.drawing.anchor?.verticalRelativeTo === "paragraph" ? column.lines.find(item => item.paragraphElementId === paragraph.elementId)?.y ?? y : y) + (atom.drawing.anchor?.verticalOffsetPoints ?? 0) : y + line.ascent - ascent,
        width: atom.kind === "drawing" ? atom.width : atomWidth,
        height: atom.kind === "drawing" ? atom.drawing?.heightPoints ?? ascent + descent : ascent + descent,
        baseline: y + line.ascent + (atom.baselineShift ?? 0),
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
    ...((format.shading || format.borders) ? { paragraphDecoration: { x: column.x + points(format.indentStartTwips), width: Math.max(0, column.width - points(format.indentStartTwips + format.indentEndTwips)), ...(format.shading ? { shading: format.shading } : {}), ...(format.borders ? { borders: format.borders } : {}) } } : {}),
    x,
    y,
    width: wordSpacing ? available : line.width,
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
            wrapTrailSpaces: source.wrapTrailSpaces ?? false, doNotExpandShiftReturn: source.doNotExpandShiftReturn ?? false,
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

function compileStory(document: WordDocument, story: WordHeaderFooterStory | WordNoteStory, budget: WordMarkerBudget, numbering: WordNumbering): WordLayoutDocumentContext {
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
    wrapTrailSpaces: document.wrapTrailSpaces, doNotExpandShiftReturn: document.doNotExpandShiftReturn,
    drawings: story.drawings, blocks: story.blocks, listMarkers: numbering.markers({ ...context, blocks: story.blocks }, {}, budget),
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

/** Lays out a complete auxiliary story without imposing page boundaries on its text. */
export function layoutWordStory(
  context: WordLayoutDocumentContext,
  width: number,
  measurer: WordTextMeasurer,
  options: Pick<WordLayoutOptions, 'maxFragments' | 'maxCharacters' | 'maxAtoms' | 'maxMeasurements'> = {},
) {
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('Story width must be positive.');
  const prepared = createPreparation(measurer, options);
  return layoutStory(context, 0, width, prepared.measurer, {
    preparation: prepared.budget,
    cache: context.cache,
    maxPages: 1,
    maxFragments: limit(options.maxFragments, 1_000_000, 'fragment'),
    fragments: 0,
  });
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
  for (const [blockIndex, block] of context.blocks.entries()) {
    if (block.kind === "paragraph") {
      const paragraph = withParagraphSpacing(prepareParagraph(context, block, width, measurer, markers.get(block.elementId), budget.preparation), context.blocks, blockIndex, paragraph => context.paragraphFormat(paragraph));
      cursor += points(paragraph.format.spacingBeforeTwips);
      for (let index = 0; index < paragraph.lines.length; index += 1) {
        const line = placeLine(block, paragraph.format, paragraph.lines[index]!, column, cursor, budget, index === 0 ? paragraph.marker : undefined);
        column.lines.push(line);
        cursor += line.height;
      }
      cursor += points(paragraph.format.spacingAfterTwips);
    } else if (block.kind === "table") {
      const table = prepareTable(context, block, width, measurer, markers, budget.preparation);
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

function createPage(section: WordSectionProperties, pages: MutablePage[], budget: LayoutBudget, limits?: WordColumnLimits): MutablePage {
  if (pages.length >= budget.maxPages) throw new WordError("limit_exceeded", `Layout exceeds ${budget.maxPages} pages.`);
  const width = points(section.pageWidthTwips);
  const height = points(section.pageHeightTwips);
  const left = points(section.marginLeftTwips + section.gutterTwips);
  const top = points(section.marginTopTwips);
  const bodyWidth = Math.max(1, width - left - points(section.marginRightTwips));
  const bodyHeight = Math.min(Math.max(1, height - top - points(section.marginBottomTwips)), limits?.get(section)?.page === pages.length ? limits.get(section)!.height : Infinity);
  const columns: MutableColumn[] = wordSectionColumns(section).map((column, index) => ({
    section, index, x: column.x, y: top, width: column.width, height: bodyHeight,
    lines: [], tables: [], unsupportedBlocks: [],
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
      old.width === column.width && old.height === column.height && old.section === column.section &&
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
    ...(line.paragraphDecoration ? { paragraphDecoration: { ...line.paragraphDecoration, x: line.paragraphDecoration.x + dx } } : {}),
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

/** Measure each tab-delimited segment once. Aligned tabs position its content, not its start. */
function tabAdvance(tab: TabAtom, followingAtoms: () => Iterable<ParagraphAtom>, currentX: number, width: number, format: ComputedWordParagraphFormat, first: boolean): number {
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
    for (const atom of followingAtoms()) {
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


function* graphemes(value: string, preparation?: PreparationBudget): Generator<string> {
  const Segmenter = Intl.Segmenter;
  if (Segmenter === undefined) {
    for (const character of value) {
      consumePreparation(preparation, 'characters', character.length);
      yield character;
    }
  } else {
    for (const item of new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) {
      consumePreparation(preparation, 'characters', item.segment.length);
      yield item.segment;
    }
  }
}

// GL spaces and the word-joining BOM are neither wrap opportunities nor trimmed advances.
function isBreakableSpace(value: string): boolean {
  return /^[\t\n\r \u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+$/u.test(value);
}

function isBreakOpportunity(value: string): boolean {
  return isBreakableSpace(value) || value === "-" || value === "\u2010" || value === "\u2013" || value === "\u200B";
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
  options: Pick<WordLayoutOptions, 'maxFragments' | 'maxCharacters' | 'maxAtoms' | 'maxMeasurements'> = {},
): readonly WordLayoutLine[] {
  if (!Number.isFinite(width) || width <= 0) throw new RangeError("Paragraph width must be positive.");
  const prepared = createPreparation(measurer, options);
  measurer = prepared.measurer;
  const atoms = resolvedParagraphAtoms(paragraph, measurer, () => textFormat, new Map(), undefined, prepared.budget);
  const lines = [...breakLines(atoms, Math.max(1, width - points(format.indentStartTwips + format.indentEndTwips)), format,
    validMeasurement(measurer.measure(' ', textFormat)), false)];
  const column: MutableColumn = { index: 0, x: 0, y: 0, width, height: Infinity, lines: [], tables: [], unsupportedBlocks: [] };
  const budget = { maxPages: Infinity, maxFragments: limit(options.maxFragments, 1_000_000, "fragment"), fragments: 0 };
  let y = points(format.spacingBeforeTwips);
  return lines.map((line) => {
    const placed = placeLine(paragraph, format, line, column, y, budget, undefined);
    y += placed.height;
    return placed;
  });
}

/** Cached marker maps still count against each layout request's resource budget. */
function accountMarkers(markers: ReadonlyMap<number, WordListMarker>, budget: WordMarkerBudget): void {
  for (const marker of markers.values()) budget.consume(marker.text.length + (marker.suffix === 'nothing' ? 0 : 1));
}
