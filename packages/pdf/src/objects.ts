/** PDF 1.7, clauses 7.2–7.3. Names, byte strings and indirect references retain their types. */
export class PdfName {
  constructor(readonly value: string) {}
}
export class PdfString {
  constructor(readonly bytes: Uint8Array) {}
}
export class PdfReference {
  constructor(
    readonly object: number,
    readonly generation = 0,
  ) {}
  get key() {
    return `${this.object} ${this.generation}`;
  }
}
export type PdfDictionary = Map<string, PdfValue>;
export type PdfValue =
  | null
  | boolean
  | number
  | PdfName
  | PdfString
  | PdfReference
  | PdfValue[]
  | PdfDictionary
  | PdfStream;
export class PdfStream {
  constructor(
    readonly dictionary: PdfDictionary,
    readonly encoded: Uint8Array,
    readonly object: PdfReference,
  ) {}
}
export class PdfError extends Error {
  override readonly name = "PdfError";
  constructor(
    readonly code:
      | "invalid_pdf"
      | "unsupported_feature"
      | "password_required"
      | "invalid_password"
      | "resource_limit",
    message: string,
    readonly offset?: number,
  ) {
    super(message);
  }
}
export function invalid(message: string, offset?: number): never {
  throw new PdfError("invalid_pdf", message, offset);
}
export function unsupported(message: string): never {
  throw new PdfError("unsupported_feature", message);
}
export function dictionary(value: PdfValue | undefined, context = "dictionary"): PdfDictionary {
  if (value instanceof PdfStream) return value.dictionary;
  if (!(value instanceof Map)) return invalid(`Expected PDF ${context}.`);
  return value;
}
export function number(value: PdfValue | undefined, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value))
    return invalid("Expected a finite PDF number.");
  return value;
}
export function integer(value: PdfValue | undefined, fallback?: number): number {
  const result = number(value, fallback);
  if (!Number.isSafeInteger(result)) return invalid("Expected a safe PDF integer.");
  return result;
}
export function name(value: PdfValue | undefined, fallback = ""): string {
  if (value === undefined) return fallback;
  if (!(value instanceof PdfName)) return invalid("Expected a PDF name.");
  return value.value;
}
export function array(value: PdfValue | undefined): PdfValue[] {
  if (!Array.isArray(value)) return invalid("Expected a PDF array.");
  return value;
}
export function bytesText(bytes: Uint8Array): string {
  let result = "";
  for (let at = 0; at < bytes.length; at += 8192)
    result += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return result;
}
