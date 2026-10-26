import { inspectInput, type InspectInput } from "@tumblerjs/word/operations";
import { wordOperation, targetSchema } from "@tumblerjs/word/operations";
import { z } from "zod";
import { characterFormat } from "@tumblerjs/word/operations";
export { characterFormat } from "@tumblerjs/word/operations";
export const textTarget = z.union([
  z.object({ text: z.string().min(1), within: z.string().min(1).optional() }).strict(),
  z
    .object({
      kind: z.literal("range"),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    })
    .strict()
    .refine((value) => value.end >= value.start, "end must be at least start"),
]);
const edit = z.object({ page: z.string().optional(), target: textTarget });
export const readInput = z
  .object({
    offset: z.number().int().nonnegative().default(0),
    region: z.string().default("body"),
    target: z.object({ start: z.string(), end: z.string() }).optional(),
  })
  .strict();
export const formatInput = edit
  .extend({
    format: characterFormat.refine(
      (value) => Object.keys(value).length > 0,
      "Supply at least one format",
    ),
  })
  .strict();
export const replaceInput = edit.extend({ value: z.string() }).strict();
export type ReadInput = z.infer<typeof readInput>;
export const readImageInput = z
  .object({ id: z.string().min(1), region: z.string().default('body') })
  .strict();
export type ReadImageInput = z.infer<typeof readImageInput>;
export type FormatInput = z.infer<typeof formatInput>;
export type ReplaceInput = z.infer<typeof replaceInput>;
export const operationInput = z
  .object({ page: z.string().optional(), target: targetSchema, operation: wordOperation })
  .strict();
export type OperationInput = z.infer<typeof operationInput>;
export const selectInput = z.object({ page: z.string().optional(), target: targetSchema }).strict();
export type SelectInput = z.infer<typeof selectInput>;
export interface OperationHost {
  readImage?(document: string, input: ReadImageInput): Promise<unknown>;
  select?(document: string, input: SelectInput): Promise<unknown>;
  unselect?(document: string): Promise<unknown>;
  inspect?(document: string, input: InspectInput): Promise<unknown>;
  operate(document: string, input: OperationInput): Promise<unknown>;
  read(document: string, input: ReadInput): Promise<unknown>;
  create(document: string): Promise<unknown>;
}

export function defineOperation<S extends z.ZodType>(definition: {
  name: string;
  summary: string;
  access: "read" | "edit";
  input: S;
  run: (host: OperationHost, document: string, input: z.output<S>) => Promise<unknown>;
}) {
  return {
    ...definition,
    execute: (host: OperationHost, document: string, input: unknown) =>
      definition.run(host, document, definition.input.parse(input)),
  };
}
export const operations = {
  'read-image': defineOperation({
    name: 'read-image',
    summary: 'Read the actual image identified by an inspected image.id. --input JSON.',
    access: 'read',
    input: readImageInput,
    run: (host, document, input) => {
      if (!host.readImage) throw new Error('Image reading is unavailable on this host.');
      return host.readImage(document, input);
    },
  }),
  select: defineOperation({
    name: "select",
    summary: "Select an exact text, range, cell or table target from a read page. --input JSON.",
    access: "read",
    input: selectInput,
    run: (host, document, input) => {
      if (!host.select) throw new Error("Selection is unavailable on this host.");
      return host.select(document, input);
    },
  }),
  unselect: defineOperation({
    name: "unselect",
    summary: "Collapse the current selection.",
    access: "read",
    input: z.object({}).strict(),
    run: (host, document) => {
      if (!host.unselect) throw new Error("Selection is unavailable on this host.");
      return host.unselect(document);
    },
  }),
  inspect: defineOperation({
    name: "inspect",
    summary: "Inspect styles, objects, regions or geometry using --input JSON.",
    access: "read",
    input: inspectInput,
    run: (host, document, input) => {
      if (!host.inspect) throw new Error("Inspection is unavailable on this host.");
      return host.inspect(document, input);
    },
  }),
  read: defineOperation({
    name: "read",
    summary: "Read a bounded page and its revision handle",
    access: "read",
    input: readInput,
    run: (host, document, input) => host.read(document, input),
  }),
  format: defineOperation({
    name: "format",
    summary: "Format one exact target from a read page",
    access: "edit",
    input: formatInput,
    run: (host, document, { format, ...input }) =>
      host.operate(document, { ...input, operation: { name: "format", input: format } }),
  }),
  replace: defineOperation({
    name: "replace",
    summary: "Replace one exact target from a read page",
    access: "edit",
    input: replaceInput,
    run: (host, document, input) =>
      host.operate(document, {
        page: input.page,
        target: input.target,
        operation: { name: "replace", input: { value: input.value } },
      }),
  }),
  create: defineOperation({
    name: "create",
    summary: "Create a document without overwriting an existing file",
    access: "edit",
    input: z.object({}).strict(),
    run: (host, document) => host.create(document),
  }),
};

/** An uncertain write outcome must retry with the same operation identity. */
export class OperationRecoveryError extends Error {}

export { inspectInput, type InspectInput } from "@tumblerjs/word/operations";
