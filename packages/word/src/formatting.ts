import {
  normalizeFormattingPatch,
  type FormattingAdapter,
  type FormattingCapabilities,
  type FormattingPatch,
  type FormattingState,
  type FormattingValue,
  type HorizontalAlignment,
  type OfficeColor,
  type TextUnderline,
} from "@tumblerjs/core";
import { beginLosslessXmlEdit, OOXML_NAMESPACES, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { beginPackageTransaction, openOpcPackage } from "@tumblerjs/opc";
import { openWordDocument, WordError, type WordDocument, type WordParagraph, type WordRun } from "./document.ts";
import { parseParagraphProperties, parseRunProperties, type ComputedWordTextFormat, type WordRunProperties } from "./styles.ts";
import { wordParagraphText, wordParagraphTextSegments, type WordTextSelection } from "./text.ts";

export const WORD_FORMATTING_CAPABILITIES: FormattingCapabilities = Object.freeze({
  text: Object.freeze({
    fontSize: Object.freeze({ minimum: 1, maximum: 409 }),
    fontFamily: true,
    bold: true,
    italic: true,
    underline: Object.freeze(["none", "single", "double"] as const),
    color: true,
  }),
  block: Object.freeze({
    horizontalAlignment: Object.freeze(["start", "center", "end", "justify"] as const),
    verticalAlignment: false,
  }),
});

export type WordFormattingTarget = WordTextSelection;

export interface WordFormattingDocumentAdapter extends FormattingAdapter<WordFormattingTarget, Uint8Array> {}

export function wordFormattingState(document: WordDocument, target: WordFormattingTarget): FormattingState {
  const ranges = selectedRanges(document, target);
  const formats = ranges.flatMap(({ paragraph, start, end }) => selectedRuns(document, paragraph, localSelection(paragraph, start, end), false)
    .map((run) => ({ computed: document.styles.runFormat(document, paragraph, run), direct: directRun(document, run) })));
  const paragraphs = ranges.map(({ paragraph }) => {
    const computed = document.styles.paragraphFormat(document, paragraph);
    const direct = paragraph.propertiesElementId === undefined ? {} : parseParagraphProperties(requiredElement(document, paragraph.propertiesElementId), namespace(document));
    return { computed: sharedAlignment(computed.alignment), direct: direct.alignment === undefined ? undefined : sharedAlignment(computed.alignment) };
  });
  return Object.freeze({
    text: Object.freeze({
      fontSize: state(formats, (item) => item.computed.fontSizePoints, (item) => item.direct.fontSizePoints),
      fontFamily: state(formats, (item) => item.computed.fontFamily, (item) => item.direct.fontFamily),
      bold: state(formats, (item) => item.computed.bold, (item) => item.direct.bold),
      italic: state(formats, (item) => item.computed.italic, (item) => item.direct.italic),
      underline: state(formats, (item) => item.computed.underline, (item) => item.direct.underline),
      color: state(formats, (item) => officeColor(item.computed), (item) => item.direct.color === undefined ? undefined : officeColor(item.computed), officeColorEqual),
    }),
    block: Object.freeze({
      horizontalAlignment: paragraphState(paragraphs),
      verticalAlignment: Object.freeze({ state: "unavailable" }),
    }),
  });
}

/** Applies direct run/paragraph formatting without rewriting untouched package parts. */
export function formatWordSelection(document: WordDocument, target: WordFormattingTarget, input: FormattingPatch): Uint8Array {
  const patch = normalizeFormattingPatch(input);
  if (patch.text === undefined && patch.block === undefined) return document.bytes();
  const ranges = selectedRanges(document, target);
  const editor = beginLosslessXmlEdit(document.source);

  for (const { paragraph, start, end } of ranges) {
    if (patch.block?.horizontalAlignment !== undefined) {
      formatParagraph(editor, document, paragraph, patch.block.horizontalAlignment);
    }
    if (patch.text !== undefined && Object.keys(patch.text).length > 0 && wordParagraphText(document, paragraph).length > 0) {
      for (const run of selectedRuns(document, paragraph, localSelection(paragraph, start, end))) {
        formatRun(editor, document, paragraph, run, start, end, patch.text);
      }
    }
  }
  if (!editor.hasChanges) return document.bytes();
  const edited = editor.commit();
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, edited.bytes);
  const bytes = transaction.commit();
  openWordDocument(openOpcPackage(bytes));
  return bytes;
}

function formatRun(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: WordDocument,
  paragraph: WordParagraph,
  run: WordRun,
  selectionStart: number,
  selectionEnd: number,
  patch: NonNullable<FormattingPatch["text"]>,
): void {
  const runSegments = wordParagraphTextSegments(document, paragraph).filter((segment) => segment.runElementId === run.elementId);
  if (runSegments.length === 0 || runSegments.some((segment) => segment.kind !== "text")) {
    throw new WordError("unsupported_document", "Direct text formatting currently requires ordinary text runs.");
  }
  const element = requiredElement(document, run.elementId);
  const directChildren = element.children.filter((child): child is LosslessXmlElement => child.kind === "element");
  if (directChildren.some((child) => child.namespaceUri !== namespace(document) || child.localName !== "rPr" && child.localName !== "t")) {
    throw new WordError("unsupported_document", "Direct text formatting would cross unsupported run content.");
  }
  const runStart = runSegments[0]!.start;
  const runEnd = runSegments.at(-1)!.end;
  const localStart = Math.max(0, selectionStart - runStart);
  const localEnd = Math.min(runEnd - runStart, selectionEnd - runStart);
  const text = runSegments.map((segment) => segment.value).join("");
  const collapsed = selectionStart === selectionEnd;
  const selectedStart = collapsed ? 0 : localStart;
  const selectedEnd = collapsed ? text.length : localEnd;
  if (selectedEnd <= selectedStart) return;
  const originalProperties = run.propertiesElementId === undefined ? undefined : requiredElement(document, run.propertiesElementId);
  const formattedProperties = runPropertiesMarkup(document, element.prefix, originalProperties, patch);
  const originalPropertiesMarkup = originalProperties === undefined ? "" : sourceMarkup(document, originalProperties);
  const prefix = text.slice(0, selectedStart);
  const selected = text.slice(selectedStart, selectedEnd);
  const suffix = text.slice(selectedEnd);
  const markup = `${runMarkup(element.prefix, prefix, originalPropertiesMarkup)}${runMarkup(element.prefix, selected, formattedProperties)}${runMarkup(element.prefix, suffix, originalPropertiesMarkup)}`;
  editor.replaceElementMarkup(element, markup);
}

function formatParagraph(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: WordDocument,
  paragraph: WordParagraph,
  change: NonNullable<NonNullable<FormattingPatch["block"]>["horizontalAlignment"]>,
): void {
  const paragraphElement = requiredElement(document, paragraph.elementId);
  const properties = paragraph.propertiesElementId === undefined ? undefined : requiredElement(document, paragraph.propertiesElementId);
  const child = properties?.children.find((candidate): candidate is LosslessXmlElement =>
    candidate.kind === "element" && candidate.namespaceUri === namespace(document) && candidate.localName === "jc"
  );
  if (properties !== undefined) {
    if (properties.selfClosing) {
      if ("set" in change) {
        const start = document.source.source.slice(properties.startTagSpan.start, properties.startTagSpan.end).replace(/\/\s*>$/, ">");
        editor.replaceElementMarkup(properties, `${start}<${qualified(properties.prefix, "jc")} ${qualified(properties.prefix, "val")}="${alignmentValue(change.set)}"/></${properties.qualified}>`);
      }
      return;
    }
    if (child !== undefined) editor.removeElement(child);
    if ("set" in change) editor.appendMarkup(properties, `<${qualified(properties.prefix, "jc")} ${qualified(properties.prefix, "val")}="${alignmentValue(change.set)}"/>`);
    return;
  }
  if (!("set" in change)) return;
  const markup = `<${qualified(paragraphElement.prefix, "pPr")}><${qualified(paragraphElement.prefix, "jc")} ${qualified(paragraphElement.prefix, "val")}="${alignmentValue(change.set)}"/></${qualified(paragraphElement.prefix, "pPr")}>`;
  const firstChild = paragraphElement.children.find((candidate): candidate is LosslessXmlElement => candidate.kind === "element");
  if (paragraphElement.selfClosing) {
    const start = document.source.source.slice(paragraphElement.startTagSpan.start, paragraphElement.startTagSpan.end).replace(/\/\s*>$/, ">");
    editor.replaceElementMarkup(paragraphElement, `${start}${markup}</${paragraphElement.qualified}>`);
  } else if (firstChild === undefined) editor.appendMarkup(paragraphElement, markup);
  else editor.insertMarkupBefore(firstChild, markup);
}

function runPropertiesMarkup(
  document: WordDocument,
  prefix: string,
  properties: LosslessXmlElement | undefined,
  patch: NonNullable<FormattingPatch["text"]>,
): string {
  const names = new Set<string>();
  if (patch.fontFamily !== undefined) names.add("rFonts");
  if (patch.fontSize !== undefined) names.add("sz");
  if (patch.bold !== undefined) names.add("b");
  if (patch.italic !== undefined) names.add("i");
  if (patch.underline !== undefined) names.add("u");
  if (patch.color !== undefined) names.add("color");
  const retained = properties?.children.filter((child): child is LosslessXmlElement => child.kind === "element")
    .filter((child) => child.namespaceUri !== namespace(document) || !names.has(child.localName))
    .map((child) => sourceMarkup(document, child)).join("") ?? "";
  const additions = [
    property(prefix, "rFonts", patch.fontFamily, (value) => `${qualified(prefix, "ascii")}="${escapeAttribute(value)}" ${qualified(prefix, "hAnsi")}="${escapeAttribute(value)}"`),
    property(prefix, "sz", patch.fontSize, (value) => `${qualified(prefix, "val")}="${Math.round(value * 2)}"`),
    property(prefix, "b", patch.bold, (value) => `${qualified(prefix, "val")}="${value ? "1" : "0"}"`),
    property(prefix, "i", patch.italic, (value) => `${qualified(prefix, "val")}="${value ? "1" : "0"}"`),
    property(prefix, "u", patch.underline, (value) => `${qualified(prefix, "val")}="${value}"`),
    property(prefix, "color", patch.color, (value) => `${qualified(prefix, "val")}="${value.type === "automatic" ? "auto" : value.value.slice(1)}"`),
  ].join("");
  if (retained.length === 0 && additions.length === 0) return "";
  const start = properties === undefined
    ? `<${qualified(prefix, "rPr")}>`
    : document.source.source.slice(properties.startTagSpan.start, properties.startTagSpan.end).replace(/\/\s*>$/, ">");
  return `${start}${retained}${additions}</${qualified(prefix, "rPr")}>`;
}

function property<T>(prefix: string, name: string, change: { readonly set: T } | { readonly inherit: true } | undefined, attrs: (value: T) => string): string {
  return change === undefined || "inherit" in change ? "" : `<${qualified(prefix, name)} ${attrs(change.set)}/>`;
}

function documentParagraphs(document: WordDocument): WordParagraph[] {
  const result: WordParagraph[] = [];
  const visit = (blocks: readonly import("./document.ts").WordBlock[]): void => {
    for (const block of blocks) {
      if (block.kind === "paragraph") result.push(block);
      if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) {
        visit(cell.blocks);
      }
    }
  };
  visit(document.blocks);
  return result;
}

function selectedRanges(document: WordDocument, target: WordFormattingTarget): readonly { readonly paragraph: WordParagraph; readonly start: number; readonly end: number }[] {
  const paragraphs = documentParagraphs(document);
  const anchorIndex = paragraphs.findIndex((paragraph) => paragraph.elementId === target.anchor.paragraphElementId);
  const focusIndex = paragraphs.findIndex((paragraph) => paragraph.elementId === target.focus.paragraphElementId);
  if (anchorIndex < 0 || focusIndex < 0) throw new WordError("invalid_document", "A selected Word paragraph does not exist.");
  const forward = anchorIndex < focusIndex || anchorIndex === focusIndex && target.anchor.offset <= target.focus.offset;
  const firstIndex = forward ? anchorIndex : focusIndex;
  const lastIndex = forward ? focusIndex : anchorIndex;
  const firstOffset = forward ? target.anchor.offset : target.focus.offset;
  const lastOffset = forward ? target.focus.offset : target.anchor.offset;
  return Object.freeze(paragraphs.slice(firstIndex, lastIndex + 1).map((paragraph, localIndex) => {
    const length = wordParagraphText(document, paragraph).length;
    const start = localIndex === 0 ? firstOffset : 0;
    const end = localIndex === lastIndex - firstIndex ? lastOffset : length;
    validateRange(wordParagraphText(document, paragraph), start, end);
    return Object.freeze({ paragraph, start, end });
  }));
}

function localSelection(paragraph: WordParagraph, start: number, end: number): WordTextSelection {
  return { anchor: { paragraphElementId: paragraph.elementId, offset: start }, focus: { paragraphElementId: paragraph.elementId, offset: end } };
}

function selectedRuns(document: WordDocument, paragraph: WordParagraph, target: WordFormattingTarget, required = true): readonly WordRun[] {
  const start = Math.min(target.anchor.offset, target.focus.offset);
  const end = Math.max(target.anchor.offset, target.focus.offset);
  validateRange(wordParagraphText(document, paragraph), start, end);
  const segments = wordParagraphTextSegments(document, paragraph);
  const selected = start === end
    ? [segments.find((segment) => start > segment.start && start < segment.end) ?? segments.findLast((segment) => segment.end <= start) ?? segments[0]].filter((segment) => segment !== undefined)
    : segments.filter((segment) => segment.end > start && segment.start < end);
  const ids = new Set(selected.map((segment) => segment.runElementId));
  const runs: WordRun[] = [];
  const add = (run: WordRun) => { if (ids.has(run.elementId)) runs.push(run); };
  for (const inline of paragraph.inlines) {
    if (inline.kind === "run") add(inline);
    else if (inline.kind === "hyperlink" || inline.kind === "insertion") inline.runs.forEach(add);
  }
  if (required && runs.length === 0) throw new WordError("unsupported_document", "The selection has no format-capable text run.");
  return Object.freeze(runs);
}

function state<T, D>(items: readonly { computed: ComputedWordTextFormat; direct: WordRunProperties }[], computed: (item: { computed: ComputedWordTextFormat; direct: WordRunProperties }) => T, direct: (item: { computed: ComputedWordTextFormat; direct: WordRunProperties }) => D | undefined, equals: (left: T, right: T) => boolean = Object.is): FormattingValue<T> {
  const first = items[0];
  if (first === undefined) return Object.freeze({ state: "unavailable" });
  const value = computed(first);
  if (items.some((item) => !equals(value, computed(item)))) return Object.freeze({ state: "mixed" });
  return items.every((item) => direct(item) === undefined)
    ? Object.freeze({ state: "inherited", value })
    : Object.freeze({ state: "value", value });
}

function paragraphState(items: readonly { readonly computed: HorizontalAlignment; readonly direct: HorizontalAlignment | undefined }[]): FormattingValue<HorizontalAlignment> {
  const first = items[0];
  if (first === undefined) return Object.freeze({ state: "unavailable" });
  if (items.some((item) => item.computed !== first.computed)) return Object.freeze({ state: "mixed" });
  return items.every((item) => item.direct === undefined)
    ? Object.freeze({ state: "inherited", value: first.computed })
    : Object.freeze({ state: "value", value: first.computed });
}

function directRun(document: WordDocument, run: WordRun): WordRunProperties {
  return run.propertiesElementId === undefined ? {} : parseRunProperties(requiredElement(document, run.propertiesElementId), namespace(document));
}

function officeColor(format: ComputedWordTextFormat): OfficeColor { return { type: "rgb", value: format.color }; }
function officeColorEqual(left: OfficeColor, right: OfficeColor): boolean { return left.type === right.type && (left.type === "automatic" || right.type === "automatic" || left.value === right.value); }
function sharedAlignment(value: "start" | "center" | "end" | "justify" | "distribute"): HorizontalAlignment { return value === "distribute" ? "justify" : value; }
function alignmentValue(value: HorizontalAlignment): string { return value === "start" ? "left" : value === "end" ? "right" : value === "justify" ? "both" : "center"; }
function namespace(document: WordDocument): string { return OOXML_NAMESPACES[document.conformance].wordprocessing; }
function requiredElement(document: WordDocument, id: number): LosslessXmlElement { const element = document.source.element(id); if (element === undefined) throw new WordError("invalid_document", `Source element ${id} is missing.`); return element; }
function sourceMarkup(document: WordDocument, element: LosslessXmlElement): string { return document.source.source.slice(element.span.start, element.span.end); }
function qualified(prefix: string, local: string): string { return prefix.length === 0 ? local : `${prefix}:${local}`; }
function runMarkup(prefix: string, value: string, properties: string): string { return value.length === 0 ? "" : `<${qualified(prefix, "r")}>${properties}<${qualified(prefix, "t")} xml:space="preserve">${escapeText(value)}</${qualified(prefix, "t")}></${qualified(prefix, "r")}>`; }
function escapeText(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("]]>", "]]&gt;"); }
function escapeAttribute(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"); }
function validateRange(text: string, start: number, end: number): void { if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length) throw new RangeError("A Word formatting range is outside its paragraph."); }
