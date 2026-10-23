import type * as Y from "yjs";
import type { WordFormatPatch, WordRange } from "../commands.ts";
import type { WordTableFormatPatch } from "../table-format.ts";
import type { CellAddress, TableAddress } from "./schema.ts";
export type WordScopedSelection =
  | { cell: CellAddress; range: WordRange }
  | { story: string; range: WordRange };
export type WordScopedAnchor =
  | {
      cell: CellAddress;
      start: Y.RelativePosition | null;
      end: Y.RelativePosition | null;
    }
  | { story: string; start: Y.RelativePosition; end: Y.RelativePosition };
export type WordStructuredChange =
  | { kind: "migrate"; table: TableAddress }
  | { kind: "replace"; selection: WordScopedSelection; value: string }
  | { kind: "format"; selection: WordScopedSelection; patch: WordFormatPatch }
  | {
      kind: "insert-axis";
      table: TableAddress;
      dimension: "row" | "column";
      at: number;
    }
  | { kind: "delete-table"; table: TableAddress }
  | { kind: "restore-table"; table: TableAddress }
  | {
      kind: "restore-axis";
      table: TableAddress;
      dimension: "row" | "column";
      id: string;
    }
  | {
      kind: "delete-axis";
      table: TableAddress;
      dimension: "row" | "column";
      id: string;
    }
  | { kind: "table-format"; cell: CellAddress; patch: WordTableFormatPatch }
  | { kind: "merge-right"; cell: CellAddress }
  | { kind: "split-cell"; cell: CellAddress };
export type PreparedWordUpdate = {
  readonly update: Uint8Array;
  readonly selection?: WordScopedSelection;
};
