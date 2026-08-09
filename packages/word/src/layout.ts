import type {
  WordBlock,
  WordBreakType,
  WordDocument,
  WordHyperlink,
  WordInline,
  WordParagraph,
  WordRun,
  WordSectionProperties,
} from "./document.ts";
import type { ComputedWordParagraphFormat, ComputedWordTextFormat, WordTabStop } from "./styles.ts";
import { WordError } from "./document.ts";
import type { WordListMarker } from "./numbering.ts";

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
}

export interface WordLayoutColumn {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly WordLayoutLine[];
  readonly unsupportedBlocks: readonly { readonly elementId: number; readonly localName: string; readonly y: number }[];
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
  readonly kind: "text" | "tab" | "drawing";
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
  readonly unsupportedBlocks: Array<{ readonly elementId: number; readonly localName: string; readonly y: number }>;
}

interface MutablePage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly section: WordSectionProperties;
  readonly columns: MutableColumn[];
}

type ParagraphAtom = GlyphAtom | TabAtom | DrawingAtom | BreakAtom;

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
  readonly ascent: number;
  readonly descent: number;
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
      if (block.kind !== "paragraph") {
        const column = page!.columns[columnIndex]!;
        column.unsupportedBlocks.push(Object.freeze({ elementId: block.elementId, localName: block.kind === "table" ? "tbl" : block.localName, y: cursorY }));
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
  return Object.freeze({
    pages: Object.freeze(pages.map(freezePage)),
    fragmentCount: budget.fragments,
  });
}

export function wordPointsToCssPixels(pointsValue: number): number {
  if (!Number.isFinite(pointsValue)) throw new TypeError("Word layout points must be finite.");
  return pointsValue * CSS_PIXELS_PER_POINT;
}

function prepareParagraph(
  document: WordDocument,
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

function prepareMarker(document: WordDocument, paragraph: WordParagraph, source: WordListMarker, measurer: WordTextMeasurer): PreparedMarker {
  const firstRun = paragraph.inlines.flatMap((inline) => inline.kind === "run" ? [inline] : inline.kind === "hyperlink" || inline.kind === "insertion" ? inline.runs : [])[0];
  const format = firstRun === undefined ? DEFAULT_MARKER_FORMAT : document.styles.runFormat(document, paragraph, firstRun);
  const text = source.text + (source.suffix === "space" ? " " : source.suffix === "tab" ? "\t" : "");
  const measurement = validMeasurement(measurer.measure(source.text, format));
  return Object.freeze({ source, text, width: measurement.width, ascent: measurement.ascent, descent: measurement.descent, format });
}

function paragraphAtoms(document: WordDocument, paragraph: WordParagraph, measurer: WordTextMeasurer): ParagraphAtom[] {
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
        const size = format.fontSizePoints;
        atoms.push(Object.freeze({
          ...controlAtom("drawing", run, content.elementId, logicalOffset, format, hyperlink),
          width: size,
          ascent: size * 0.8,
          descent: size * 0.2,
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
        text: atom.kind === "glyph" ? atom.text : atom.kind === "tab" ? "\t" : "\uFFFC",
        x: cursorX,
        y: y + line.ascent - ascent,
        width: atomWidth,
        height: ascent + descent,
        baseline: y + line.ascent,
        startOffset: atom.startOffset,
        endOffset: atom.endOffset,
        format: atom.format,
        hyperlink: atom.hyperlink,
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
    unsupportedBlocks: [],
  }));
  const page: MutablePage = { index: pages.length, width, height, section, columns };
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
    columns: Object.freeze(page.columns.map((column): WordLayoutColumn => Object.freeze({
      index: column.index,
      x: column.x,
      y: column.y,
      width: column.width,
      height: column.height,
      lines: Object.freeze(column.lines),
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

function controlAtom<K extends "tab" | "drawing" | "break">(
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
  return atom.kind === "tab" ? (atom as TabAtom & { readonly width?: number }).width ?? DEFAULT_TAB_POINTS : atom.width;
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
