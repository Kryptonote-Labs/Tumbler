import * as Y from "yjs";
import {
  createWordArtifact,
  importWordContent,
  openWordArtifact,
} from "../src/index.ts";
import type { WordContentBlock } from "../src/create-content.ts";
import {
  openWordOperationDocument,
  prepareWordScopedOperation,
} from "../src/operations/index.ts";
import { tableParagraphs } from "../src/collaboration/tables.ts";
import {
  commitWordUpdate,
  prepareWordUpdate,
  structuredGrid,
  validateWordSharedDocument,
  type WordStructuredChange,
} from "../src/collaboration/structured/index.ts";
import {
  cellName,
  tableAddresses,
} from "../src/collaboration/structured/state.ts";
export const paragraph = (text: string) => ({
  kind: "paragraph" as const,
  runs: [{ text }],
});
export const cell = (text: string) => ({ blocks: [paragraph(text)] });
export function fixture(
  rows: Extract<WordContentBlock, { kind: "table" }>["rows"],
  columns = 2,
) {
  const session = openWordOperationDocument(
    createWordArtifact({
      blocks: [
        {
          kind: "table",
          columnWidths: Array.from({ length: columns }, () => 80),
          rows,
        },
      ],
    }),
  );
  const table = {
    story: "body",
    table: tableParagraphs(session.text).find((p) => p.table)!.table!.id,
  };
  session.commit(session.prepare([{ kind: "migrate", table }]));
  return { session, table, doc: session.text.doc! };
}
export function apply(doc: Y.Doc, change: WordStructuredChange) {
  commitWordUpdate(doc, prepareWordUpdate(doc, [change]));
}
export function clone(doc: Y.Doc) {
  const result = new Y.Doc();
  Y.applyUpdate(result, Y.encodeStateAsUpdate(doc));
  result.getText("body");
  return result;
}
export function sync(a: Y.Doc, b: Y.Doc) {
  const updates = [Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)];
  for (const doc of [a, b])
    for (const update of [...updates, ...updates].reverse())
      Y.applyUpdate(doc, update);
}
export function exported(
  session: ReturnType<typeof openWordOperationDocument>,
) {
  const block = importWordContent(
    openWordArtifact(session.artifact().bytes()),
  ).find((b) => b.kind === "table");
  if (block?.kind !== "table") throw Error("table");
  return block;
}
export function texts(blocks: readonly WordContentBlock[]): string[] {
  return blocks.flatMap((b) =>
    b.kind === "paragraph"
      ? [b.runs.map((r) => r.text).join("")]
      : b.kind === "table"
        ? b.rows.flatMap((row) => row.flatMap((c) => texts(c.blocks)))
        : [],
  );
}
export const vertical = () =>
  fixture([
    [{ ...cell("Merged"), gridSpan: 2, verticalMerge: "restart" }],
    [{ ...cell(""), gridSpan: 2, verticalMerge: "continue" }],
  ]);
export function derived() {
  const value = fixture([[cell("A"), cell("B")]]);
  apply(value.doc, {
    kind: "insert-axis",
    table: value.table,
    dimension: "column",
    at: 1,
  });
  return {
    ...value,
    target: structuredGrid(value.doc, value.table)[0]!.cells[1]!.address,
  };
}
