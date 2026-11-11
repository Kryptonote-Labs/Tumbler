import type { ChartModel } from '@tumblerjs/charts';
import type { WordTextParagraph } from './create.ts';

/** Word's editor can merge runs with identical RGB formatting. Keep DrawingML source boundaries
 * so distinct theme transforms and opacity still belong to their original, unchanged text.
 */
export function chartTitleRuns(paragraphs: readonly WordTextParagraph[], previous?: ChartModel) {
  const old: { start: number; end: number; paragraph: number; run: number }[] = [];
  let offset = 0;
  previous?.titleText?.forEach((paragraph, p) => {
    paragraph.runs.forEach((run, r) => { old.push({ start: offset, end: offset + run.text.length, paragraph: p, run: r }); offset += run.text.length; });
    offset++;
  });
  const before = previous?.titleText?.map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n') ?? '';
  const after = paragraphs.map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n');
  let prefix = 0, suffix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before.at(-suffix - 1) === after.at(-suffix - 1)) suffix++;
  if (prefix && /[\uD800-\uDBFF]/.test(before[prefix - 1]!) && /[\uDC00-\uDFFF]/.test(before[prefix] ?? '')) prefix--;
  if (suffix && /[\uDC00-\uDFFF]/.test(before[before.length - suffix]!) && /[\uD800-\uDBFF]/.test(before[before.length - suffix - 1] ?? '')) suffix--;
  const delta = after.length - before.length;
  const changedEnd = after.length - suffix;
  const sourcePosition = (position: number) => position < prefix ? position : position >= changedEnd ? position - delta : prefix;
  const boundaries = [...new Set(old.flatMap(run => [run.start, run.end]).map(position => position <= prefix ? position : position >= before.length - suffix ? position + delta : prefix))];
  offset = 0;
  let boundaryIndex = 0, sourceIndex = 0;
  const sourceAt = (at: number) => {
    const position = sourcePosition(at);
    while (sourceIndex < old.length && old[sourceIndex]!.end <= position) sourceIndex++;
    const candidate = old[sourceIndex];
    return candidate && candidate.start <= position ? candidate : old[Math.max(0, sourceIndex - 1)] ?? old.at(-1);
  };
  return paragraphs.map(paragraph => {
    const runs = paragraph.runs.flatMap(run => {
      const start = offset, end = start + run.text.length;
      offset = end;
      if (!run.text.length) return [{ run, source: old[0] }];
      while (boundaryIndex < boundaries.length && boundaries[boundaryIndex]! <= start) boundaryIndex++;
      const points = [start];
      while (boundaryIndex < boundaries.length && boundaries[boundaryIndex]! < end) points.push(boundaries[boundaryIndex++]!);
      points.push(end);
      return points.slice(0, -1).map((at, index) => {
        const source = sourceAt(at);
        return { run: { ...run, text: run.text.slice(at - start, points[index + 1]! - start) }, source };
      });
    });
    offset++;
    return { paragraph, runs };
  });
}
