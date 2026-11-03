import {
  bytesText,
  integer,
  invalid,
  PdfName,
  PdfReference,
  PdfString,
  type PdfValue,
} from "./objects.ts";

export const whitespace = (byte: number | undefined) =>
  byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
const delimiter = (byte: number | undefined) =>
  byte === undefined ||
  whitespace(byte) ||
  byte === 40 ||
  byte === 41 ||
  byte === 60 ||
  byte === 62 ||
  byte === 91 ||
  byte === 93 ||
  byte === 123 ||
  byte === 125 ||
  byte === 47 ||
  byte === 37;

/** Byte-oriented syntax reader. Stream payloads are consumed by length, never by token searches. */
export class PdfSyntax {
  position: number;
  constructor(
    readonly bytes: Uint8Array,
    offset = 0,
  ) {
    this.position = offset;
  }
  skip() {
    for (;;) {
      while (whitespace(this.bytes[this.position])) this.position++;
      if (this.bytes[this.position] !== 37) return;
      while (this.position < this.bytes.length && ![10, 13].includes(this.bytes[this.position]!))
        this.position++;
    }
  }
  word(): string {
    this.skip();
    const start = this.position;
    while (!delimiter(this.bytes[this.position])) this.position++;
    if (start === this.position) return invalid("Expected PDF keyword.", this.position);
    return bytesText(this.bytes.subarray(start, this.position));
  }
  expect(expected: string) {
    const actual = this.word();
    if (actual !== expected) invalid(`Expected ${expected}, found ${actual}.`, this.position);
  }
  peek(expected: string): boolean {
    const before = this.position;
    this.skip();
    const end = this.position + expected.length;
    const found =
      bytesText(this.bytes.subarray(this.position, end)) === expected && delimiter(this.bytes[end]);
    this.position = before;
    return found;
  }
  value(depth = 0): PdfValue {
    this.skip();
    // This is a recursion budget, not a document-authoring limit.
    if (depth > 256)
      return invalid("PDF object nesting exhausted the parser recursion budget.", this.position);
    const byte = this.bytes[this.position++];
    if (byte === undefined) return invalid("Unexpected end of PDF.", this.position);
    if (byte === 47) {
      const bytes: number[] = [];
      while (!delimiter(this.bytes[this.position])) {
        const next = this.bytes[this.position++]!;
        if (next !== 35) bytes.push(next);
        else {
          const hex = bytesText(this.bytes.subarray(this.position, this.position + 2));
          if (!/^[\da-f]{2}$/i.test(hex))
            return invalid("Invalid escape in a PDF name.", this.position);
          bytes.push(parseInt(hex, 16));
          this.position += 2;
        }
      }
      return new PdfName(bytesText(Uint8Array.from(bytes)));
    }
    if (byte === 40) return this.string();
    if (byte === 60 && this.bytes[this.position] !== 60) {
      const hex: string[] = [];
      while (this.position < this.bytes.length && this.bytes[this.position] !== 62) {
        const next = this.bytes[this.position++]!;
        if (whitespace(next)) continue;
        const character = String.fromCharCode(next);
        if (!/[\da-f]/i.test(character))
          return invalid("Invalid hexadecimal PDF string.", this.position);
        hex.push(character);
      }
      if (this.bytes[this.position++] !== 62)
        return invalid("Unterminated hexadecimal PDF string.");
      if (hex.length % 2) hex.push("0");
      const data = new Uint8Array(hex.length / 2);
      for (let i = 0; i < data.length; i++)
        data[i] = parseInt(hex.slice(i * 2, i * 2 + 2).join(""), 16);
      return new PdfString(data);
    }
    if (byte === 60) {
      this.position++;
      const result = new Map<string, PdfValue>();
      for (;;) {
        this.skip();
        if (this.bytes[this.position] === 62 && this.bytes[this.position + 1] === 62) {
          this.position += 2;
          return result;
        }
        const key = this.value(depth + 1);
        if (!(key instanceof PdfName))
          return invalid("PDF dictionary key is not a name.", this.position);
        if (result.has(key.value))
          return invalid(`Duplicate PDF dictionary key /${key.value}.`, this.position);
        result.set(key.value, this.value(depth + 1));
      }
    }
    if (byte === 91) {
      const result: PdfValue[] = [];
      for (;;) {
        this.skip();
        if (this.bytes[this.position] === 93) {
          this.position++;
          return result;
        }
        result.push(this.value(depth + 1));
      }
    }
    this.position--;
    const token = this.word();
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "null") return null;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token))
      return invalid(`Invalid PDF object token ${token}.`, this.position);
    const value = Number(token);
    if (!Number.isFinite(value)) return invalid("Non-finite PDF number.", this.position);
    if (/^\d+$/.test(token)) {
      const end = this.position;
      this.skip();
      if (
        this.bytes[this.position] !== undefined &&
        this.bytes[this.position]! >= 48 &&
        this.bytes[this.position]! <= 57
      ) {
        const generation = this.word();
        if (/^\d+$/.test(generation) && this.peek("R")) {
          this.expect("R");
          return new PdfReference(integer(value), integer(Number(generation)));
        }
      }
      this.position = end;
    }
    return value;
  }
  private string() {
    let depth = 1;
    const result: number[] = [];
    while (this.position < this.bytes.length) {
      let byte = this.bytes[this.position++]!;
      if (byte === 40) {
        depth++;
        result.push(byte);
      } else if (byte === 41) {
        if (--depth === 0) return new PdfString(Uint8Array.from(result));
        result.push(byte);
      } else if (byte === 92) {
        byte = this.bytes[this.position++]!;
        if (byte === 13 || byte === 10) {
          if (byte === 13 && this.bytes[this.position] === 10) this.position++;
          continue;
        }
        const escaped: Record<number, number> = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };
        if (byte >= 48 && byte <= 55) {
          let value = byte - 48;
          for (let i = 1; i < 3; i++) {
            const next = this.bytes[this.position];
            if (next === undefined || next < 48 || next > 55) break;
            value = value * 8 + next - 48;
            this.position++;
          }
          result.push(value & 255);
        } else result.push(escaped[byte] ?? byte);
      } else if (byte === 13) {
        if (this.bytes[this.position] === 10) this.position++;
        result.push(10);
      } else result.push(byte);
    }
    return invalid("Unterminated PDF literal string.", this.position);
  }
}
