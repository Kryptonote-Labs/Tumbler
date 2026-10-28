import type * as Y from 'yjs';
import * as z from 'zod';
import { id } from './schema.ts';
import { payloadSignature, tableAddresses, tableRecords, type TableAddress } from './state.ts';

const root = 'word-source-whitespace-v1';
const proofSchema = z.object({ before: z.string(), after: z.string() }).strict();
const proofKey = (address: TableAddress, removal: string, cell: string) => JSON.stringify([address.story, address.table, removal, cell]);

/** Source migrations leave deletion operations intact so a peer's undo still wins. */
export function migratedRemovalSignature(doc: Y.Doc, address: TableAddress, removal: string, cell: string, original: string) {
  if (!doc.share.has(root)) return original;
  const value = doc.getMap<unknown>(root).get(proofKey(address, removal, cell));
  if (value === undefined) return original;
  const proof = proofSchema.parse(value);
  return proof.before === original ? proof.after : original;
}

/** Record exact before/after proofs only for witnesses that matched before migration.
 * Proofs live outside table records, keeping nested signatures and undo identities intact.
 * Existing conflicts remain conflicts rather than being accepted by the migration.
 */
export function migrateRetainedTablePayloads(doc: Y.Doc, update: () => void) {
  const witnesses = tableAddresses(doc).flatMap(address => tableRecords(doc, address).flatMap(({ key: removal, value }) => {
    if (value.kind !== 'remove' && value.kind !== 'remove-table') return [];
    const dimension: 'row' | 'column' | 'table' = value.kind === 'remove' ? value.dimension : 'table';
    return Object.entries(value.witnesses).flatMap(([key, original]) => {
      const [row, column] = z.tuple([id, id]).parse(JSON.parse(key));
      const cell = { ...address, row, column };
      const before = payloadSignature(doc, cell, dimension);
      return before === migratedRemovalSignature(doc, address, removal, key, original)
        ? [{ key: proofKey(address, removal, key), cell, dimension, before, original }] : [];
    });
  }));
  doc.transact(() => {
    update();
    for (const witness of witnesses) {
      const after = payloadSignature(doc, witness.cell, witness.dimension);
      if (after !== witness.before) doc.getMap(root).set(witness.key, { before: witness.original, after });
    }
  });
}
