import { PdfSyntax } from "./syntax.ts";
import { readContentToken, isOperator } from "./content-syntax.ts";
import { integer, invalid, PdfString, type PdfValue } from "./objects.ts";

export interface PdfCode {
  readonly code: number;
  readonly length: number;
}
interface CodeSpace {
  length: number;
  start: number;
  end: number;
}
function code(value: PdfValue): PdfCode {
  if (!(value instanceof PdfString) || value.bytes.length < 1 || value.bytes.length > 4)
    return invalid("Invalid CMap character code.");
  let result = 0;
  for (const byte of value.bytes) result = result * 256 + byte;
  return { code: result, length: value.bytes.length };
}
export function utf16(bytes: Uint8Array): string {
  if (bytes.length % 2)
    return invalid("CMap Unicode destination must contain complete UTF-16BE code units.");
  return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
}

/** Character codes remain separate from CIDs and Unicode sequences, including ligature expansion. */
export class PdfCMap {
  readonly unicode = new Map<string, string>();
  readonly cids = new Map<string, number>();
  readonly spaces: CodeSpace[] = [];
  vertical = false;
  key(value: PdfCode) {
    return `${value.length}:${value.code}`;
  }
  constructor(bytes?: Uint8Array) {
    if (!bytes) return;
    const syntax = new PdfSyntax(bytes);
    let count = 0;
    while (syntax.position < bytes.length) {
      syntax.skip();
      if (syntax.position >= bytes.length) break;
      const value = readContentToken(syntax);
      if (!isOperator(value)) {
        if (typeof value === "number") count = integer(value);
        continue;
      }
      if (
        ![
          "begincodespacerange",
          "beginbfchar",
          "beginbfrange",
          "begincidchar",
          "begincidrange",
        ].includes(value.operator)
      )
        continue;
      if (count < 0 || count > bytes.length) return invalid("Invalid CMap mapping count.");
      for (let i = 0; i < count; i++) {
        const first = code(syntax.value());
        if (value.operator === "begincodespacerange") {
          const last = code(syntax.value());
          if (first.length !== last.length || last.code < first.code)
            return invalid("Invalid CMap code space.");
          this.spaces.push({ length: first.length, start: first.code, end: last.code });
        } else if (value.operator === "beginbfchar") {
          const destination = syntax.value();
          if (!(destination instanceof PdfString)) return invalid("Invalid ToUnicode destination.");
          this.unicode.set(this.key(first), utf16(destination.bytes));
        } else if (value.operator === "begincidchar")
          this.cids.set(this.key(first), integer(syntax.value()));
        else {
          const last = code(syntax.value()),
            destination = syntax.value();
          if (
            last.length !== first.length ||
            last.code < first.code ||
            last.code - first.code > 65535
          )
            return invalid("Invalid CMap range.");
          for (let current = first.code; current <= last.code; current++) {
            const key = this.key({ code: current, length: first.length }),
              offset = current - first.code;
            if (value.operator === "begincidrange")
              this.cids.set(key, integer(destination) + offset);
            else {
              const mapped = Array.isArray(destination) ? destination[offset] : destination;
              if (!(mapped instanceof PdfString))
                return invalid("Invalid ToUnicode range destination.");
              const bytes = mapped.bytes.slice();
              if (!Array.isArray(destination)) {
                let carry = offset;
                for (let index = bytes.length - 1; index >= 0 && carry; index--) {
                  const next = bytes[index]! + carry;
                  bytes[index] = next & 255;
                  carry = next >>> 8;
                }
                if (carry) return invalid("ToUnicode range overflows its destination.");
              }
              this.unicode.set(key, utf16(bytes));
            }
          }
        }
      }
      syntax.expect(value.operator.replace("begin", "end"));
      count = 0;
    }
  }
  decode(bytes: Uint8Array, defaultLength: number): PdfCode[] {
    return [...this.codes(bytes, defaultLength)];
  }
  *codes(bytes: Uint8Array, defaultLength: number): Generator<PdfCode> {
    const spaces = this.spaces.length
      ? this.spaces
      : [{ length: defaultLength, start: 0, end: 2 ** (8 * defaultLength) - 1 }];
    for (let at = 0; at < bytes.length;) {
      let matched = false,
        value = 0;
      for (let length = 1; length <= 4 && at + length <= bytes.length; length++) {
        value = value * 256 + bytes[at + length - 1]!;
        if (
          !spaces.some(
            (space) => space.length === length && value >= space.start && value <= space.end,
          )
        )
          continue;
        yield { code: value, length };
        at += length;
        matched = true;
        break;
      }
      if (!matched) return invalid("Text string contains a code outside its font CMap.");
    }
  }
}
