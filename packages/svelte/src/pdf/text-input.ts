export type PdfInputSelection = { start: number; end: number };
/** Native selections disambiguate edits to repeated text without replacing neighbouring CRDT characters. */
export function pdfTextInputChange(
  before: string,
  after: string,
  previous?: PdfInputSelection,
  current?: PdfInputSelection,
) {
  const prefix =
    previous && current
      ? Math.min(previous.start, current.start)
      : Math.min(before.length, after.length);
  let start = 0;
  while (
    start < prefix &&
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  if (start > 0 && /[\ud800-\udbff]/.test(before[start - 1]!)) start--;
  const suffix = Math.min(
    before.length - start,
    after.length - start,
    previous ? before.length - previous.end : before.length,
    current ? after.length - current.end : after.length,
  );
  let tail = 0;
  while (tail < suffix && before[before.length - tail - 1] === after[after.length - tail - 1])
    tail++;
  if (tail > 0 && /[\udc00-\udfff]/.test(before[before.length - tail]!)) tail--;
  return { start, end: before.length - tail, insert: after.slice(start, after.length - tail) };
}
