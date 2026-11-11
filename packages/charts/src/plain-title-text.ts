import type { ChartTextParagraph } from './model.ts';
import diff from 'fast-diff';

type Run = ChartTextParagraph['runs'][number];
type Token = { readonly kind: 'run'; readonly run: Run; readonly text: string; readonly paragraph: ChartTextParagraph }
  | { readonly kind: 'paragraph'; readonly paragraph: ChartTextParagraph };

/** Replace plain text without resetting the styles of unchanged runs and paragraphs. */
export function replacePlainChartTitle(paragraphs: readonly ChartTextParagraph[], text: string): readonly ChartTextParagraph[] {
  const original = paragraphs.map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n');
  if (text === original) return paragraphs;
  if (!paragraphs.length) return text.split('\n').map(text => ({ runs: [{ text }] }));
  const changes: { start: number; end: number; text: string }[] = [];
  let offset = 0, current: typeof changes[number] | undefined;
  for (const [operation, value] of diff(original, text)) {
    if (operation === diff.EQUAL) { current = undefined; offset += value.length; continue; }
    if (!current) { current = { start: offset, end: offset, text: '' }; changes.push(current); }
    if (operation === diff.DELETE) { offset += value.length; current.end = offset; }
    else current.text += value;
  }
  // Apply disjoint edits from the end so original run/paragraph coordinates remain valid.
  let result = paragraphs;
  for (const change of changes.reverse()) result = replaceTitleRange(result, change.start, change.end, change.text);
  return result;
}

function replaceTitleRange(paragraphs: readonly ChartTextParagraph[], start: number, end: number, text: string): readonly ChartTextParagraph[] {
  const before: Token[] = [], after: Token[] = [];
  let offset = 0;
  let anchor: Extract<Token, { kind: 'run' }> | undefined;
  let current = paragraphs[0]!;
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index) {
      const boundary: Token = { kind: 'paragraph', paragraph };
      if (offset < start) { before.push(boundary); current = paragraph; }
      else if (offset >= end) after.push(boundary);
      offset++;
    }
    for (const run of paragraph.runs) {
      const token = { kind: 'run' as const, run, text: run.text, paragraph };
      const limit = offset + run.text.length;
      if (limit <= start) { before.push(token); current = paragraph; }
      else {
        if (!anchor && offset <= start && start < limit && run.sourceWrapper?.localName !== 'br') anchor = token;
        if (offset < start) before.push({ ...token, text: run.text.slice(0, start - offset) });
        if (offset >= end) after.push(token);
        else if (limit > end) after.push({ ...token, text: run.text.slice(end - offset) });
      }
      offset = limit;
    }
  }
  // An insertion at a paragraph edge inherits that paragraph, not a later one.
  anchor ??= [...before].reverse().find((token): token is Extract<Token, { kind: 'run' }> => token.kind === 'run' && token.paragraph === current);
  const replacement = text.split('\n');
  const inherited = anchor?.paragraph ?? current;
  const { sourceWrapper: _wrapper, runs: _runs, ...properties } = inherited;
  const inserted: Token[] = replacement.flatMap((part, index) => {
    const run = anchor?.run.sourceWrapper?.localName === 'br' ? { text: '', ...(anchor.run.style ? { style: anchor.run.style } : {}) } : anchor?.run ?? { text: '' };
    const token: Token = { kind: 'run', run, text: part, paragraph: inherited };
    const paragraph: ChartTextParagraph = { ...properties, runs: [] };
    return index ? [{ kind: 'paragraph' as const, paragraph }, token] : [token];
  });
  const result: ChartTextParagraph[] = [];
  let paragraph = paragraphs[0]!;
  let runs: Run[] = [];
  let previous: Run | undefined;
  const wrappers = new Set<Run>();
  for (const token of [...before, ...inserted, ...after]) {
    if (token.kind === 'paragraph') {
      result.push({ ...paragraph, runs }); paragraph = token.paragraph; runs = []; previous = undefined;
    } else if (previous === token.run && runs.length) {
      runs[runs.length - 1] = { ...runs.at(-1)!, text: runs.at(-1)!.text + token.text };
    } else {
      // A split field keeps its native identity once; new fragments are ordinary styled runs.
      const { sourceWrapper, ...ordinary } = token.run;
      runs.push({ ...(wrappers.has(token.run) ? ordinary : token.run), text: token.text });
      wrappers.add(token.run); previous = token.run;
    }
  }
  result.push({ ...paragraph, runs });
  return result;
}
