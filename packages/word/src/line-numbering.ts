import { validMeasurement } from './layout-preparation.ts';
import { z } from 'zod';
import type { WordBlock, WordParagraph, WordSectionProperties } from './document.ts';
import type { WordLayout, WordLayoutSource, WordTextMeasurer } from './layout.ts';
import { DEFAULT_TEXT } from './styles.ts';

// Word bounds and skipped-start semantics: MS-OE376 §2.1.214, https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/7b579d67-5dd6-4e60-b176-31b8157addd0
export const wordLineNumberingSchema = z.object({
  countBy: z.number().int().min(1).max(100),
  start: z.number().int().min(1).max(32768).default(1),
  distanceTwips: z.number().int().nonnegative().optional(),
  restart: z.enum(['newPage', 'newSection', 'continuous']).default('newPage'),
}).strict();
export type WordLineNumbering = z.infer<typeof wordLineNumberingSchema>;

const measurements = new WeakMap<WordTextMeasurer, Map<string, ReturnType<WordTextMeasurer['measure']>>>();

/** Number body lines after pagination. Suppressed paragraphs do not enter the count. */
export function numberWordLayout(layout: WordLayout, document: WordLayoutSource, measurer: WordTextMeasurer): WordLayout {
  const sections = new Map<number, WordSectionProperties>();
  const paragraphs = new Map<number, WordParagraph>();
  let pending: WordBlock[] = [];
  const finish = (section: WordSectionProperties) => {
    for (const block of pending) { sections.set(block.elementId, section); if (block.kind === 'paragraph') paragraphs.set(block.elementId, block); }
    pending = [];
  };
  for (const block of document.blocks) {
    pending.push(block);
    if (block.kind === 'paragraph' && block.section) finish(block.section);
  }
  finish(document.finalSection);
  if (![...sections.values()].some(section => section.lineNumbers)) return layout;
  const format = document.lineNumberFormat ?? DEFAULT_TEXT;
  let counter = 0, previous: WordSectionProperties | undefined, lastPage = -1, started = false;
  const tables = new Set<number>();
  const begin = (section: WordSectionProperties | undefined, page: number) => {
    const settings = section?.lineNumbers;
    if (settings && (!started || previous !== section && settings.restart === 'newSection' || settings.restart === 'newPage' && lastPage !== page)) {
      counter = settings.start;
      started = true;
    }
    previous = section; lastPage = page;
    return settings;
  };
  const pages = layout.pages.map(page => ({ ...page, columns: page.columns.map(column => {
    const markers = new Map<typeof column.lines[number], NonNullable<typeof column.lines[number]['lineNumber']>>();
    const events = [...column.lines.map(line => ({ y: line.y, line })), ...column.tables.map(table => ({ y: table.y, table }))].sort((a, b) => a.y - b.y);
    for (const event of events) {
      if ('table' in event) {
        const settings = begin(sections.get(event.table.tableElementId), page.index);
        // Word counts a table once, but does not number the text within its cells.
        if (settings && !tables.has(event.table.tableElementId)) counter++;
        tables.add(event.table.tableElementId);
        continue;
      }
      const line = event.line;
      const settings = begin(sections.get(line.paragraphElementId), page.index);
      const paragraph = paragraphs.get(line.paragraphElementId);
      if (!settings || !paragraph || document.paragraphFormat(paragraph).suppressLineNumbers) continue;
      const number = counter++;
      if (number % settings.countBy !== 0) continue;
      const text = String(number);
      let cache = measurements.get(measurer);
      if (!cache) { cache = new Map(); measurements.set(measurer, cache); }
      const key = JSON.stringify(format) + ':' + text;
      let metrics = cache.get(key);
      if (!metrics) { metrics = validMeasurement(measurer.measure(text, format)); cache.set(key, metrics); }
      markers.set(line, { text, x: column.x - (settings.distanceTwips ?? 360) / 20 - metrics.width,
        y: line.baseline - metrics.ascent, width: metrics.width, height: metrics.ascent + metrics.descent, baseline: line.baseline, format });
    }
    return { ...column, lines: column.lines.map(line => markers.has(line) ? { ...line, lineNumber: markers.get(line)! } : line) };
  }) }));
  return { ...layout, pages };
}
