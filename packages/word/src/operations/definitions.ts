import { wordSectionFormatSchema } from '../section-format.ts';
import { isWordColour, type WordColour } from '../theme-colours.ts';
import { objectPatch, ink } from "./schemas.ts";
import * as z from 'zod';
import { WORD_PAGE_NUMBER_PRESETS } from "../page-fields.ts";
import { WORD_LIST_KINDS } from "../authored-list.ts";
import { TABLE_ACTIONS } from "../collaboration/table-edits.ts";
import { characterFormat, paragraphFormat, tableFormat, shape, image } from "./schemas.ts";

// Read-only document hosts import these definitions too. Construct edit schemas on demand.
function operation<N extends string, S extends z.ZodType>(
  name: N,
  summary: string,
  createInput: () => S,
  example: z.input<S>,
) {
  let input: S | undefined;
  let schema: ReturnType<typeof createSchema> | undefined;
  const getInput = () => input ??= createInput();
  function createSchema() {
    return z.object({ name: z.literal(name), input: getInput() }).strict();
  }
  return {
    name,
    summary,
    get input() { return getInput(); },
    example,
    access: "edit" as const,
    get schema() { return schema ??= createSchema(); },
  };
}

const search = {
  query: z.string().min(1),
  matchCase: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
};
export const wordOperations = {
  'section-layout': operation('section-layout', 'Set page size, margins and columns for the current section or whole document. Measurements are twips, 20 per point.',
    () => (z.object({ scope: z.enum(['section', 'document']).default('section'), section: z.number().int().nonnegative().optional(), format: wordSectionFormatSchema }).strict()),
    { scope: 'section', format: { columnCount: 2, columnSpaceTwips: 720 } }),
  'section-break': operation('section-break', 'Split the current section at a body caret, preserving its properties and header/footer links.',
    () => (z.object({ type: z.enum(['continuous', 'nextPage', 'nextColumn', 'evenPage', 'oddPage']) }).strict()), { type: 'nextPage' }),
  'remove-section-break': operation('remove-section-break', 'Delete the section break at the caret. The joined text uses the following section layout.', () => (z.object({}).strict()), {}),
  'page-color': operation(
    'page-color',
    'Set the background of every page. Null removes the document background. Supports RGB or theme colours.',
    () => (z.object({ color: z.custom<WordColour>(isWordColour).nullable() }).strict()),
    { color: '#C1E4F5' },
  ),
  "fit-table": operation(
    "fit-table",
    "Fit the whole table to its actual page column or containing cell. Widths are points.",
    () => (z
      .object({
        cellId: z.string(),
        fraction: z.number().positive().max(1).default(1),
        columnWeights: z.array(z.number().positive()).optional(),
      })
      .strict()),
    { cellId: "<cell-id>", fraction: 1 },
  ),
  "edit-object": operation(
    "edit-object",
    "Edit existing images, shapes, ink and chart titles; resize or switch between inline, floating in front of text, and behind text. Supports page-fixed or text-relative positioning in points. Preserve unchanged properties.",
    () => (objectPatch),
    { drawing: { width: 100, height: 60, layout: "inline" } },
  ),
  "move-object": operation(
    "move-object",
    "Move one object to a UTF-16 insertion point in the same region.",
    () => (z.object({ destination: z.number().int().nonnegative() }).strict()),
    { destination: 0 },
  ),
  "insert-ink": operation(
    "insert-ink",
    "Insert one native ink drawing. Use strokes for a shared coordinate frame: each stroke has points [x,y,pressure], color and size. Width/height and coordinates are points. The whole drawing flows inline by default; use layout front and explicit placement to float it.",
    () => (z.object({ ink }).strict()),
    {
      ink: {
        width: 100,
        height: 30,
        strokes: [{ color: "#202020", size: 2, points: [[10, 10, 1], [90, 20, 1]] }],
      },
    },
  ),

  format: operation(
    "format",
    "Format characters; omitted properties are preserved, null restores inheritance.",
    () => (characterFormat),
    { strike: true },
  ),
  replace: operation(
    "replace",
    "Replace the target text, optionally formatting the inserted text.",
    () => (z.object({ value: z.string(), format: characterFormat.optional() }).strict()),
    { value: "New text" },
  ),
  paragraph: operation(
    "paragraph",
    "Set alignment and paragraph properties, with spacing measured in twips.",
    () => (paragraphFormat),
    { align: "center", paragraph: { keepNext: true } },
  ),
  style: operation(
    "style",
    "Apply a paragraph style and clear direct character and paragraph overrides.",
    () => (z.object({ styleId: z.string().min(1) }).strict()),
    { styleId: "Heading1" },
  ),
  "clear-formatting": operation(
    "clear-formatting",
    "Clear direct character formatting without removing paragraph structure.",
    () => (z.object({}).strict()),
    {},
  ),
  list: operation(
    "list",
    "Set or remove a list. Supports numbering, restart, markers and multiple levels.",
    () => (z
      .object({
        kind: z.enum(WORD_LIST_KINDS).nullable(),
        start: z.number().int().min(0).max(2147483647).optional(),
        marker: z.string().min(1).optional(),
        multilevel: z.boolean().optional(),
        restart: z.boolean().optional(),
      })
      .strict()),
    { kind: "decimal", restart: true, start: 1 },
  ),
  "indent-list": operation(
    "indent-list",
    "Change selected list levels by the given amount, within Word levels 0–8.",
    () => (z.object({ amount: z.number().int() }).strict()),
    { amount: 1 },
  ),
  "continue-list": operation(
    "continue-list",
    "Continue the preceding list in this document region.",
    () => (z.object({}).strict()),
    {},
  ),
  break: operation(
    "break",
    "Insert a line, page or column break; blankPage inserts two page breaks.",
    () => (z
      .object({ type: z.enum(["line", "page", "column"]), blankPage: z.boolean().optional() })
      .strict()
      .refine(
        (value) => !value.blankPage || value.type === "page",
        "blankPage requires a page break",
      )),
    { type: "page" },
  ),
  "page-number": operation(
    "page-number",
    "Insert page-number fields in the current region.",
    () => (z
      .object({
        preset: z.enum(WORD_PAGE_NUMBER_PRESETS),
        alignment: z.enum(["left", "center", "right"]).optional(),
      })
      .strict()),
    { preset: "page-x-of-y", alignment: "right" },
  ),
  "align-item": operation(
    "align-item",
    "Align a selected inline item independently of surrounding text.",
    () => (z.object({ alignment: z.enum(["left", "center", "right"]) }).strict()),
    { alignment: "center" },
  ),
  "insert-table": operation(
    "insert-table",
    "Insert a real table after the paragraph at a collapsed target.",
    () => (z.object({ rows: z.array(z.array(z.string()).min(1)).min(1) }).strict()),
    {
      rows: [
        ["Name", "Value"],
        ["", ""],
      ],
    },
  ),
  "edit-table": operation(
    "edit-table",
    "Change table structure relative to a cell. Target the whole table.",
    () => (z.object({ cellId: z.string(), action: z.enum(TABLE_ACTIONS) }).strict()),
    { cellId: "<cell-id>", action: "merge-right" },
  ),
  "format-table": operation(
    "format-table",
    "Format a table, row, column or cell. Column widths are points. Target the whole table.",
    () => (z.object({ cellId: z.string(), patch: tableFormat }).strict()),
    { cellId: "<cell-id>", patch: { scope: "table", columnWidths: [150, 150] } },
  ),
  "replace-all": operation(
    "replace-all",
    "Atomically replace literal matches inside the explicit target only.",
    () => (z.object({ ...search, value: z.string() }).strict()),
    { query: "draft", value: "final", wholeWord: true },
  ),
  "insert-shape": operation(
    "insert-shape",
    "Insert a native Word shape with explicit geometry and text.",
    () => (z.object({ shape }).strict()),
    {
      shape: {
        preset: "rect",
        width: 100,
        height: 60,
        fill: "#ffffff",
        outline: "#000000",
        outlineWidth: 1,
      },
    },
  ),
  "insert-image": operation(
    "insert-image",
    "Insert an image already available to the host.",
    () => (z.object({ image }).strict()),
    { image: { id: "asset-id", type: "image/png", width: 100, height: 60, alt: "Description" } },
  ),
};
export const wordOperation = z.lazy(() => z.discriminatedUnion("name", [
  wordOperations["section-layout"].schema,
  wordOperations["section-break"].schema,
  wordOperations["remove-section-break"].schema,
  wordOperations["page-color"].schema,
  wordOperations["fit-table"].schema,
  wordOperations["edit-object"].schema,
  wordOperations["move-object"].schema,
  wordOperations["insert-ink"].schema,
  wordOperations.format.schema,
  wordOperations.replace.schema,
  wordOperations.paragraph.schema,
  wordOperations.style.schema,
  wordOperations["clear-formatting"].schema,
  wordOperations.list.schema,
  wordOperations["indent-list"].schema,
  wordOperations["continue-list"].schema,
  wordOperations.break.schema,
  wordOperations["page-number"].schema,
  wordOperations["align-item"].schema,
  wordOperations["insert-table"].schema,
  wordOperations["edit-table"].schema,
  wordOperations["format-table"].schema,
  wordOperations["replace-all"].schema,
  wordOperations["insert-shape"].schema,
  wordOperations["insert-image"].schema,
]));
export type WordOperation = z.infer<typeof wordOperation>;
export type WordOperationName = WordOperation["name"];
