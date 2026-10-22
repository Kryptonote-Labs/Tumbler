import { z } from "zod";
import {
  isWordCellFormat,
  isWordRowFormat,
  type WordCellFormat,
  type WordRowFormat,
} from "../../table-format.ts";
import { isTableCell, type TableCell } from "../tables.ts";
export type TableAddress = { story: string; table: string };
export type CellAddress = TableAddress & { row: string; column: string };
export type ConflictReason =
  | "migration"
  | "order"
  | "capacity"
  | "deleted-content"
  | "overlap"
  | "schema"
  | "legacy-writer";
export class WordTableConflict extends Error {
  constructor(
    readonly address: TableAddress,
    readonly reason: ConflictReason,
    message: string,
  ) {
    super(message);
    this.name = "WordTableConflict";
  }
}
export const id = z.string().min(1).max(200);
export const storyId = z.string().min(1).max(8192);
const axisSchema = z
  .object({
    kind: z.literal("axis"),
    dimension: z.enum(["row", "column"]),
    id,
    left: id.nullable(),
    right: id.nullable(),
    continuations: z.array(z.array(id).min(1)),
  })
  .strict();
const baseSchema = z
  .object({
    kind: z.literal("base"),
    rows: z.array(id),
    columns: z.array(id),
    cells: z.array(z.custom<TableCell>(isTableCell)),
  })
  .strict();
const removalSchema = z
  .object({
    kind: z.literal("remove"),
    dimension: z.enum(["row", "column"]),
    ids: z.array(id),
    witnesses: z.record(z.string(), z.string()),
  })
  .strict();
const removeTableSchema = z
  .object({
    kind: z.literal("remove-table"),
    witnesses: z.record(z.string(), z.string()),
  })
  .strict();
const mergeSchema = z
  .object({ kind: z.literal("merge"), row: id, columns: z.array(id) })
  .strict();
const cellFormatSchema = z
  .object({
    kind: z.literal("cell-format"),
    cell: z.string(),
    format: z.custom<WordCellFormat>(isWordCellFormat),
  })
  .strict();
const rowFormatSchema = z
  .object({
    kind: z.literal("row-format"),
    row: id,
    format: z.custom<WordRowFormat>(isWordRowFormat),
  })
  .strict();
const widthSchema = z
  .object({
    kind: z.literal("width"),
    column: id,
    value: z.number().finite().positive(),
  })
  .strict();
const splitSchema = z.object({ kind: z.literal("split"), cell: id }).strict();
export const recordSchema = z.discriminatedUnion("kind", [
  axisSchema,
  baseSchema,
  removalSchema,
  mergeSchema,
  removeTableSchema,
  cellFormatSchema,
  rowFormatSchema,
  widthSchema,
  splitSchema,
]);
export type TableRecord = z.infer<typeof recordSchema>;
export type TableBase = z.infer<typeof baseSchema>;
