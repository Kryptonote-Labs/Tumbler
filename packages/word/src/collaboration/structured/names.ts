import * as z from 'zod';
import { id, storyId, type CellAddress } from "./schema.ts";

const cellPrefix = "word-cell-v2:";
const formatPrefix = "word-cell-format-v2:";
const coordinates = z.tuple([id, id, id]);
const identity = z.union([
  z.tuple([storyId, id, id, id]),
  z.tuple([storyId, z.array(coordinates).min(1)]),
]);

function cellIdentity(address: CellAddress) {
  const own = [address.table, address.row, address.column] as const;
  if (address.story.startsWith(cellPrefix)) {
    const parent = identity.parse(JSON.parse(address.story.slice(cellPrefix.length)));
    if (parent.length === 2) return [parent[0], [...parent[1], own]];
  }
  // Preserve all identities reachable under the old story cap. Beyond it, store
  // the existing parent once and append coordinates without re-escaping ancestry.
  if (address.story.length > 8192) return [address.story, [own]];
  return [address.story, ...own];
}

export const cellName = (address: CellAddress) => cellPrefix + JSON.stringify(cellIdentity(address));
export const cellFormatName = (address: CellAddress) => formatPrefix + JSON.stringify(cellIdentity(address));

/** Decode either retained v2 identities or compact paths to their immediate owning cell. */
export function cellAddressFromName(name: string): CellAddress {
  const prefix = name.startsWith(cellPrefix) ? cellPrefix : formatPrefix;
  if (!name.startsWith(prefix)) throw new Error("Invalid cell root name.");
  const value = identity.parse(JSON.parse(name.slice(prefix.length)));
  if (value.length === 4) {
    const [story, table, row, column] = value;
    return { story, table, row, column };
  }
  const [base, path] = value;
  const [table, row, column] = path.at(-1)!;
  const story = path.length === 1 ? base : cellPrefix + JSON.stringify([base, path.slice(0, -1)]);
  return { story, table, row, column };
}
