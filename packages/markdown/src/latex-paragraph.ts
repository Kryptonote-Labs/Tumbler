import type { Node } from 'prosemirror-model';

export type LatexInlineFlow = 'no-indent' | 'line-break';

export function latexInlineFlow(source: string): LatexInlineFlow | undefined {
  switch (source.trim()) {
    case '\\noindent':
      return 'no-indent';
    case '\\\\':
    case '\\\\*':
    case '\\newline':
      return 'line-break';
  }
}

type RunRange = { from: number; to: number; position: number };
type TextRun = RunRange & { kind: 'text'; bold: boolean; italic: boolean };
type InlineBox = RunRange & { kind: 'math' };

export type LatexParagraphSegment = { text: string; runs: (TextRun | InlineBox)[] };

/** Project native inline content to measured text, retaining offsets into the editable node. */
export function latexParagraphText(node: Node) {
  if (node.type.name !== 'paragraph') return;
  const segments: LatexParagraphSegment[] = [{ text: '', runs: [] }];
  let noIndent = false;
  let supported = true;
  node.forEach((child, position) => {
    if (!supported) return;
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
    if (child.type.name === 'latex_math') {
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
      child.marks.some((mark) => !['strong', 'em', 'latex_style'].includes(mark.type.name))
    ) {
      supported = false;
      return;
    }
    const from = segment.text.length;
    segment.text += content;
    const bold = child.marks.some(
      (mark) => mark.type.name === 'strong' || mark.attrs.style === 'strong',
    );
    const italic = child.marks.some((mark) => mark.type.name === 'em' || mark.attrs.style === 'em');
    segment.runs.push({ kind: 'text', from, to: segment.text.length, position, bold, italic });
  });
  if (supported) return { segments, noIndent };
}
