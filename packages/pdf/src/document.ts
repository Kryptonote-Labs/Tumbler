import { array, dictionary, integer, invalid, name, number, PdfReference, PdfStream, type PdfDictionary, type PdfValue } from './objects.ts';
import { PdfSource } from './source.ts';

export type PdfBox = readonly [number, number, number, number];
export interface PdfPage {
  readonly id: string;
  readonly index: number;
  readonly reference: PdfReference;
  readonly dictionary: PdfDictionary;
  readonly resources: PdfDictionary;
  readonly mediaBox: PdfBox;
  readonly cropBox: PdfBox;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly userUnit: number;
  readonly width: number;
  readonly height: number;
}
const inherited = ['Resources', 'MediaBox', 'CropBox', 'Rotate'] as const;

/** Headless document graph. Fixed pages preserve source ownership independently of a renderer. */
export class PdfDocument {
  readonly pages: readonly PdfPage[];
  constructor(readonly source: PdfSource) {
    if (name(source.catalog.get('Type')) !== 'Catalog') invalid('PDF root is not a catalog.');
    const pages: PdfPage[] = [], active = new Set<string>();
    const visit = (value: PdfValue | undefined, parent: PdfDictionary, expectedParent?: PdfReference) => {
      if (!(value instanceof PdfReference)) return invalid('Page tree nodes must be indirect objects.');
      if (active.has(value.key)) return invalid('Cyclic or multiply referenced page tree.');
      active.add(value.key);
      const entry = dictionary(source.resolve(value));
      const declaredParent = entry.get('Parent');
      if (expectedParent && (!(declaredParent instanceof PdfReference) || declaredParent.key !== expectedParent.key)) return invalid('Page-tree parent reference does not match its owner.');
      const properties = new Map(parent);
      for (const key of inherited) if (entry.has(key)) properties.set(key, entry.get(key)!);
      const kind = name(entry.get('Type'));
      if (kind === 'Pages') {
        const start = pages.length;
        for (const child of array(source.resolve(entry.get('Kids')))) visit(child, properties, value);
        if (pages.length - start !== integer(source.resolve(entry.get('Count')))) return invalid('Page-tree /Count does not match its descendants.');
      } else if (kind === 'Page') {
        const box = (value: PdfValue | undefined): PdfBox => {
          const values = array(source.resolve(value)).map(item => number(source.resolve(item)));
          if (values.length !== 4 || values[2]! <= values[0]! || values[3]! <= values[1]!) return invalid('Invalid PDF page box.');
          return [values[0]!, values[1]!, values[2]!, values[3]!];
        };
        const mediaBox = box(properties.get('MediaBox'));
        const rawCrop = properties.has('CropBox') ? box(properties.get('CropBox')) : mediaBox;
        const cropBox: PdfBox = [Math.max(mediaBox[0], rawCrop[0]), Math.max(mediaBox[1], rawCrop[1]), Math.min(mediaBox[2], rawCrop[2]), Math.min(mediaBox[3], rawCrop[3])];
        if (cropBox[2] <= cropBox[0] || cropBox[3] <= cropBox[1]) return invalid('PDF CropBox does not intersect MediaBox.');
        const rotation = ((integer(source.resolve(properties.get('Rotate') ?? 0)) % 360) + 360) % 360;
        if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return invalid('PDF page rotation is not a multiple of 90 degrees.');
        const userUnit = number(source.resolve(entry.get('UserUnit') ?? 1));
        if (userUnit <= 0 || userUnit > 75000) return invalid('PDF UserUnit is outside ISO 32000-1 table 30.');
        const width = (cropBox[2] - cropBox[0]) * userUnit, height = (cropBox[3] - cropBox[1]) * userUnit;
        pages.push({ id: value.key, index: pages.length, reference: value, dictionary: entry, resources: dictionary(source.resolve(properties.get('Resources') ?? new Map())), mediaBox, cropBox, rotation, userUnit, width: rotation % 180 ? height : width, height: rotation % 180 ? width : height });
      } else return invalid('Unexpected object in PDF page tree.');
    };
    visit(source.catalog.get('Pages'), new Map());
    this.pages = pages;
  }
  bytes() { return this.source.bytes(); }
  contents(page: PdfPage): Uint8Array {
    const value = this.source.resolve(page.dictionary.get('Contents'));
    const streams = value === null ? [] : Array.isArray(value) ? value : [value];
    const chunks = streams.map(stream => {
      if (!(this.source.resolve(stream) instanceof PdfStream)) return invalid('Page Contents is not a stream.');
      return this.source.stream(stream);
    });
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length + 1, 0));
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; bytes[at++] = 10; }
    return bytes;
  }
}
export function openPdfDocument(bytes: Uint8Array, options: { password?: string } = {}) {
  const source = new PdfSource(bytes);
  source.authenticate(options.password);
  return new PdfDocument(source);
}
