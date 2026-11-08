import { normalizeFormattingPatch, type FormattingPatch, type OfficeColor } from "@tumblerjs/core";
import { THEME_COLOR_SLOTS } from "@tumblerjs/ooxml";
import type { OpcPackage } from "@tumblerjs/opc";
import { z } from "zod";
import type { SpreadsheetArtifact } from "./artifact.ts";
import { SPREADSHEET_BORDER_PRESETS, SPREADSHEET_BORDER_STYLES, setSpreadsheetBordersPackage } from "./borders.ts";
import { clearSpreadsheetFormattingPackage, formatSpreadsheetCellsPackage } from "./formatting.ts";
import {
  adjustSpreadsheetNumberDecimalsPackage,
  formatSpreadsheetNumbersPackage,
  SPREADSHEET_NUMBER_FORMAT_PRESETS,
  type SpreadsheetNumberFormatPreset,
} from "./number-format-authoring.ts";
import type { SpreadsheetSheet } from "./workbook.ts";

const sheetId = z.string().min(1);
const range = z.string().min(1);
const inherit = z.object({ inherit: z.literal(true) }).strict().meta({ id: "InheritFormatting", description: "Return the property to the workbook Normal style." });
const change = <T extends z.ZodType>(type: T) => z.union([z.object({ set: type }).strict(), inherit]);
const rgb = z.string().regex(/^#[a-f\d]{6}$/i);
const color = z.discriminatedUnion("type", [
  z.object({ type: z.literal("automatic") }).strict(),
  z.object({ type: z.literal("rgb"), value: rgb }).strict(),
  z.object({ type: z.literal("theme"), slot: z.enum(THEME_COLOR_SLOTS), tint: z.number().min(-1).max(1).exactOptional(), value: rgb.exactOptional() }).strict(),
]).meta({ id: "OfficeColor", description: "Theme colours keep slot and tint (-1 darker to 1 lighter); value is an optional #RRGGBB fallback." }) satisfies z.ZodType<OfficeColor>;

/** Validates the shared formatting patch, including spreadsheet cell properties. */
export const spreadsheetFormattingPatch = z.object({
  text: z.object({
    fontSize: change(z.number().min(1).max(409)).exactOptional(),
    fontFamily: change(z.string().min(1).max(255)).exactOptional(),
    bold: change(z.boolean()).exactOptional(),
    italic: change(z.boolean()).exactOptional(),
    underline: change(z.enum(["none", "single", "double"])).exactOptional(),
    strike: change(z.boolean()).exactOptional(),
    color: change(color).exactOptional(),
  }).strict().exactOptional(),
  block: z.object({
    horizontalAlignment: change(z.enum(["start", "center", "end", "justify"])).exactOptional(),
    verticalAlignment: change(z.enum(["top", "center", "bottom"])).exactOptional(),
  }).strict().exactOptional(),
  cell: z.object({
    fill: change(z.discriminatedUnion("type", [
      z.object({ type: z.literal("none") }).strict(),
      z.object({ type: z.literal("solid"), color }).strict(),
    ])).exactOptional(),
    wrapText: change(z.boolean()).exactOptional(),
    textRotation: change(z.union([z.number().int().min(-90).max(90), z.literal("vertical")])).exactOptional(),
    indent: change(z.number().int().min(0).max(250)).exactOptional(),
  }).strict().exactOptional(),
}).strict().transform((value): FormattingPatch => normalizeFormattingPatch(value));

const presets = Object.keys(SPREADSHEET_NUMBER_FORMAT_PRESETS) as [SpreadsheetNumberFormatPreset, ...SpreadsheetNumberFormatPreset[]];

export const spreadsheetFormattingCommand = z.discriminatedUnion("name", [
  z.object({ name: z.literal("format-cells"), sheetId, range, patch: spreadsheetFormattingPatch }).strict(),
  z.object({
    name: z.literal("set-number-format"),
    sheetId,
    range,
    /** A preset (`date` is the legacy alias of `short-date`) or `{ code }` for an explicit Excel format code. */
    format: z.union([z.enum([...presets, "date"]), z.object({ code: z.string().min(1).max(255) }).strict()]),
  }).strict(),
  z.object({ name: z.literal("adjust-number-decimals"), sheetId, range, direction: z.enum(["increase", "decrease"]) }).strict(),
  z.object({
    name: z.literal("set-borders"),
    sheetId,
    range,
    preset: z.enum(SPREADSHEET_BORDER_PRESETS),
    style: z.enum(SPREADSHEET_BORDER_STYLES).exactOptional(),
    color: color.exactOptional(),
  }).strict(),
  z.object({ name: z.literal("clear-formatting"), sheetId, range }).strict(),
]);
export type SpreadsheetFormattingCommand = z.infer<typeof spreadsheetFormattingCommand>;

/** Applies a validated formatting command to one worksheet. */
export function spreadsheetFormattingCommandPackage(artifact: SpreadsheetArtifact, sheet: SpreadsheetSheet, command: SpreadsheetFormattingCommand): OpcPackage {
  const workbook = artifact.workbook;
  switch (command.name) {
    case "format-cells": return formatSpreadsheetCellsPackage(workbook, sheet, command.range, command.patch);
    case "set-number-format": return formatSpreadsheetNumbersPackage(workbook, sheet, command.range, command.format);
    case "adjust-number-decimals": return adjustSpreadsheetNumberDecimalsPackage(workbook, sheet, command.range, command.direction);
    case "set-borders": {
      const { name: _name, sheetId: _sheet, range: target, ...options } = command;
      return setSpreadsheetBordersPackage(workbook, sheet, target, options);
    }
    case "clear-formatting": return clearSpreadsheetFormattingPackage(workbook, sheet, command.range);
  }
}
