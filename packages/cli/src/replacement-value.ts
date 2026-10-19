import { z } from "zod";

export const replacementHelp = String.raw`replace: --value <text> decodes \n, \r, \t and \\. Add --literal to preserve backslashes. Alternatively use --value-file <path|-> for exact UTF-8 text from a file or stdin. Empty text deletes the target. Structured --input JSON uses JSON escaping only.`;

/** Decode once; unknown escapes and existing line breaks remain unchanged. */
export async function replacementValue(
  flags: { value?: unknown; valueFile?: unknown; literal?: unknown },
  readValue?: (path: string) => Promise<string>,
) {
  const { value, valueFile, literal } = z
    .object({
      value: z.string().optional(),
      valueFile: z.string().min(1).optional(),
      literal: z.boolean().optional(),
    })
    .parse(flags);
  if ((value === undefined) === (valueFile === undefined))
    throw new Error("Supply exactly one of --value or --value-file.");
  if (valueFile !== undefined) {
    if (literal !== undefined)
      throw new Error("--value-file already preserves text literally; omit --literal.");
    if (!readValue) throw new Error("This host does not support --value-file.");
    return readValue(valueFile);
  }
  if (literal) return value!;
  return value!.replace(/\\([nrt\\])/g, (_, escape: string) => {
    switch (escape) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return "\\";
    }
  });
}
