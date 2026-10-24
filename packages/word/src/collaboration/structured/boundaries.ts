import * as Y from "yjs";
import {
  cellKey, orderedAxes, payloadSignature, tableAddresses, tableName, tableRecords,
  WordTableConflict, type TableAddress, type TableRecord,
} from "./state.ts";

/** Each deletion owns its witnesses and separators, so concurrent deletions do not overwrite them. */
export function removeWordTable(
  doc: Y.Doc,
  address: TableAddress,
  boundaries: readonly { client: number; clock: number }[] = [],
) {
  const witnesses: Record<string, string> = {};
  for (const row of orderedAxes(doc, address, "row"))
    for (const column of orderedAxes(doc, address, "column"))
      witnesses[cellKey(row, column)] = payloadSignature(doc, { ...address, row, column }, "table");
  doc.getMap<TableRecord>(tableName(address)).set("remove-table:" + crypto.randomUUID(), {
    kind: "remove-table", witnesses,
    ...(boundaries.length ? { boundaries: boundaries.map(({ client, clock }) => ({ client, clock })) } : {}),
  });
}

/** Keep physical separators before retained tables while joining their visible paragraphs. */
export function retainedParagraphBoundaries(doc: Y.Doc) {
  const result = new Map<Y.Text, number[]>();
  for (const address of tableAddresses(doc)) {
    for (const { value } of tableRecords(doc, address)) {
      if (value.kind !== "remove-table") continue;
      for (const boundary of value.boundaries ?? []) {
        const text = doc.getText(address.story);
        const position = Y.createAbsolutePositionFromRelativePosition(
          Y.createRelativePositionFromJSON({ tname: address.story, item: boundary, assoc: 0 }),
          doc,
        );
        let retained = false;
        try {
          const item = Y.getItem(doc.store, Y.createID(boundary.client, boundary.clock));
          retained = item instanceof Y.Item && !item.deleted && item.parent === text;
        } catch {
          // Unknown item identities are invalid retained separators too.
        }
        if (!retained || !position || position.type !== text || text.toString()[position.index] !== "\n")
          throw new WordTableConflict(address, "deleted-content", "A retained paragraph boundary was removed by an incompatible writer.");
        const indices = result.get(text) ?? [];
        if (!indices.includes(position.index)) indices.push(position.index);
        result.set(text, indices);
      }
    }
  }
  for (const indices of result.values()) indices.sort((a, b) => a - b);
  return result;
}
