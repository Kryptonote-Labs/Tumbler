import type { WordSectionProperties } from './document.ts';
import type { ComputedWordParagraphFormat } from './styles.ts';
import type { WordLayout } from './layout.ts';

export type WordColumnLimits = ReadonlyMap<WordSectionProperties, { readonly page: number; readonly height: number }>;

/** Reuse pagination's keep/widow/table rules while finding the shortest final column set. */
export function balanceWordColumns(initial: WordLayout, run: (limits: WordColumnLimits) => WordLayout, format: (id: number) => ComputedWordParagraphFormat | undefined): WordLayout {
  if (initial.truncated) return initial;
  const last = new Map<WordSectionProperties, { page: number; height: number; columns: number }>();
  for (const page of initial.pages) {
    const groups = new Map<WordSectionProperties, typeof page.columns[number][]>();
    for (const column of page.columns) {
      const section = column.section ?? page.section;
      const group = groups.get(section) ?? [];
      group.push(column); groups.set(section, group);
    }
    for (const [section, columns] of groups) last.set(section, { page: page.index, height: columns[0]!.height, columns: columns.length });
  }
  const bounds = [...last].filter(([, group]) => group.columns > 1 && group.height > 1)
    .map(([section, group]) => {
      const page = initial.pages[group.page]!;
      const paragraphs = new Map<number, typeof page.columns[number]['lines'][number][]>();
      for (const column of page.columns.filter(column => (column.section ?? page.section) === section)) for (const line of column.lines) {
        const lines = paragraphs.get(line.paragraphElementId) ?? [];
        lines.push(line); paragraphs.set(line.paragraphElementId, lines);
      }
      let low = 0;
      for (const [id, lines] of paragraphs) {
        const properties = format(id);
        const step = Math.max(...lines.map((line, index) => Math.max(line.height, index && line.y > lines[index - 1]!.y ? line.y - lines[index - 1]!.y : 0)));
        const kept = properties?.keepLines ? step * lines.length : properties?.widowControl !== false && lines.length > 1 ? step * 2 : step;
        if (kept <= group.height) low = Math.max(low, kept - 0.001);
      }
      return { section, page: group.page, low, high: group.height };
    });
  if (!bounds.length) return initial;
  for (let iteration = 0; iteration < 14 && bounds.some(bound => bound.high - bound.low > 0.05); iteration++) {
    const limits = new Map(bounds.map(bound => [bound.section, { page: bound.page, height: Math.max(1, (bound.low + bound.high) / 2) }]));
    const candidate = run(limits);
    const ends = new Map<WordSectionProperties, number>();
    for (const page of candidate.pages) for (const column of page.columns)
      if (column.lines.length || column.tables.length || column.unsupportedBlocks.length) ends.set(column.section ?? page.section, page.index);
    for (const bound of bounds) {
      const middle = limits.get(bound.section)!.height;
      if ((ends.get(bound.section) ?? 0) <= bound.page) bound.high = middle;
      else bound.low = middle;
    }
  }
  const balanced = run(new Map(bounds.map(bound => [bound.section, { page: bound.page, height: bound.high }])));
  return balanced.pages.length <= initial.pages.length ? balanced : initial;
}
