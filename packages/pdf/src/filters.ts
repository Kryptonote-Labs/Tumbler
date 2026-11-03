import { unzlibSync } from 'fflate';
import { array, dictionary, integer, invalid, name, PdfName, type PdfDictionary, type PdfValue, unsupported } from './objects.ts';

function asciiHex(bytes: Uint8Array) {
  const hex = new TextDecoder().decode(bytes).replace(/[\x00\t\n\f\r ]/g, '').split('>')[0]!;
  if (!/^[\da-f]*$/i.test(hex)) return invalid('Invalid ASCIIHex stream.');
  const padded = hex.length % 2 ? `${hex}0` : hex;
  return Uint8Array.from({ length: padded.length / 2 }, (_, i) => parseInt(padded.slice(i * 2, i * 2 + 2), 16));
}
function ascii85(bytes: Uint8Array) {
  const result: number[] = [], group: number[] = [];
  const flush = (length: number) => {
    while (group.length < 5) group.push(84);
    let value = 0;
    for (const digit of group) value = value * 85 + digit;
    if (value > 0xffffffff) return invalid('ASCII85 group overflow.');
    for (let i = 0; i < length; i++) result.push((value >>> (24 - i * 8)) & 255);
    group.length = 0;
  };
  for (const byte of bytes) {
    if ([0, 9, 10, 12, 13, 32].includes(byte)) continue;
    if (byte === 126) break;
    if (byte === 122) { if (group.length) return invalid('ASCII85 z inside a group.'); result.push(0, 0, 0, 0); continue; }
    if (byte < 33 || byte > 117) return invalid('Invalid ASCII85 digit.');
    group.push(byte - 33);
    if (group.length === 5) flush(4);
  }
  if (group.length === 1) return invalid('Truncated ASCII85 group.');
  if (group.length) flush(group.length - 1);
  return Uint8Array.from(result);
}
function runLength(bytes: Uint8Array) {
  const result: number[] = [];
  for (let at = 0; at < bytes.length;) {
    const length = bytes[at++]!;
    if (length === 128) return Uint8Array.from(result);
    if (length < 128) {
      if (at + length + 1 > bytes.length) return invalid('Truncated RunLength stream.');
      for (let i = 0; i <= length; i++) result.push(bytes[at++]!);
    } else {
      if (at >= bytes.length) return invalid('Truncated RunLength repeat.');
      const value = bytes[at++]!;
      for (let i = 0; i < 257 - length; i++) result.push(value);
    }
  }
  return invalid('RunLength stream has no EOD marker.');
}
function lzw(bytes: Uint8Array, earlyChange: number) {
  let table: number[][] = [], width = 9, bit = 0, previous: number[] | undefined;
  const output: number[] = [];
  const reset = () => { table = Array.from({ length: 258 }, (_, i) => i < 256 ? [i] : []); width = 9; previous = undefined; };
  reset();
  while (bit + width <= bytes.length * 8) {
    let code = 0;
    for (let i = 0; i < width; i++, bit++) code = code * 2 + ((bytes[bit >> 3]! >> (7 - (bit & 7))) & 1);
    if (code === 256) { reset(); continue; }
    if (code === 257) return Uint8Array.from(output);
    const current = table[code] ?? (code === table.length && previous ? [...previous, previous[0]!] : undefined);
    if (!current?.length) return invalid('Invalid LZW code.');
    for (const value of current) output.push(value);
    if (previous && table.length < 4096) {
      table.push([...previous, current[0]!]);
      if (table.length + earlyChange === 2 ** width && width < 12) width++;
    }
    previous = current;
  }
  return invalid('Truncated LZW stream.');
}
function predict(bytes: Uint8Array, params: PdfDictionary) {
  const predictor = integer(params.get('Predictor'), 1);
  if (predictor === 1) return bytes;
  const colors = integer(params.get('Colors'), 1), bits = integer(params.get('BitsPerComponent'), 8), columns = integer(params.get('Columns'), 1);
  if (colors < 1 || columns < 1 || ![1, 2, 4, 8, 16].includes(bits)) return invalid('Invalid predictor dimensions.');
  const rowLength = Math.ceil(colors * bits * columns / 8), bpp = Math.max(1, Math.ceil(colors * bits / 8));
  if (predictor === 2) {
    if (bits !== 8) return unsupported('TIFF predictors with non-8-bit samples require packed-sample reconstruction.');
    if (bytes.length % rowLength) return invalid('Truncated TIFF predictor row.');
    const result = bytes.slice();
    for (let start = 0; start < result.length; start += rowLength) for (let i = bpp; i < rowLength; i++) result[start + i] = (result[start + i]! + result[start + i - bpp]!) & 255;
    return result;
  }
  if (predictor < 10 || predictor > 15 || bytes.length % (rowLength + 1)) return invalid('Invalid PNG predictor rows.');
  const result = new Uint8Array(bytes.length / (rowLength + 1) * rowLength);
  for (let source = 0, row = 0; source < bytes.length; row++) {
    const filter = bytes[source++]!;
    if (filter > 4) return invalid('Invalid PNG predictor filter.');
    const start = row * rowLength;
    for (let x = 0; x < rowLength; x++) {
      const left = x < bpp ? 0 : result[start + x - bpp]!;
      const up = row ? result[start + x - rowLength]! : 0;
      const upperLeft = row && x >= bpp ? result[start + x - rowLength - bpp]! : 0;
      const p = left + up - upperLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
      const delta = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      result[start + x] = (bytes[source++]! + delta) & 255;
    }
  }
  return result;
}

/** ISO 32000-1 7.4. Image-specific codecs remain encoded for the host image decoder. */
export function decodePdfStream(encoded: Uint8Array, info: PdfDictionary, resolve: (value: PdfValue) => PdfValue = value => value): Uint8Array {
  const filter = info.get('Filter');
  if (filter === undefined) return encoded;
  const filters = resolve(filter) instanceof PdfName ? [resolve(filter)] : array(resolve(filter));
  const rawParams = info.get('DecodeParms');
  const params = rawParams === undefined ? [] : Array.isArray(resolve(rawParams)) ? array(resolve(rawParams)) : [resolve(rawParams)];
  let bytes = encoded;
  for (const [index, item] of filters.entries()) {
    const parameter = params[index];
    const options = parameter == null ? new Map<string, PdfValue>() : dictionary(resolve(parameter));
    switch (name(item)) {
      case 'FlateDecode': case 'Fl': bytes = predict(unzlibSync(bytes), options); break;
      case 'ASCIIHexDecode': case 'AHx': bytes = asciiHex(bytes); break;
      case 'ASCII85Decode': case 'A85': bytes = ascii85(bytes); break;
      case 'RunLengthDecode': case 'RL': bytes = runLength(bytes); break;
      case 'LZWDecode': case 'LZW': bytes = predict(lzw(bytes, integer(options.get('EarlyChange'), 1)), options); break;
      default: return unsupported(`PDF stream filter /${name(item)} needs its image/security codec.`);
    }
  }
  return bytes;
}
