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

const adjusted = new WeakMap<ComputedWordParagraphFormat, { before: number; after: number; value: ComputedWordParagraphFormat }>();

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
  const immutable = Object.isFrozen(prepared.format);
  const previousFormat = immutable ? adjusted.get(prepared.format) : undefined;
  const value = previousFormat?.before === before && previousFormat.after === after ? previousFormat.value :
    Object.freeze({ ...prepared.format, spacingBeforeTwips: before, spacingAfterTwips: after });
  if (immutable && value !== previousFormat?.value) adjusted.set(prepared.format, { before, after, value });
  return { ...prepared, spacingBeforeAtStartTwips: prepared.format.spacingBeforeTwips, format: value };
}
