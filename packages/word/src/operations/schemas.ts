import { z } from "zod";
import { TEXT_FORMATS, isFontSize } from "../collaboration/formatting.ts";
import { isWordColour } from "../theme-colours.ts";
import { WORD_HIGHLIGHTS } from "../text-properties.ts";
import { isWordParagraphFormat } from "../paragraph-format.ts";
import { isWordCellFormat, isWordRowFormat } from "../table-format.ts";
import { isWordAuthoredShape } from "../shapes.ts";
import { isDocumentImage } from "../collaboration/images.ts";
import { isWordHyperlink } from "../hyperlinks.ts";

const toggles = Object.fromEntries(
  TEXT_FORMATS.map((key) => [key, z.boolean().nullable().optional()]),
) as {
  [K in (typeof TEXT_FORMATS)[number]]: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
};
export const characterFormat = z
  .object({
    ...toggles,
    font: z.string().min(1).nullable().optional(),
    fontFamily: z.string().min(1).nullable().optional(),
    fontSize: z.number().refine(isFontSize).nullable().optional(),
    color: z.custom<import("../theme-colours.ts").WordColour>(isWordColour).nullable().optional(),
    wordUnderline: z.enum(["single", "double"]).nullable().optional(),
    highlight: z
      .string()
      .refine((value) => WORD_HIGHLIGHTS.includes(value))
      .nullable()
      .optional(),
    shading: z.custom<import("../theme-colours.ts").WordColour>(isWordColour).nullable().optional(),
    verticalAlign: z.enum(["baseline", "superscript", "subscript"]).nullable().optional(),
    characterSpacingPoints: z
      .number()
      .refine(
        (value) =>
          Number.isInteger(value * 20) && value * 20 >= -2147483648 && value * 20 <= 2147483647,
      )
      .nullable()
      .optional(),
    link: z.string().refine(isWordHyperlink).nullable().optional(),
  })
  .strict();
export const paragraphFormat = z
  .object({
    align: z.enum(["left", "center", "right", "justify"]).nullable().optional(),
    paragraph: z
      .custom<import("../paragraph-format.ts").WordParagraphFormat>(isWordParagraphFormat)
      .nullable()
      .optional(),
  })
  .strict();
export const tableFormat = z
  .object({
    scope: z.enum(["cell", "row", "column", "table"]),
    cell: z.custom<import("../table-format.ts").WordCellFormat>(isWordCellFormat).optional(),
    row: z.custom<import("../table-format.ts").WordRowFormat>(isWordRowFormat).optional(),
    columnWidths: z.array(z.number().positive()).optional(),
  })
  .strict();
export const shape = z.custom<import("../shapes.ts").WordAuthoredShape>(isWordAuthoredShape);
export const image = z.custom<import("../collaboration/images.ts").DocumentImage>(isDocumentImage);
export const targetSchema = z.union([
  z.object({ text: z.string().min(1), within: z.string().min(1).optional() }).strict(),
  z
    .object({
      kind: z.literal("range"),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    })
    .strict()
    .refine((value) => value.end >= value.start, "end must be at least start"),
  z.object({ kind: z.literal("cell"), tableId: z.string(), cellId: z.string() }).strict(),
  z.object({ kind: z.literal("table"), tableId: z.string() }).strict(),
]);
