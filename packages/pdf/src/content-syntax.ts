import { PdfSyntax, whitespace } from "./syntax.ts";
import { bytesText, invalid, type PdfValue } from "./objects.ts";

export interface PdfOperation {
  readonly operator: string;
  readonly operands: readonly PdfValue[];
  readonly start: number;
  readonly end: number;
}

/** Content operands use PDF object syntax; operators retain their byte range for future edits. */
export function readContentToken(syntax: PdfSyntax): PdfValue | { operator: string } {
  syntax.skip();
  const byte = syntax.bytes[syntax.position];
  if (byte === undefined) return invalid("Unexpected end of PDF content.");
  if (
    [47, 40, 60, 91, 43, 45, 46].includes(byte) ||
    (byte >= 48 && byte <= 57) ||
    syntax.peek("true") ||
    syntax.peek("false") ||
    syntax.peek("null")
  )
    return syntax.value();
  return { operator: syntax.word() };
}
export function isOperator(
  value: ReturnType<typeof readContentToken>,
): value is { operator: string } {
  return typeof value === "object" && value !== null && "operator" in value;
}

export function inlineImageEnd(syntax: PdfSyntax, length: number): Uint8Array {
  if (!whitespace(syntax.bytes[syntax.position]))
    return invalid("Inline image ID must be followed by whitespace.");
  syntax.position++;
  const end = syntax.position + length;
  if (end > syntax.bytes.length) return invalid("Truncated inline image.");
  const bytes = syntax.bytes.subarray(syntax.position, end);
  syntax.position = end;
  syntax.expect("EI");
  return bytes;
}

export function contentString(bytes: Uint8Array) {
  return bytesText(bytes);
}
