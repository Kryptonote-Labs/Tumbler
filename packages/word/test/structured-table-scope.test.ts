import * as Y from "yjs";
import { test, expect } from "bun:test";
import { cell, apply, vertical, fixture } from "./structured-table-fixtures.ts";

import { tableParagraphs } from "../src/collaboration/tables.ts";

test("story scoped continuation editing rejects atomically through both executors", () => {
  const { session, doc } = vertical();
  try {
    const p = tableParagraphs(session.text).find(
      (p) => p.table?.merge === "continue",
    )!;
    const selection = {
      story: "body",
      range: { start: p.start, end: p.start },
    };
    const before = Y.encodeStateAsUpdate(doc);
    expect(() =>
      session.prepareOperation(selection, {
        name: "replace",
        input: { value: "Hidden story text" },
      }),
    ).toThrow("scoped cell selection");
    expect(() =>
      session.prepare([
        { kind: "replace", selection, value: "Hidden story text" },
      ]),
    ).toThrow("scoped cell selection");
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  } finally {
    session.destroy();
  }
});

test("story aliases for canonical roots cannot bypass cell visibility", async () => {
  const { cellName } = await import("../src/collaboration/structured/state.ts");
  const { derived } = await import("./structured-table-fixtures.ts");
  const { session, doc, target } = derived();
  try {
    apply(doc, {
      kind: "replace",
      selection: { cell: target, range: { start: 0, end: 0 } },
      value: "Visible",
    });
    expect(() =>
      session.prepareOperation(
        { story: cellName(target), range: { start: 0, end: 0 } },
        { name: "replace", input: { value: "Bypass" } },
      ),
    ).toThrow("scoped cell selection");
    expect(doc.getText(cellName(target)).toString()).toBe("Visible");
  } finally {
    session.destroy();
  }
});

test("story anchors after a leading migrated table resolve at their actual location", () => {
  const seed = fixture([[cell("A"), cell("B")]]);
  try {
    const at = seed.doc.getText("body").length - 1;
    const selection = { story: "body", range: { start: at, end: at } };
    const anchor = seed.session.anchor(selection);
    expect(seed.session.resolve(anchor)).toEqual(selection);
  } finally { seed.session.destroy(); }
});
