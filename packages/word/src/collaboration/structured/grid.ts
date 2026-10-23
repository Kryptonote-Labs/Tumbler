import type * as Y from "yjs";
import {
  activeAxes,
  isTableRemoved,
  tableBase,
  tableRecords,
  sourceCell,
  WordTableConflict,
  type CellAddress,
  type TableAddress,
} from "./state.ts";
import type { TableCell } from "../tables.ts";
export type StructuredCell = {
  address: CellAddress;
  columns: string[];
  payloads: CellAddress[];
  source?: TableCell;
  verticalGroup?: string;
  verticalMerge?: "restart" | "continue";
};
export type StructuredRow = {
  id: string;
  before: number;
  after: number;
  cells: StructuredCell[];
};
/** Follow the retained baseline, including deleted restart rows, to retain group identity. */
function sourceGroup(
  base: ReturnType<typeof tableBase>,
  source: TableCell,
): string {
  let group = source.cell;
  for (let i = base.rows.indexOf(source.row); i >= 0; i--) {
    const candidate = base.cells.find(
      (cell) =>
        cell.row === base.rows[i] &&
        cell.column === source.column &&
        (cell.span ?? 1) === (source.span ?? 1),
    );
    if (!candidate?.merge) break;
    group = candidate.cell;
    if (candidate.merge === "restart") break;
  }
  return group;
}
/** Logical addresses remain stable when other peers insert axes before the selected cell. */
export function structuredGrid(
  doc: Y.Doc,
  address: TableAddress,
): StructuredRow[] {
  const base = tableBase(doc, address),
    rows = activeAxes(doc, address, "row"),
    columns = activeAxes(doc, address, "column");
  const grid = rows.map((row) => {
    const original = base.cells.find((cell) => cell.row === row);
    const omitted = new Set(
      original
        ? base.columns.filter(
            (_, i) =>
              i < (original.before ?? 0) ||
              i >= base.columns.length - (original.after ?? 0),
          )
        : [],
    );
    let before = 0,
      after = 0;
    while (omitted.has(columns[before] ?? "")) before++;
    while (
      after < columns.length - before &&
      omitted.has(columns[columns.length - 1 - after] ?? "")
    )
      after++;
    if (
      columns
        .slice(before, columns.length - after)
        .some((column) => omitted.has(column))
    )
      throw new WordTableConflict(
        address,
        "overlap",
        "An inserted axis split an imported grid omission.",
      );
    const cells: StructuredCell[] = [];
    for (let i = before; i < columns.length - after;) {
      const column = columns[i]!,
        target = { ...address, row, column },
        source = sourceCell(doc, target);
      const insertion = tableRecords(doc, address).find(
        (r) =>
          r.value.kind === "axis" &&
          r.value.dimension === "row" &&
          r.value.id === row,
      )?.value;
      const continuation =
        insertion?.kind === "axis"
          ? insertion.continuations.find((coverage) =>
              coverage.columns.includes(column),
            )
          : undefined;
      const merge = tableRecords(doc, address).find(
        (r) =>
          r.value.kind === "merge" &&
          r.value.row === row &&
          r.value.columns[0] === column,
      )?.value;
      let covered = [column];
      if (merge?.kind === "merge") covered = merge.columns;
      else if (
        source &&
        (source.span ?? 1) > 1 &&
        !tableRecords(doc, address).some(
          (r) => r.value.kind === "split" && r.value.cell === source.cell,
        )
      ) {
        const survivors = base.columns
          .slice(source.column, source.column + (source.span ?? 1))
          .filter((c) => columns.includes(c));
        const end = columns.indexOf(survivors.at(-1) ?? column);
        covered = columns.slice(i, end + 1);
      }
      if (continuation) {
        const survivors = continuation.columns.filter((c) =>
          columns.includes(c),
        );
        covered = columns.slice(
          i,
          columns.indexOf(survivors.at(-1) ?? column) + 1,
        );
      }
      if (!covered.length || covered[0] !== column)
        throw new WordTableConflict(
          address,
          "overlap",
          "Merge coverage cannot advance the grid.",
        );
      const seen = new Set<string>();
      const payloads = (
        merge?.kind === "merge"
          ? covered.map((column) => ({ ...address, row, column }))
          : [target]
      ).filter((candidate) => {
        const identity = sourceCell(doc, candidate)?.cell ?? candidate.column;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
      cells.push({
        address: target,
        columns: covered,
        payloads,
        ...(source ? { source } : {}),
        ...(source?.merge
          ? { verticalGroup: sourceGroup(base, source) }
          : continuation
            ? { verticalGroup: continuation.group }
            : {}),
        ...(source?.merge
          ? { verticalMerge: source.merge }
          : continuation
            ? { verticalMerge: "continue" as const }
            : {}),
      });
      i += covered.length;
    }
    return { id: row, before, after, cells };
  });
  let previous = new Map<string, StructuredCell>();
  for (const row of grid) {
    const current = new Map<string, StructuredCell>();
    for (const cell of row.cells) {
      const key = JSON.stringify(cell.columns);
      if (
        cell.verticalMerge === "continue" &&
        (!previous.get(key)?.verticalMerge ||
          previous.get(key)?.verticalGroup !== cell.verticalGroup)
      )
        cell.verticalMerge = "restart";
      current.set(key, cell);
    }
    previous = current;
  }
  return grid;
}
export function resolveCell(doc: Y.Doc, address: CellAddress) {
  if (isTableRemoved(doc, address))
    throw new WordTableConflict(
      address,
      "deleted-content",
      "The selected table was deleted.",
    );
  const row = structuredGrid(doc, address).find(
    (row) => row.id === address.row,
  );
  const cell = row?.cells.find((cell) => cell.columns.includes(address.column));
  if (!cell)
    throw new WordTableConflict(
      address,
      "deleted-content",
      "The selected cell is no longer visible.",
    );
  return cell;
}
