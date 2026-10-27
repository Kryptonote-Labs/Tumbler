/** Reject Unicode that XML 1.0 cannot represent before serializing or editing. */
export function validateXmlText(value: string): void {
  if (!value.isWellFormed()) throw new TypeError('Text contains unpaired UTF-16 surrogates.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) throw new TypeError('Text contains characters not supported by XML.');
}

// Reuse ICU's segmenter, without retaining paragraph strings or boundary sets.
let graphemeSegmenter: Intl.Segmenter | undefined;

/** Text edits and direct formatting share UTF-16 grapheme boundaries. */
export function validateWordTextOffset(text: string, offset: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) throw new RangeError("A Word text offset is outside its paragraph.");
  if (offset === 0 || offset === text.length) return;
  // Check the preceding cluster's end with one lookup, without enumerating clusters.
  // Bun 1.3.14 can misreport containing(offset) at a leading surrogate.
  // Keep the existing scalar-boundary fallback on runtimes without Segmenter.
  graphemeSegmenter ??= typeof Intl.Segmenter === 'undefined'
    ? undefined : new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const previous = graphemeSegmenter?.segment(text).containing(offset - 1);
  const boundary = graphemeSegmenter === undefined
    ? !(text.charCodeAt(offset - 1) >= 0xd800 && text.charCodeAt(offset - 1) <= 0xdbff &&
        text.charCodeAt(offset) >= 0xdc00 && text.charCodeAt(offset) <= 0xdfff)
    : previous !== undefined && previous.index + previous.segment.length === offset;
  if (!boundary) throw new RangeError("A Word text offset cannot split a grapheme cluster.");
}
