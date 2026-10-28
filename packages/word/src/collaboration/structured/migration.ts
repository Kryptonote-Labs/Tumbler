import type * as Y from 'yjs';
import * as z from 'zod';
import { id, storyId } from './schema.ts';
import { payloadSignature, tableAddresses, tableName, tableRecords, type TableRecord } from './state.ts';

/** Refresh only deletion witnesses that matched before a lossless source migration.
 * Descendant records are included in parent signatures, so refresh children first.
 * Existing conflicts remain conflicts rather than being accepted by the migration.
 */
export function migrateRetainedTablePayloads(doc: Y.Doc, update: () => void) {
  const tables = tableAddresses(doc).map(address => ({ address, records: tableRecords(doc, address)
    .flatMap(({ key, value }) => {
      if (value.kind !== 'remove' && value.kind !== 'remove-table') return [];
      const dimension: 'row' | 'column' | 'table' = value.kind === 'remove' ? value.dimension : 'table';
      return [{ key, value, cells: Object.entries(value.witnesses).map(([key, signature]) => {
        const [row, column] = z.tuple([id, id]).parse(JSON.parse(key));
        const cell = { ...address, row, column };
        const before = payloadSignature(doc, cell, dimension);
        const descendants = z.object({ descendants: z.record(z.string(), z.unknown()) }).parse(JSON.parse(before));
        return { key, cell, dimension, matched: before === signature,
          children: Object.keys(descendants.descendants).map(key => {
            const [story, table] = z.tuple([storyId, id]).parse(JSON.parse(key));
            return tableName({ story, table });
          }) };
      }) }];
    }) }));
  const byName = new Map(tables.map(table => [tableName(table.address), table]));
  const ordered: typeof tables = [], visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    const table = byName.get(name);
    if (!table) return;
    for (const record of table.records) for (const cell of record.cells) for (const child of cell.children) visit(child);
    ordered.push(table);
  };
  for (const name of byName.keys()) visit(name);
  doc.transact(() => {
    update();
    for (const { address, records } of ordered) for (const { key, value, cells } of records) {
      const witnesses = { ...value.witnesses };
      for (const cell of cells) if (cell.matched) witnesses[cell.key] = payloadSignature(doc, cell.cell, cell.dimension);
      if (Object.entries(witnesses).some(([key, signature]) => value.witnesses[key] !== signature))
        doc.getMap<TableRecord>(tableName(address)).set(key, { ...value, witnesses });
    }
  });
}
