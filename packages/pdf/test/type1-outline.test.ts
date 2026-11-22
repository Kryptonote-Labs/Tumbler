import { expect, test } from 'bun:test';
import { type1Outline } from '../src/type1-outline.ts';
import { readType1Program } from '../src/type1-program.ts';

const bytes = (value: string) => new TextEncoder().encode(value);
function encrypt(input: Uint8Array, seed: number) {
  return Uint8Array.from([0, 0, 0, 0, ...input], (byte) => {
    const cipher = byte ^ (seed >>> 8);
    seed = ((cipher + seed) * 52845 + 22719) & 65535;
    return cipher;
  });
}

test('an embedded Type 1 font decodes its encoding and paints the encrypted glyph outline', () => {
  const header = bytes(
    '%!PS-AdobeFont-1.0\n/Encoding 256 array\ndup 65 /sample put\ncurrentfile eexec\n',
  );
  const glyph = encrypt(
    Uint8Array.of(139, 248, 136, 13, 139, 139, 21, 239, 6, 239, 7, 39, 6, 9, 14),
    4330,
  );
  const body = encrypt(
    Uint8Array.from([
      ...bytes('/Subrs 0 array\n/CharStrings 1 dict dup begin\n/sample ' + glyph.length + ' RD '),
      ...glyph,
      ...bytes(' ND\nend\n'),
    ]),
    55665,
  );
  const font = readType1Program(Uint8Array.from([...header, ...body]), header.length, body.length);
  expect(font.encoding.get(65)).toBe('sample');
  expect(type1Outline(font, 'sample')).toBe('M0 0 L100 0 L100 100 L0 100 Z');
});
