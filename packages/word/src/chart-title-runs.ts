import diff from 'fast-diff';
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
  const segments: { start: number; end: number; source: number; equal: boolean }[] = [];
  let from = 0, to = 0, replacement: number | undefined;
  for (const [operation, text] of diff(before, after)) {
    if (operation === diff.DELETE) { replacement ??= from; from += text.length; continue; }
    segments.push({ start: to, end: to + text.length, source: operation === diff.EQUAL ? from : replacement ?? from, equal: operation === diff.EQUAL });
    to += text.length;
    if (operation === diff.EQUAL) { from += text.length; replacement = undefined; }
  }
  const originalBoundaries = [...new Set(old.flatMap(run => [run.start, run.end]))];
  let oldBoundary = 0;
  const boundaries: number[] = [];
  for (const segment of segments) {
    boundaries.push(segment.start);
    if (segment.equal) {
      while (oldBoundary < originalBoundaries.length && originalBoundaries[oldBoundary]! <= segment.source) oldBoundary++;
      while (oldBoundary < originalBoundaries.length && originalBoundaries[oldBoundary]! < segment.source + segment.end - segment.start) boundaries.push(segment.start + originalBoundaries[oldBoundary++]! - segment.source);
    }
    boundaries.push(segment.end);
  }
  offset = 0;
  let boundaryIndex = 0, sourceIndex = 0, segmentIndex = 0;
  const sourceAt = (at: number) => {
    while (segmentIndex < segments.length - 1 && segments[segmentIndex]!.end <= at) segmentIndex++;
    const segment = segments[segmentIndex];
    const position = segment ? segment.source + (segment.equal ? at - segment.start : 0) : 0;
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
      while (boundaryIndex < boundaries.length && boundaries[boundaryIndex]! < end) { const boundary = boundaries[boundaryIndex++]!; if (boundary > points.at(-1)!) points.push(boundary); }
      points.push(end);
      const pieces: { run: typeof run; source: ReturnType<typeof sourceAt> }[] = [];
      points.slice(0, -1).forEach((at, index) => {
        const source = sourceAt(at), text = run.text.slice(at - start, points[index + 1]! - start);
        const previous = pieces.at(-1);
        if (previous && previous.source === source) previous.run = { ...previous.run, text: previous.run.text + text };
        else pieces.push({ run: { ...run, text }, source });
      });
      return pieces;
    });
    offset++;
    return { paragraph, runs };
  });
}
