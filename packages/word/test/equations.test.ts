import { expect, test } from "bun:test";
import * as Y from "yjs";
import { typeMathText, createMathEditor, emptyEquation } from "@tumblerjs/core/math";
import { createWordArtifact, importWordContent, NativeWordDocument, openWordArtifact } from "../src/index.ts";
import { prepareWordOperation } from "../src/operations/index.ts";
import { openWordOperationDocument } from "../src/operations/index.ts";

const equation = typeMathText(createMathEditor(emptyEquation), "x^2+1/n").equation;
const measure = (text: string, format: { fontSizePoints: number }) => ({ width: [...text].length * format.fontSizePoints * 0.5, ascent: format.fontSizePoints * 0.8, descent: format.fontSizePoints * 0.2 });

test("inline equations lay out on the text baseline in their run's size", () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: "Area " }] }] });
  const model = new NativeWordDocument({ source });
  model.update([{ kind: "paragraph", runs: [{ text: "Area ", format: { fontSizePoints: 14 } }, { text: "￼", equation, format: { fontSizePoints: 14 } }, { text: " end" }] }]);
  const line = model.layout({ measure }).pages[0]!.columns[0]!.lines[0]!;
  const fragment = line.fragments.find((item) => item.kind === "math")!;
  expect(fragment.math?.equation).toEqual(equation);
  expect(fragment.startOffset).toBe(5);
  expect(fragment.endOffset).toBe(6);
  expect(fragment.width).toBe(fragment.math!.layout.width);
  // The fraction makes the line taller than plain 14 pt text.
  expect(line.height).toBeGreaterThan(14 * 1.2);
  expect(line.fragments.at(-1)!.x).toBeCloseTo(fragment.x + fragment.width);
});

test("insert-equation inherits typography and exports Office Math", () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: "Let  hold.", format: { fontSizePoints: 16, fontFamily: "Georgia" } }] }] });
  const session = openWordOperationDocument(source);
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 4, end: 4 }, { name: "insert-equation", input: { equation } }).delta);
    const part = session.text.toDelta()[1] as { insert: string; attributes: Record<string, unknown> };
    expect(part).toMatchObject({ insert: "￼", attributes: { equation, fontSize: 16 } });
    const xml = session.artifact().document.source.source;
    const math = xml.match(/Let <\/w:t><\/w:r>(<m:oMath .*<\/m:oMath>)/)?.[1] ?? "";
    expect(math).toContain("<m:f><m:num>");
    expect(math).toMatch(/<m:r><w:rPr><w:rFonts w:ascii="Georgia"[^]*?<w:sz w:val="32"\/>[^]*?<\/w:rPr><m:t/);
  } finally {
    session.destroy();
  }
});

test("equation attributes are validated as object characters", () => {
  const text = new Y.Doc().getText("body");
  text.insert(0, "a\n");
  expect(() =>
    prepareWordOperation(text, { start: 0, end: 1 }, { name: "edit-object", input: { equation } }),
  ).toThrow();
});

test("Office Math in an opened package is editable and round-trips", () => {
  const reopen = (bytes: Uint8Array) => openWordArtifact(new Uint8Array(bytes));
  const runs = (artifact: ReturnType<typeof reopen>) => (importWordContent(artifact)[0] as { runs: readonly { text: string; equation?: unknown }[] }).runs;
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: "Let " }, { text: "￼", equation, format: { fontSizePoints: 16 } }, { text: " hold." }] }] });
  const opened = reopen(source.bytes());
  expect(runs(opened).map((run) => run.text).join("")).toBe("Let ￼ hold.");
  expect(runs(opened).find((run) => run.equation)?.equation).toEqual(equation);

  const session = openWordOperationDocument(opened);
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 6, end: 10 }, { name: "replace", input: { value: "true" } }).delta);
    expect(runs(reopen(session.artifact().bytes())).find((run) => run.equation)?.equation).toEqual(equation);
    const next = typeMathText(createMathEditor(emptyEquation), "\\sqrt (a)").equation;
    // Object edits on shared text arrive as a Yjs update.
    const edit: { delta: Parameters<Y.Text["applyDelta"]>[0]; update?: Uint8Array } = prepareWordOperation(session.text, { start: 4, end: 5 }, { name: "edit-object", input: { equation: next } });
    if (edit.update) Y.applyUpdate(session.text.doc!, edit.update);
    else session.text.applyDelta(edit.delta);
    const saved = runs(reopen(session.artifact().bytes()));
    expect(saved.map((run) => run.text).join("")).toBe("Let ￼ true.");
    expect(saved.find((run) => run.equation)?.equation).toEqual(next);
  } finally {
    session.destroy();
  }
});
