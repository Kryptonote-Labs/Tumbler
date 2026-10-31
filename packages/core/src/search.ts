export interface TextMatch {
  start: number;
  end: number;
}
export interface TextSearchOptions {
  readonly matchCase?: boolean;
  readonly wholeWord?: boolean;
  readonly locale?: string;
}
/** Literal, Unicode-aware search. Results never split graphemes or cross object placeholders. */
export function findTextMatches(
  value: string,
  query: string,
  options: TextSearchOptions = {},
): TextMatch[] {
  if (!query || !query.isWellFormed() || /[\n\r\uFFFC]/u.test(query)) return [];
  const offsets = new Map<number, number>();
  let normalized = '';
  for (const segment of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(value)) {
    offsets.set(normalized.length, segment.index);
    normalized += segment.segment.normalize('NFC');
  }
  offsets.set(normalized.length, value.length);
  query = query.normalize('NFC');
  const words = options.wholeWord ? new Set<number>([normalized.length]) : undefined;
  if (words)
    for (const segment of new Intl.Segmenter(options.locale ?? 'und', {
      granularity: 'word',
    }).segment(normalized)) {
      words.add(segment.index);
      words.add(segment.index + segment.segment.length);
    }
  const expression = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    options.matchCase ? 'gu' : 'giu',
  );
  const matches: TextMatch[] = [];
  for (const match of normalized.matchAll(expression)) {
    const start = match.index,
      end = start + match[0].length;
    const originalStart = offsets.get(start),
      originalEnd = offsets.get(end);
    if (
      originalStart !== undefined &&
      originalEnd !== undefined &&
      (!words || (words.has(start) && words.has(end)))
    )
      matches.push({ start: originalStart, end: originalEnd });
  }
  return matches;
}
