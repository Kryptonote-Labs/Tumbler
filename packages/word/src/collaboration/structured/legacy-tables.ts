import * as Y from 'yjs';
import { tableParagraphs, type TableCell } from '../tables.ts';

const cached = new WeakMap<Y.Text, { dirty: boolean; tables: Map<string, TableCell> }>();

/** Ordinary typing cannot introduce a legacy table. Reinspect only structural edits. */
export function legacyTables(text: Y.Text) {
  let state = cached.get(text);
  if (!state) {
    state = { dirty: true, tables: new Map() };
    cached.set(text, state);
    const current = state;
    text.observe(event => {
      if (event.keysChanged.size || event.delta.some(part =>
        part.attributes && 'table' in part.attributes || part.delete && current.tables.size > 0))
        current.dirty = true;
    });
  }
  const pending = text.doc?._transaction && [...text.doc._transaction.changed.keys()].some(root => root instanceof Y.Text && root === text);
  if (!state.dirty && !pending) return state.tables;
  const tables = new Map<string, TableCell>();
  for (const paragraph of tableParagraphs(text))
    for (const ref of [...(paragraph.table?.parents ?? []), ...(paragraph.table ? [paragraph.table] : [])])
      if (ref.schema !== 2) tables.set(ref.id, ref);
  if (!pending) {
    state.tables = tables;
    state.dirty = false;
  }
  return tables;
}
