import { expect, test } from "bun:test";
import {
  fixture,
  cell,
  apply,
  clone,
  sync,
} from "./structured-table-fixtures.ts";
import {
  structuredGrid,
  validateWordSharedDocument,
  commitWordUpdate,
} from "../src/collaboration/structured/index.ts";
import { prepareWordScopedOperation } from "../src/operations/index.ts";

test("source paragraph formatting participates in deletion witnesses", () => {
  const { session, table, doc } = fixture([[cell("A"), cell("B")]]),
    remote = clone(doc);
  try {
    const target = structuredGrid(doc, table)[0]!.cells[0]!.address;
    apply(doc, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: target.column,
    });
    commitWordUpdate(
      remote,
      prepareWordScopedOperation(
        remote,
        { cell: target, range: { start: 0, end: 0 } },
        { name: "paragraph", input: { paragraph: { keepNext: true } } },
      ),
    );
    sync(doc, remote);
    expect(() => validateWordSharedDocument(doc)).toThrow();
  } finally {
    session.destroy();
    remote.destroy();
  }
});
