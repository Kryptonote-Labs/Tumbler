import type { WordBlock, WordParagraph } from './document.ts';
import type { ComputedWordParagraphFormat } from './styles.ts';
import type { PreparedParagraph } from './layout.ts';

/** Resolve the extra gap between line boxes, whose heights already include line spacing.
 * ECMA-376 17.3.1.9 subtracts each contextual contribution AFTER taking the maximum.
 */
export function paragraphGap(previous: ComputedWordParagraphFormat | undefined, current: ComputedWordParagraphFormat): number {
  if (!previous) return current.spacingBeforeTwips;
  const after = previous.spacingAfterTwips;
  const before = current.spacingBeforeTwips;
  const sameStyle = previous.styleId === current.styleId;
  return Math.max(0, Math.max(after, before)
    - (sameStyle && previous.contextualSpacing ? after : 0)
    - (sameStyle && current.contextualSpacing ? before : 0));
}

/** Assign an adjacent gap to the following paragraph, once, before measuring or placing it.
 * Copy the format, leaving cached paragraph preparation and authored properties untouched.
 */
export function withParagraphSpacing<T extends Pick<PreparedParagraph, 'format'>>(
  prepared: T,
  blocks: readonly WordBlock[],
  index: number,
  format: (paragraph: WordParagraph) => ComputedWordParagraphFormat,
): T {
  const previous = blocks[index - 1];
  const next = blocks[index + 1];
  const before = paragraphGap(previous?.kind === 'paragraph' ? format(previous) : undefined, prepared.format);
  const after = next?.kind === 'paragraph' ? 0 : prepared.format.spacingAfterTwips;
  if (before === prepared.format.spacingBeforeTwips && after === prepared.format.spacingAfterTwips) return prepared;
  return { ...prepared, spacingBeforeAtStartTwips: prepared.format.spacingBeforeTwips, format: { ...prepared.format, spacingBeforeTwips: before, spacingAfterTwips: after } };
}
