import { expect, test } from "bun:test";
import * as Y from "yjs";
import { WordSharedText, structuredGrid } from "../src/collaboration/structured/index.ts";
import { createWordCommands } from "../src/collaboration/commands.ts";
import { createWordOperations } from "../src/operations/execute.ts";
import { apply, cell, derived, fixture } from "./structured-table-fixtures.ts";

const shape = { preset: "rect", width: 20, height: 20, fill: "#ffffff", outline: "#000000", outlineWidth: 1 } as const;

for (const canonical of [false, true]) {
  test(`linear object destinations map into a nonleading ${canonical ? "canonical" : "source"} cell`, () => {
    const seed = canonical ? derived() : fixture([[cell("ABCDE"), cell("abcdef")]]);
    const target = structuredGrid(seed.doc, seed.table)[0]!.cells[1]!.address;
    if (canonical) apply(seed.doc, { kind: "replace", selection: { cell: target, range: { start: 0, end: 0 } }, value: "abcdef" });
    const view = new WordSharedText(seed.doc, "body");
    const history = seed.session.history();
    try {
      const at = view.text.toString().indexOf("abcdef");
      view.commit(view.prepareOperation({ start: at + 1, end: at + 1 }, { name: "insert-shape", input: { shape } }));
      const move = view.prepareOperation({ start: at + 1, end: at + 2 }, { name: "move-object", input: { destination: at + 5 } });
      view.commit(move, history.origin);
      expect(view.text.toString().slice(at, at + 7)).toBe("abcd\uFFFCef");
      expect(move.range).toEqual({ start: at + 4, end: at + 5 });
      expect(view.range(move.selection!)).toEqual(move.range);
      expect(history.undo()).toBe(true);
      expect(view.text.toString().slice(at, at + 7)).toBe("a\uFFFCbcdef");
      expect(history.redo()).toBe(true);
      const back = view.prepareOperation(move.range, { name: "move-object", input: { destination: at } });
      view.commit(back, history.origin);
      expect(view.text.toString().slice(at, at + 7)).toBe("\uFFFCabcdef");
      expect(back.range).toEqual({ start: at, end: at + 1 });
      const before = Y.encodeStateAsUpdate(seed.doc);
      for (const destination of [at - 1, at + 8])
        expect(() => view.prepareOperation(back.range, { name: "move-object", input: { destination } })).toThrow();
      expect(Y.encodeStateAsUpdate(seed.doc)).toEqual(before);
      expect(history.undo()).toBe(true);
      expect(view.text.toString().slice(at, at + 7)).toBe("abcd\uFFFCef");
    } finally { history.destroy(); view.destroy(); seed.session.destroy(); }
  });

  test(`host document defaults survive ${canonical ? "canonical" : "source"} cell staging`, () => {
    const seed = canonical ? derived() : fixture([[cell("A"), cell("B")]]);
    seed.doc.getMap("word").set("fontSize", 21);
    const target = structuredGrid(seed.doc, seed.table)[0]!.cells[1]!.address;
    if (!canonical) apply(seed.doc, { kind: "format", selection: { cell: target, range: { start: 0, end: 1 } }, patch: { fontSize: null } });
    const view = new WordSharedText(seed.doc, "body");
    const commands = createWordCommands({
      defaultAttributes: text => {
        expect(Y.createRelativePositionFromTypeIndex(text, 0).tname).toBe("body");
        const fontSize: unknown = text.doc?.getMap("word").get("fontSize");
        return typeof fontSize === "number" ? { fontSize } : {};
      },
      validateDocument: staged => {
        expect([...staged.share.keys()].sort()).toEqual(["body", "word"]);
        expect(staged.getMap("word").get("fontSize")).toBe(21);
      },
    });
    const history = seed.session.history();
    try {
      const range = view.range({ cell: target, range: { start: 0, end: 0 } });
      expect(commands.wordFormats(view.text, range).fontSize).toBe(21);
      const before = Y.encodeStateAsUpdate(seed.doc);
      const edit = view.prepareOperation(range, { name: "replace", input: { value: "X" } }, { prepareOperation: createWordOperations(commands) });
      expect(Y.encodeStateAsUpdate(seed.doc)).toEqual(before);
      view.commit(edit, history.origin);
      expect(commands.wordFormats(view.text, { start: range.start, end: range.start + 1 }).fontSize).toBe(21);
      expect(seed.doc.getMap("word").get("fontSize")).toBe(21);
      expect(history.undo()).toBe(true);
      expect(seed.doc.getMap("word").get("fontSize")).toBe(21);
      expect(history.redo()).toBe(true);
      expect(commands.wordFormats(view.text, { start: range.start, end: range.start + 1 }).fontSize).toBe(21);
    } finally { history.destroy(); view.destroy(); seed.session.destroy(); }
  });

  test(`scoped host defaults survive ${canonical ? "canonical" : "source"} operation staging`, () => {
    const seed = canonical ? derived() : fixture([[cell("A"), cell("B")]]);
    const target = structuredGrid(seed.doc, seed.table)[0]!.cells[1]!.address;
    seed.doc.getMap("word").set("fontSize", 21);
    if (!canonical) apply(seed.doc, { kind: "format", selection: { cell: target, range: { start: 0, end: 1 } }, patch: { fontSize: null } });
    const commands = createWordCommands({ defaultAttributes: text => {
      const size: unknown = text.doc?.getMap("word").get("fontSize");
      return typeof size === "number" ? { fontSize: size } : {};
    } });
    const view = new WordSharedText(seed.doc, "body");
    try {
      const before = Y.encodeStateAsUpdate(seed.doc);
      const edit = seed.session.prepareOperation({ cell: target, range: { start: 0, end: 0 } }, {
        name: "replace", input: { value: "X" },
      }, { prepareOperation: createWordOperations(commands) });
      expect(Y.encodeStateAsUpdate(seed.doc)).toEqual(before);
      view.commit(edit);
      const range = view.range({ cell: target, range: { start: 0, end: 1 } });
      expect(commands.wordFormats(view.text, range).fontSize).toBe(21);
    } finally { view.destroy(); seed.session.destroy(); }
  });
}
