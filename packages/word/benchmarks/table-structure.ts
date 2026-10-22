import * as Y from "yjs";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import {
  createWordCommands,
  tableParagraphs,
  groupTableParagraphs,
  validateWordText,
} from "../src/collaboration/index.ts";

// Copy unchanged into the audit checkout and run "legacy" there. Run "structured"
// in the implementation checkout, sequentially under the same host flock.
const mode = process.argv[2];
if (mode !== "legacy" && mode !== "structured")
  throw new Error("Use legacy or structured.");
const structured =
  mode === "structured"
    ? await import("../src/collaboration/structured/index.ts")
    : undefined;
const rows = 12,
  columns = 4,
  reads = 10,
  warmups = 3,
  samples = 7;
const seed = new Y.Doc();
seed.clientID = 17;
const body = seed.getText("body");
body.insert(0, "\n");
for (let row = 0; row < rows; row++)
  for (let column = 0; column < columns; column++) {
    body.insert(body.length, `r${row}c${column}`);
    body.insert(body.length, "\n", {
      table: {
        id: "benchmark-table",
        row: `row-${row}`,
        cell: `cell-${row}-${column}`,
        column,
        columns,
      },
    });
  }
body.insert(body.length, "\n");
const fixture = Y.encodeStateAsUpdate(seed);
seed.destroy();
const table = { story: "body", table: "benchmark-table" },
  commands = createWordCommands();
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
function run() {
  const baseline = new Y.Doc();
  Y.applyUpdate(baseline, fixture);
  baseline.getText("body");
  let migrationMs = 0;
  if (structured) {
    const begin = performance.now();
    structured.commitWordUpdate(
      baseline,
      structured.prepareWordUpdate(baseline, [{ kind: "migrate", table }]),
    );
    migrationMs = performance.now() - begin;
  }
  const state = Y.encodeStateAsUpdate(baseline);
  baseline.destroy();
  const docs = [100, 200].map((id) => {
    const doc = new Y.Doc();
    doc.clientID = id;
    Y.applyUpdate(doc, state);
    doc.getText("body");
    return doc;
  });
  try {
    Bun.gc(true);
    const memory = process.memoryUsage(),
      cpu = process.cpuUsage(),
      start = performance.now();
    for (const doc of docs) {
      if (structured)
        structured.commitWordUpdate(
          doc,
          structured.prepareWordUpdate(doc, [
            { kind: "insert-axis", table, dimension: "column", at: 1 },
          ]),
        );
      else {
        const text = doc.getText("body"),
          p = tableParagraphs(text).find((p) => p.table)!;
        text.applyDelta(
          commands.wordTransaction(text, [
            {
              kind: "table-edit",
              action: "column-after",
              tableId: p.table!.id,
              cellId: p.table!.cell,
              target: commands.anchorWordRange(text, {
                start: p.start,
                end: p.start,
              }),
            },
          ]),
        );
      }
    }
    const editsEnd = performance.now();
    for (let i = 0; i < reads; i++)
      if (structured) {
        structured.validateWordSharedDocument(docs[0]!);
        structured.structuredGrid(docs[0]!, table);
      } else {
        validateWordText(docs[0]!.getText("body"));
        groupTableParagraphs(tableParagraphs(docs[0]!.getText("body")));
      }
    const readEnd = performance.now(),
      used = process.cpuUsage(cpu),
      after = process.memoryUsage();
    const updates = docs.map((doc) => Y.encodeStateAsUpdate(doc));
    for (const doc of docs)
      for (const update of updates) Y.applyUpdate(doc, update);
    let valid = true;
    try {
      if (structured) structured.validateWordSharedDocument(docs[0]!);
      else validateWordText(docs[0]!.getText("body"));
    } catch {
      valid = false;
    }
    const contents = docs.map((doc) =>
      doc.getText("body").toString().replace(/\n/g, ""),
    );
    if (contents[0] !== contents[1]) throw new Error("Divergent text");
    return {
      migrationMs,
      editsMs: editsEnd - start,
      readsMs: readEnd - editsEnd,
      totalMs: readEnd - start,
      cpuMs: (used.user + used.system) / 1000,
      heapDeltaBytes: after.heapUsed - memory.heapUsed,
      rssBytes: after.rss,
      updateBytes: updates.reduce((sum, u) => sum + u.byteLength, 0),
      mergedValid: valid,
      contentHash: hash(contents[0]!),
    };
  } finally {
    docs.forEach((doc) => doc.destroy());
  }
}
for (let i = 0; i < warmups; i++) run();
const results = Array.from({ length: samples }, () => run());
console.log(
  JSON.stringify(
    {
      mode,
      runtime: Bun.version,
      cpu: cpus()[0]?.model,
      rows,
      columns,
      reads,
      warmups,
      samples,
      fixtureBytes: fixture.byteLength,
      fixtureHash: hash(fixture),
      operationsPerSample: {
        columnEdits: 2,
        explicitHealthyValidations: reads,
        gridReads: reads,
        postTimingMergedValidation: 1,
      },
      results,
    },
    null,
    2,
  ),
);
