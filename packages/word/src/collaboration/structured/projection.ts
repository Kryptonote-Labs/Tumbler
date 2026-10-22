import * as Y from "yjs";
import type { WordArtifact } from "../../artifact.ts";
import type { WordContentBlock } from "../../create-content.ts";
import { projectWordOperationText } from "../../operations/document.ts";
import { structuredGrid } from "./grid.ts";
import {
  activeAxes,
  cellKey,
  existingText,
  isTableRemoved,
  payload,
  tableName,
  tableRecords,
  payloadDelta,
  tableAddresses,
  tableBase,
  validateStructuredTables,
  type TableAddress,
} from "./state.ts";
import type { DocumentImage } from "../images.ts";

/** Project roots in logical grid order. Reads never initialize an empty cell root. */
export function projectWordSharedDocument(
  doc: Y.Doc,
  story: string,
  source: WordArtifact,
  resolveImage?: (image: DocumentImage) => Uint8Array,
): WordContentBlock[] {
  validateStructuredTables(doc);
  const text = existingText(doc, story);
  if (!text) throw new Error("Missing story.");
  const addresses = new Map(tableAddresses(doc).map((a) => [tableName(a), a]));
  const projectCell = (
    address: Parameters<typeof payloadDelta>[1],
  ): WordContentBlock[] => {
    const delta = payloadDelta(doc, address, true);
    if (!delta.length) return [{ kind: "paragraph", runs: [] }];
    const temporary = new Y.Doc();
    try {
      const text = temporary.getText("cell");
      text.applyDelta(delta);
      return visit(
        projectWordOperationText(text, source, resolveImage),
        Y.createRelativePositionFromTypeIndex(payload(doc, address)!.text, 0)
          .tname!,
      );
    } finally {
      temporary.destroy();
    }
  };
  const table = (address: TableAddress): WordContentBlock => {
    const base = tableBase(doc, address),
      grid = structuredGrid(doc, address),
      records = tableRecords(doc, address);
    const formatFor = (id: string) =>
      records.find((r) => r.value.kind === "cell-format" && r.value.cell === id)
        ?.value;
    const oldWidths = base.cells[0]?.widths?.length
      ? base.cells[0].widths
      : records.some((r) => r.value.kind === "width")
        ? base.columns.map(() => 72)
        : undefined;
    const rows = grid.map((row) =>
      row.cells.map((cell) => {
        const format = formatFor(
          cell.source?.cell ?? cellKey(row.id, cell.address.column),
        );
        return {
          blocks: cell.payloads.flatMap(projectCell),
          ...(cell.columns.length > 1 ? { gridSpan: cell.columns.length } : {}),
          ...(cell.verticalMerge ? { verticalMerge: cell.verticalMerge } : {}),
          ...(format?.kind === "cell-format"
            ? { format: format.format }
            : cell.source?.format
              ? { format: cell.source.format }
              : {}),
          ...(cell.source?.source?.cell
            ? { source: cell.source.source.cell }
            : {}),
        };
      }),
    );
    const count = grid[0]!.cells.reduce(
      (n, c) => n + c.columns.length,
      grid[0]!.before + grid[0]!.after,
    );
    return {
      kind: "table",
      rows,
      rowGrids: grid.map((row) => ({ before: row.before, after: row.after })),
      ...(oldWidths?.length
        ? {
            columnWidths: activeAxes(doc, address, "column").map((column) =>
              (() => {
                const width = records.find(
                  (r) => r.value.kind === "width" && r.value.column === column,
                )?.value;
                return width?.kind === "width"
                  ? width.value
                  : (oldWidths[base.columns.indexOf(column)] ??
                      oldWidths.reduce((a, b) => a + b, 0) / oldWidths.length);
              })(),
            ),
          }
        : {}),
      rowFormats: grid.map((row) => {
        const format = records.find(
          (r) => r.value.kind === "row-format" && r.value.row === row.id,
        )?.value;
        return format?.kind === "row-format"
          ? format.format
          : base.cells.find((c) => c.row === row.id)?.rowFormat;
      }),
      ...(base.cells[0]?.source
        ? {
            source: base.cells[0].source.table,
            rowSources: grid.map(
              (row) => base.cells.find((c) => c.row === row.id)?.source?.row,
            ),
          }
        : {}),
    };
  };
  const visit = (
    blocks: ReturnType<typeof projectWordOperationText>,
    scope: string,
  ): WordContentBlock[] =>
    blocks.flatMap((block) => {
      if (block.kind !== "table") return block;
      const address = addresses.get(
        tableName({ story: scope, table: block.id }),
      );
      if (address) return isTableRemoved(doc, address) ? [] : [table(address)];
      return {
        ...block,
        rows: block.rows.map((row) =>
          row.map((cell) => ({ ...cell, blocks: visit(cell.blocks, scope) })),
        ),
      };
    });
  return visit(projectWordOperationText(text, source, resolveImage), story);
}

/** Invalidate on any shared-root update, including first typing in an implicit cell. */
export class WordStructuredProjection {
  private cached: WordContentBlock[] | undefined;
  private readonly invalidate = () => {
    this.cached = undefined;
  };
  constructor(
    private readonly doc: Y.Doc,
    private readonly story: string,
    private readonly source: WordArtifact,
    private readonly resolveImage?: (image: DocumentImage) => Uint8Array,
  ) {
    doc.on("update", this.invalidate);
  }
  get blocks() {
    return (this.cached ??= projectWordSharedDocument(
      this.doc,
      this.story,
      this.source,
      this.resolveImage,
    ));
  }
  destroy() {
    this.doc.off("update", this.invalidate);
  }
}
