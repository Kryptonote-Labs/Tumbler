import { z } from 'zod';

function ranges(selection: string): [number, number][] {
  return selection.split(',').map((part) => {
    const match = /^\s*([0-9]+)\s*(?:-\s*([0-9]+)\s*)?$/.exec(part);
    if (!match) throw new Error('Use comma-separated page numbers or ranges, such as 5,2-4.');
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (![start, end].every((n) => Number.isSafeInteger(n) && n > 0))
      throw new Error('PDF page numbers must be positive safe integers (starting at 1).');
    return [start, end];
  });
}

export const pdfExportInput = z.object({
  pages: z.string().refine((value) => {
    try {
      ranges(value);
      return true;
    } catch {
      return false;
    }
  }, 'Use positive page numbers or ranges, such as 5,2-4.').optional(),
  output: z.string().min(1),
  format: z.literal('pdf').default('pdf'),
}).strict();
export const pdfDeletePagesInput = pdfExportInput.pick({ pages: true }).required();
export type PdfDeletePagesInput = z.infer<typeof pdfDeletePagesInput>;
export type PdfExportInput = z.infer<typeof pdfExportInput>;

/** Expand 1-based selections without sorting; descending ranges follow their written direction. */
export function pdfPageIndices(selection: string, pageCount: number): number[] {
  const parts = ranges(selection);
  for (const [start, end] of parts)
    if (start > pageCount || end > pageCount)
      throw new Error(`PDF page selection is outside the document (1-${pageCount}).`);
  const indices: number[] = [],
    seen = new Set<number>();
  for (const [start, end] of parts) {
    const step = start <= end ? 1 : -1;
    for (let page = start; ; page += step) {
      if (seen.has(page)) throw new Error('PDF page selection contains duplicates.');
      seen.add(page);
      indices.push(page - 1);
      if (page === end) break;
    }
  }
  return indices;
}
