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
export function widowGroupHeight(lines: ParagraphLineSequence, index: number, capacity: number): number {
  const current = lines.get(index);
  const next = lines.get(index + 1);
  if (!current || !next || current.breakAfter === "page" || current.breakAfter === "column") return 0;
  const third = lines.get(index + 2);
  if (index !== 0 && third) return 0;
  const pair = current.ascent + current.descent + next.ascent + next.descent;
  // Splitting three lines 2+1 or 1+2 violates one end. Keep all three if possible.
  if (index === 0 && third && !lines.get(index + 3) && next.breakAfter !== "page" && next.breakAfter !== "column") {
    const triple = pair + third.ascent + third.descent;
    if (triple <= capacity) return triple;
  }
  return pair;
}
