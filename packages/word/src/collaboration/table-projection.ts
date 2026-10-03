import { groupTableParagraphs, type GroupedTable, type TableCell } from './tables.ts';

/** Reuse unchanged table trees when a paragraph projection retains unaffected objects. */
export class WordTableProjection<T extends { kind: 'paragraph'; table?: TableCell }> {
  private tables = new Map<string, { paragraphs: readonly T[]; block: GroupedTable<T>; ids: readonly string[] }>();

  update(paragraphs: readonly T[]): (T | GroupedTable<T>)[] {
    const next = new Map<string, { paragraphs: readonly T[]; block: GroupedTable<T>; ids: readonly string[] }>();
    const seen = new Set<string>();
    const output: (T | GroupedTable<T>)[] = [];
    const outer = (paragraph: T) => paragraph.table?.parents?.[0] ?? paragraph.table;
    for (let index = 0; index < paragraphs.length;) {
      const paragraph = paragraphs[index]!;
      const table = outer(paragraph);
      if (!table) { output.push(paragraph); index++; continue; }
      const start = index;
      while (index < paragraphs.length && outer(paragraphs[index]!)?.id === table.id) index++;
      let cached = this.tables.get(table.id);
      if (!cached || cached.paragraphs.length !== index - start ||
        !cached.paragraphs.every((value, offset) => value === paragraphs[start + offset])) {
        const content = paragraphs.slice(start, index);
        const grouped = groupTableParagraphs(content);
        const block = grouped[0];
        if (grouped.length !== 1 || !block || block.kind !== 'table')
          throw new Error('Invalid grouped table.');
        const tree = block;
        const ids: string[] = [];
        const collect = (table: GroupedTable<T>) => {
          ids.push(table.id);
          for (const row of table.rows) for (const cell of row) for (const child of cell.blocks)
            if (child.kind === 'table') collect(child);
        };
        collect(tree);
        cached = { paragraphs: content, block: tree, ids };
      }
      for (const id of cached.ids) {
        if (seen.has(id)) throw new Error('A table must be contiguous.');
        seen.add(id);
      }
      next.set(table.id, cached);
      output.push(cached.block);
    }
    this.tables = next;
    return output;
  }
}
