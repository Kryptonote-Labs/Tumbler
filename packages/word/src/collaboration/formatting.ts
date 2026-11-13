import { isWordAuthoredChart, isWordChartContent } from '../authored-chart.ts';
import { wordSectionBoundarySchema } from '../section-format.ts';
import { isSectionPropertyAttribute, isSectionPropertyValue } from './section-attributes.ts';
import { isParagraphPropertyAttribute, isParagraphPropertyValue } from './paragraph-attributes.ts';
import { isWordAuthoredInk } from "../authored-ink.ts";
import { isWordInkTraceOverrides } from "../ink-overrides.ts";
import { isShapeTextBody } from "../shape-text.ts";
import { isWordDrawingGeometry } from "../drawing-geometry.ts";
import { isWordColour } from "../theme-colours.ts";
import { isWordAuthoredShape } from "../shapes.ts";
import {
  isWordParagraphPositioning,
  isWordPositionalTab,
} from "../positioning.ts";
import { WORD_HIGHLIGHTS } from "../text-properties.ts";
import { isWordParagraphFormat } from "../paragraph-format.ts";
import { isWordAuthoredList } from "../authored-list.ts";
import { isWordHyperlink } from "../hyperlinks.ts";
import { isDocumentImage } from "./images.ts";
import { isTableCell } from "./tables.ts";
import { TEXT_FORMATS, ALIGNMENTS, type TextAttributes } from '../text-attributes.ts';
export { TEXT_FORMATS, ALIGNMENTS, type TextFormat, type Alignment, type TextAttributes } from '../text-attributes.ts';

// Word supports 1–1638 pt in half-point steps:
// https://support.microsoft.com/en-us/office/fonts/change-the-font-size
export function isFontSize(value: unknown): value is number {
  return typeof value === "number" && value >= 1 && value <= 1638 && Number.isInteger(value * 2);
}

export const isTextColor = isWordColour;

export function validateAttributes(attributes: Record<string, unknown> | undefined) {
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (TEXT_FORMATS.some((format) => format === key) && typeof value === "boolean") continue;
    if (
      (key === "wordSource" || key === "wordParagraph") &&
      Number.isSafeInteger(value) &&
      Number(value) > 0
    )
      continue;
    if (
      key === "fontFamily" &&
      typeof value === "string" &&
      value.length > 0 &&
      !/[\x00-\x1f]/.test(value)
    )
      continue;
    if (key === "wordCopy" && typeof value === "string") continue;
    if (key === "wordUnderline" && (value === "single" || value === "double")) continue;
    if (
      key === "styleId" &&
      typeof value === "string" &&
      value.length > 0 &&
      !/[\x00-\x1f]/.test(value)
    )
      continue;
    if (key === 'wordSection' && (value === null || !!value && typeof value === 'object' && Object.keys(value).length === 1 && 'remove' in value && value.remove === true || wordSectionBoundarySchema.safeParse(value).success)) continue;
    if (isSectionPropertyAttribute(key) && isSectionPropertyValue(key, value)) continue;
    if (key === "paragraph" && isWordParagraphFormat(value)) continue;
    if (isParagraphPropertyAttribute(key) && isParagraphPropertyValue(key, value)) continue;
    if (key === "positioning" && isWordParagraphPositioning(value)) continue;
    if (key === "tab" && isWordPositionalTab(value)) continue;
    if (key === "field" && (value === "PAGE" || value === "NUMPAGES")) continue;
    if (key === "image" && isDocumentImage(value)) continue;
    if (key === "table" && isTableCell(value)) continue;
    if (key === "list" && isList(value)) continue;
    if (key === "fontSize" && isFontSize(value)) continue;
    if (key === "font" && typeof value === "string" && value.length > 0) continue;
    if (key === "shading" && (value === "transparent" || isWordColour(value))) continue;
    if (key === "highlight" && typeof value === "string" && WORD_HIGHLIGHTS.includes(value))
      continue;
    if (
      key === "verticalAlign" &&
      typeof value === "string" &&
      ["baseline", "superscript", "subscript"].includes(value)
    )
      continue;
    if (
      key === "characterSpacingPoints" &&
      typeof value === "number" &&
      Number.isInteger(value * 20) &&
      value * 20 >= -2147483648 &&
      value * 20 <= 2147483647
    )
      continue;
    if (
      key === "breakType" &&
      typeof value === "string" &&
      ["line", "page", "column"].includes(value)
    )
      continue;
    if (key === "chart" && isWordAuthoredChart(value)) continue;
    if (key === "chartContent" && isWordChartContent(value)) continue;
    if (key === "chartTitleText" && isShapeTextBody(value)) continue;
    if (
      key === "chartTitle" &&
      typeof value === "string" &&
      value.isWellFormed() &&
      !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
    )
      continue;
    if (key === "ink" && isWordAuthoredInk(value)) continue;
    if (key === "inkTraces" && isWordInkTraceOverrides(value)) continue;
    if (key === "drawing" && isWordDrawingGeometry(value)) continue;
    if (key === "shape" && isWordAuthoredShape(value)) continue;
    if (key === "link" && isWordHyperlink(value)) continue;
    if (key === "color" && isTextColor(value)) continue;
    if (key === "align" && ALIGNMENTS.some((alignment) => alignment === value)) continue;
    throw new Error(`Unsupported document formatting: ${key}.`);
  }
}

export function isList(value: unknown): value is NonNullable<TextAttributes["list"]> {
  return isWordAuthoredList(value) && value.level !== undefined;
}
