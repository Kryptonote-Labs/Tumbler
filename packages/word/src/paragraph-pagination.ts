/** Bounded lookahead contract shared with incremental paragraph preparation. */
export interface ParagraphLineSequence {
  get(index: number): { readonly ascent: number; readonly descent: number; readonly breakAfter?: string | undefined } | undefined;
  heightUntil(maxHeight: number): number;
}

/** Eager preparation adapter. The streaming producer can implement the same contract. */
export function paragraphLineSequence(lines: readonly { readonly ascent: number; readonly descent: number; readonly breakAfter?: string | undefined }[]): ParagraphLineSequence {
  return {
    get: index => lines[index],
    heightUntil(maxHeight) {
      let height = 0;
      for (const line of lines) {
        height += line.ascent + line.descent;
        if (height > maxHeight) break;
      }
      return height;
    },
  };
}

/** Keep the first and final pair together where a fresh column can hold that pair.
 * Explicit breaks win; oversized pairs fall back to ordinary line flow without retries.
 */
export function widowPairHeight(lines: ParagraphLineSequence, index: number): number {
  const current = lines.get(index);
  const next = lines.get(index + 1);
  if (!current || !next || current.breakAfter) return 0;
  if (index !== 0 && lines.get(index + 2)) return 0;
  return current.ascent + current.descent + next.ascent + next.descent;
}
