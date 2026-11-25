import { readLatexPageDirective } from './latex-flow';
import { latexLength } from './latex-lengths';
import { commandEnd, groupAt, whitespaceEnd } from './latex-syntax';
import { latexMeasureFraction } from './latex-text-layout';
import type { Node } from 'prosemirror-model';

export type LatexInlineFlow = 'no-indent' | 'line-break';

export function latexInlineFlow(source: string): LatexInlineFlow | undefined {
  if (latexLineBreakSkip(source) !== undefined) return 'line-break';
  switch (source.trim()) {
    case '\\noindent':
      return 'no-indent';
    case '\\\\':
    case '\\\\*':
    case '\\newline':
      return 'line-break';
  }
}

/** A line end with an authored vertical skip. */
export function latexLineBreakSkip(source: string, em?: number, leading = 0) {
  const match = /^\\\\\*?\s*\[([^\]]*)\]\s*$/.exec(source.trim());
  const baseline = match && /^([-+]?\d*\.?\d+)\s*\\baselineskip$/.exec(match[1]!.trim());
  if (baseline) return Number(baseline[1]) * leading;
  return match && /^[-+]?\d*\.?\d+\s*em$/.test(match[1]!.trim()) && em === undefined
    ? 0
    : match ? latexLength(match[1], em) : undefined;
}

export function latexInlineRule(source: string, em = 10 * 96 / 72.27) {
  const start = whitespaceEnd(source, 0);
  const command = commandEnd(source, start);
  if (source.slice(start, command) !== '\\rule') return;
  const at = whitespaceEnd(source, command);
  const raised = groupAt(source, at, '[', ']');
  const width = groupAt(source, whitespaceEnd(source, raised?.end ?? at));
  const height = width && groupAt(source, whitespaceEnd(source, width.end));
  if (!width || !height || source.slice(height.end).trim()) return;
  const widthSource = source.slice(width.from, width.to);
  const fraction = latexMeasureFraction(widthSource);
  const pixels = latexLength(widthSource, em);
  const w = fraction !== undefined ? { fraction } : pixels;
  const h = latexLength(source.slice(height.from, height.to), em);
  const raise = raised ? latexLength(source.slice(raised.from, raised.to), em) : 0;
  if (w !== undefined && h !== undefined && raise !== undefined && (pixels ?? fraction ?? -1) >= 0 && h >= 0)
    return { width: w, height: h, raise };
}

type RunRange = { from: number; to: number; position: number };
type TextRun = RunRange & { kind: 'text'; bold: boolean; italic: boolean; family?: 'sans' | 'mono' };
type InlineBox = RunRange & { kind: 'math' };

export type LatexParagraphSegment = { text: string; runs: (TextRun | InlineBox)[] };

/** Project native inline content to measured text, retaining offsets into the editable node. */
export function latexParagraphText(node: Node, resolvedInline?: (source: string) => boolean) {
  if (node.type.name !== 'paragraph') return;
  const segments: LatexParagraphSegment[] = [{ text: '', runs: [] }];
  let noIndent = false;
  let supported = true;
  node.forEach((child, position) => {
    if (!supported) return;
    // Browser line boxes account for inline boxes, scripts and font changes that the
    // plain-text line composer cannot currently measure.
    if (child.marks.some(mark => mark.type.name === 'latex_style' && (
      ['smallCaps', 'superscript', 'subscript', 'size', 'highlight'].includes(mark.attrs.style) ||
      /^\\underline\b/.test(mark.attrs.open)
    ))) {
      supported = false;
      return;
    }
    if (child.type.name === 'latex_inline') {
      const source = String(child.attrs.source).trim();
      if (source === '\\null' || /^\\label\s*\{[^{}]+\}$/.test(source) || readLatexPageDirective(source)) return;
    }
    const segment = segments.at(-1)!;
    const flow =
      child.type.name === 'hard_break'
        ? 'line-break'
        : child.type.name === 'latex_inline'
          ? latexInlineFlow(child.attrs.source)
          : undefined;
    if (flow === 'line-break') {
      segments.push({ text: '', runs: [] });
      return;
    }
    if (flow === 'no-indent') {
      if (segments.length === 1 && !segment.text.trim()) noIndent = true;
      return;
    }
    if (child.type.name === 'latex_math' ||
        (child.type.name === 'latex_inline' && child.attrs.label == null && (latexInlineRule(child.attrs.source) || resolvedInline?.(child.attrs.source)))) {
      const from = segment.text.length;
      segment.text += '\ufffc';
      segment.runs.push({ kind: 'math', from, to: from + 1, position });
      return;
    }
    const content = child.isText
      ? child.text
      : child.type.name === 'latex_inline'
        ? child.attrs.label
        : undefined;
    if (
      typeof content !== 'string' ||
      content.length !== child.nodeSize ||
      /[\u0590-\u08ff\u3000-\u9fff]/.test(content) ||
      child.marks.some((mark) => !['strong', 'em', 'latex_style', 'latex_link'].includes(mark.type.name))
    ) {
      supported = false;
      return;
    }
    const from = segment.text.length;
    segment.text += content;
    const normal = child.marks.findLastIndex((mark) => mark.attrs.style === 'normal');
    const marks = normal < 0 ? child.marks : child.marks.slice(normal + 1);
    const bold = marks.some((mark) => mark.type.name === 'strong' || mark.attrs.style === 'strong');
    const italic = marks.some((mark) => mark.type.name === 'em' || mark.attrs.style === 'em');
    const family = marks.findLast((mark) => mark.attrs.style === 'sans' || mark.attrs.style === 'mono')?.attrs.style;
    segment.runs.push({ kind: 'text', from, to: segment.text.length, position, bold, italic, family });
  });
  if (supported) return { segments, noIndent };
}
