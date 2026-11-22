import { invalid } from './objects.ts';

const latin1 = new TextDecoder('iso-8859-1');

function decrypt(input: Uint8Array, seed: number, discard: number) {
  const output = new Uint8Array(Math.max(0, input.length - discard));
  let key = seed;
  for (const [index, byte] of input.entries()) {
    if (index >= discard) output[index - discard] = byte ^ (key >>> 8);
    key = ((byte + key) * 52845 + 22719) & 65535;
  }
  return output;
}

/** Decode PDF FontFile dictionaries using Adobe Type 1 Font Format §7.2–7.3. */
export function readType1Program(
  program: Uint8Array,
  clearLength: number,
  encryptedLength: number,
) {
  if (clearLength <= 0 || encryptedLength < 4 || clearLength + encryptedLength > program.length)
    invalid('Invalid embedded Type 1 font lengths.');
  const clear = latin1.decode(program.subarray(0, clearLength));
  const encoded = program.subarray(clearLength, clearLength + encryptedLength);
  const hex = /^[\dA-Fa-f]{8}/.test(latin1.decode(encoded.subarray(0, 8)));
  const secret = hex
    ? Uint8Array.from(
        latin1
          .decode(encoded)
          .replace(/\s+/g, '')
          .match(/^[\da-f]+/i)?.[0]
          .match(/../g) ?? [],
        (pair) => parseInt(pair, 16),
      )
    : encoded;
  const decrypted = decrypt(secret, 55665, 4);
  const content = latin1.decode(decrypted);
  const lenIV = Number(/\/lenIV\s+(-?\d+)/.exec(content)?.[1] ?? 4);
  const binary = (start: number, length: number) => {
    if (!Number.isSafeInteger(length) || start + length > decrypted.length)
      invalid('Truncated Type 1 charstring.');
    const bytes = decrypted.subarray(start, start + length);
    return lenIV < 0 ? bytes : decrypt(bytes, 4330, lenIV);
  };
  const subrDirectory = /\/Subrs\s+\d+\s+array\b/.exec(content);
  const glyphDirectory = /\/CharStrings\s+\d+\s+dict\b/.exec(content);
  if (!glyphDirectory) return invalid('Type 1 font has no CharStrings dictionary.');
  const subrs = new Map<number, Uint8Array>();
  const subrRecord = /\bdup\s+(\d+)\s+(\d+)\s+(?:RD|-\|)\s/g;
  if (subrDirectory && subrDirectory.index < glyphDirectory.index) {
    subrRecord.lastIndex = subrDirectory.index + subrDirectory[0].length;
    let record: RegExpExecArray | null;
    while ((record = subrRecord.exec(content)) && record.index < glyphDirectory.index) {
      const length = Number(record[2]);
      subrs.set(Number(record[1]), binary(subrRecord.lastIndex, length));
      subrRecord.lastIndex += length;
    }
  }

  const glyphs = new Map<string, Uint8Array>();
  const glyphRecord = /\/([^\s/]+)\s+(\d+)\s+(?:RD|-\|)\s/g;
  let glyphRecordMatch: RegExpExecArray | null;
  glyphRecord.lastIndex = glyphDirectory.index + glyphDirectory[0].length;
  while ((glyphRecordMatch = glyphRecord.exec(content))) {
    const length = Number(glyphRecordMatch[2]);
    glyphs.set(glyphRecordMatch[1]!, binary(glyphRecord.lastIndex, length));
    glyphRecord.lastIndex += length;
  }
  if (!glyphs.size) invalid('Type 1 font has no glyph programs.');

  const encoding = new Map<number, string>();
  for (const match of clear.matchAll(/\bdup\s+(\d+)\s+\/([^\s/]+)\s+put\b/g))
    encoding.set(Number(match[1]), match[2]!);
  return { subrs, glyphs, encoding };
}
