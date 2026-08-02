const HEX_PAIR = /^[0-9A-Fa-f]{2}$/;
const ASCII_UNRESERVED = /^[A-Za-z0-9._~-]$/;
const ASCII_SEGMENT_CHARACTER = /^[A-Za-z0-9._~!$&'()*+,;=:@-]$/;

export class PartNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartNameError";
  }
}

export class PartName {
  readonly value: string;
  readonly equivalenceKey: string;

  private constructor(value: string) {
    this.value = value;
    this.equivalenceKey = asciiLowercase(value);
    Object.freeze(this);
  }

  static parse(value: string): PartName {
    validatePartName(value);
    return new PartName(value);
  }

  static fromZipItemName(value: string): PartName {
    return PartName.parse(`/${value}`);
  }

  equals(other: PartName): boolean {
    return this.equivalenceKey === other.equivalenceKey;
  }

  extension(): string | undefined {
    const segment = this.value.slice(this.value.lastIndexOf("/") + 1);
    const dot = segment.lastIndexOf(".");
    return dot <= 0 || dot === segment.length - 1
      ? undefined
      : segment.slice(dot + 1);
  }

  toString(): string {
    return this.value;
  }
}

function validatePartName(value: string): void {
  if (!value.startsWith("/") || value === "/" || value.includes("\\")) {
    throw new PartNameError(`Invalid OPC part name ${JSON.stringify(value)}.`);
  }
  const segments = value.slice(1).split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment.endsWith(".") ||
        segment.includes("\0"),
    )
  ) {
    throw new PartNameError(`Invalid OPC part name ${JSON.stringify(value)}.`);
  }

  for (const segment of segments) {
    for (let index = 0; index < segment.length;) {
      const character = segment[index];
      if (character === "%") {
        const encoded = segment.slice(index + 1, index + 3);
        if (!HEX_PAIR.test(encoded)) {
          throw new PartNameError(`Invalid percent encoding in part name ${JSON.stringify(value)}.`);
        }
        const decodedCharacter = String.fromCharCode(Number.parseInt(encoded, 16));
        if (
          decodedCharacter === "/" ||
          decodedCharacter === "\\" ||
          ASCII_UNRESERVED.test(decodedCharacter)
        ) {
          throw new PartNameError(
            `Forbidden percent-encoded character in part name ${JSON.stringify(value)}.`,
          );
        }
        index += 3;
        continue;
      }

      const codePoint = segment.codePointAt(index);
      if (
        codePoint === undefined ||
        (codePoint <= 0x7f && !ASCII_SEGMENT_CHARACTER.test(character ?? "")) ||
        (codePoint > 0x7f && !isInternationalUnreserved(codePoint))
      ) {
        throw new PartNameError(
          `Forbidden character in part name ${JSON.stringify(value)}.`,
        );
      }
      index += codePoint > 0xffff ? 2 : 1;
    }
  }
}

function isInternationalUnreserved(codePoint: number): boolean {
  return (
    (codePoint >= 0x00a0 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfdcf) ||
    (codePoint >= 0xfdf0 && codePoint <= 0xffef) ||
    (codePoint >= 0x10000 && codePoint <= 0x1fffd) ||
    (codePoint >= 0x20000 && codePoint <= 0x2fffd) ||
    (codePoint >= 0x30000 && codePoint <= 0x3fffd) ||
    (codePoint >= 0x40000 && codePoint <= 0x4fffd) ||
    (codePoint >= 0x50000 && codePoint <= 0x5fffd) ||
    (codePoint >= 0x60000 && codePoint <= 0x6fffd) ||
    (codePoint >= 0x70000 && codePoint <= 0x7fffd) ||
    (codePoint >= 0x80000 && codePoint <= 0x8fffd) ||
    (codePoint >= 0x90000 && codePoint <= 0x9fffd) ||
    (codePoint >= 0xa0000 && codePoint <= 0xafffd) ||
    (codePoint >= 0xb0000 && codePoint <= 0xbfffd) ||
    (codePoint >= 0xc0000 && codePoint <= 0xcfffd) ||
    (codePoint >= 0xd0000 && codePoint <= 0xdfffd) ||
    (codePoint >= 0xe1000 && codePoint <= 0xefffd)
  );
}

function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}
