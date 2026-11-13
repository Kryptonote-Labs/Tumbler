import type { WordContentBlock } from './create-content.ts';
import type { WordTextParagraph, WordTextRun } from './create.ts';

export type WordNativeParagraph = Extract<WordContentBlock, { kind: 'paragraph' }> & { readonly id: string };
export interface WordNativePosition {
  readonly paragraphId: string;
  readonly offset: number;
  /** At a wrap/run boundary, before uses following text and after uses preceding text. */
  readonly affinity?: 'before' | 'after';
}
export interface WordNativeSelection { readonly anchor: WordNativePosition; readonly focus: WordNativePosition }

export function nativeParagraphs(blocks: readonly WordContentBlock[]): WordNativeParagraph[] {
  return blocks.flatMap(block => block.kind === 'paragraph'
    ? [block as WordNativeParagraph]
    : block.kind === 'table' ? block.rows.flatMap(row => row.flatMap(cell => nativeParagraphs(cell.blocks))) : []);
}

export function paragraphText(paragraph: WordTextParagraph): string {
  return paragraph.runs.map(run => run.text).join('');
}

export function orderedNativeSelection(blocks: readonly WordContentBlock[], selection: WordNativeSelection) {
  const paragraphs = nativeParagraphs(blocks);
  const locate = (position: WordNativePosition) => {
    const index = paragraphs.findIndex(paragraph => paragraph.id === position.paragraphId);
    const paragraph = paragraphs[index];
    if (!paragraph || !Number.isSafeInteger(position.offset) || position.offset < 0 || position.offset > paragraphText(paragraph).length)
      throw new RangeError('Selection is outside the document.');
    const boundaries = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(paragraphText(paragraph));
    if (position.offset !== paragraphText(paragraph).length && ![...boundaries].some(segment => segment.index === position.offset))
      throw new RangeError('Selection must be at a grapheme boundary.');
    return index;
  };
  const anchor = locate(selection.anchor);
  const focus = locate(selection.focus);
  return anchor < focus || anchor === focus && selection.anchor.offset <= selection.focus.offset
    ? { start: selection.anchor, end: selection.focus, paragraphs: paragraphs.slice(anchor, focus + 1) }
    : { start: selection.focus, end: selection.anchor, paragraphs: paragraphs.slice(focus, anchor + 1) };
}

/** Retain source identities and atomic inline content when slicing rich runs. */
export function sliceNativeRuns(runs: readonly WordTextRun[], start: number, end: number): WordTextRun[] {
  let offset = 0;
  return runs.flatMap(run => {
    const from = Math.max(0, start - offset);
    const to = Math.min(run.text.length, end - offset);
    offset += run.text.length;
    return to <= from ? [] : [{ ...run, text: run.text.slice(from, to) }];
  });
}

/** Replace paragraphs only within the same block list. Cross-cell structural edits need table commands. */
export function replaceNativeParagraphs(
  blocks: readonly WordContentBlock[], ids: readonly string[], replacement: readonly WordContentBlock[],
): readonly WordContentBlock[] {
  const start = blocks.findIndex(block => block.kind === 'paragraph' && block.id === ids[0]);
  if (start >= 0) {
    if (!ids.every((id, index) => { const block = blocks[start + index]; return block?.kind === 'paragraph' && block.id === id; }))
      throw new RangeError('Text replacement cannot cross table or image boundaries.');
    return [...blocks.slice(0, start), ...replacement, ...blocks.slice(start + ids.length)];
  }
  return blocks.map(block => block.kind === 'table'
    ? { ...block, rows: block.rows.map(row => row.map(cell => ({ ...cell, blocks: replaceNativeParagraphs(cell.blocks, ids, replacement) }))) }
    : block);
}
