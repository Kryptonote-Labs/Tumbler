/** One contiguous replacement bounded by whole graphemes, suitable for plain-text inputs. */
export function textReplacement(
  before: string,
  after: string,
): { start: number; end: number; value: string } | undefined {
  if (!before.isWellFormed() || !after.isWellFormed())
    throw new TypeError('Text must be well-formed Unicode.');
  if (before === after) return undefined;
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  const previous = Array.from(segmenter.segment(before)),
    next = Array.from(segmenter.segment(after));
  let prefix = 0;
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix]!.segment === next[prefix]!.segment
  )
    prefix++;
  let oldEnd = previous.length,
    newEnd = next.length;
  while (
    oldEnd > prefix &&
    newEnd > prefix &&
    previous[oldEnd - 1]!.segment === next[newEnd - 1]!.segment
  ) {
    oldEnd--;
    newEnd--;
  }
  return {
    start: previous[prefix]?.index ?? before.length,
    end: previous[oldEnd]?.index ?? before.length,
    value: after.slice(next[prefix]?.index ?? after.length, next[newEnd]?.index ?? after.length),
  };
}
