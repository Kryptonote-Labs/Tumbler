/** Reject Unicode that XML 1.0 cannot represent before serializing or editing. */
export function validateXmlText(value: string): void {
  if (!value.isWellFormed()) throw new TypeError('Text contains unpaired UTF-16 surrogates.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) throw new TypeError('Text contains characters not supported by XML.');
}

/** Text edits and direct formatting share UTF-16 grapheme boundaries. */
export function validateWordTextOffset(text: string, offset: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) throw new RangeError("A Word text offset is outside its paragraph.");
  if (!graphemeBoundaries(text).has(offset)) throw new RangeError("A Word text offset cannot split a grapheme cluster.");
}

function graphemeBoundaries(value: string): ReadonlySet<number> {
  const boundaries = new Set<number>([0, value.length]);
  const Segmenter = Intl.Segmenter;
  if (Segmenter === undefined) {
    let offset = 0;
    for (const scalar of value) {
      offset += scalar.length;
      boundaries.add(offset);
    }
    return boundaries;
  }
  for (const segment of new Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
    boundaries.add(segment.index);
    boundaries.add(segment.index + segment.segment.length);
  }
  return boundaries;
}

