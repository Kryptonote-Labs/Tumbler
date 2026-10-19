import { wordOperation, targetSchema } from "@tumblerjs/word/operations";
import { z } from "zod";
import { TEXT_FORMATS, isFontSize } from "@tumblerjs/word/collaboration";

// These flags follow the engine's boolean character formats, including strikethrough.
const booleans = Object.fromEntries(
  TEXT_FORMATS.map((key) => [key, z.boolean().nullable().optional()]),
) as {
  [Key in (typeof TEXT_FORMATS)[number]]: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
};
export const characterFormat = z
  .object({
    ...booleans,
    fontFamily: z.string().min(1).nullable().optional(),
    fontSize: z.number().refine(isFontSize).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
  })
  .strict();
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
  .object({ offset: z.number().int().nonnegative().default(0), region: z.string().default("body") })
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
export type FormatInput = z.infer<typeof formatInput>;
export type ReplaceInput = z.infer<typeof replaceInput>;
export const operationInput = z
  .object({ page: z.string().optional(), target: targetSchema, operation: wordOperation })
  .strict();
export type OperationInput = z.infer<typeof operationInput>;
export interface OperationHost {
  operate?(document: string, input: OperationInput): Promise<unknown>;
  read(document: string, input: ReadInput): Promise<unknown>;
  format(document: string, input: FormatInput): Promise<unknown>;
  replace(document: string, input: ReplaceInput): Promise<unknown>;
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
    run: (host, document, input) => host.format(document, input),
  }),
  replace: defineOperation({
    name: "replace",
    summary: "Replace one exact target from a read page",
    access: "edit",
    input: replaceInput,
    run: (host, document, input) => host.replace(document, input),
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
