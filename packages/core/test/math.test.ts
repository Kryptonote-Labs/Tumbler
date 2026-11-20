import { describe, expect, test } from "bun:test";
import {
  createMathEditor,
  deleteMathBackward,
  emptyEquation,
  insertMathTemplate,
  isMathEquation,
  layoutMath,
  mathCaretRect,
  mathPositionAt,
  mathToLatex,
  mathToOmml,
  mathToText,
  moveMathHorizontal,
  moveMathSlot,
  moveMathVertical,
  setMathSelection,
  typeMathText,
  type MathEditorState,
} from "../src/math/index.ts";

const typed = (text: string) => typeMathText(createMathEditor(emptyEquation), text);
const text = (state: MathEditorState) => mathToText(state.equation);
const measure = (value: string, style: { size: number }) => [...value].length * style.size * 0.5;

describe("typing builds structures", () => {
  test("scripts end at operators and keep the caret moving forward", () => {
    const state = typed("x^2+1");
    expect(text(state)).toBe("x^2+1");
    expect(state.equation.body[0]).toEqual({ kind: "script", base: [{ kind: "char", value: "x" }], sup: [{ kind: "char", value: "2" }] });
    expect(state.selection.focus).toEqual({ path: [], offset: 3 });
  });

  test("a parenthesised numerator loses its parentheses", () => {
    const state = typed("(a+b)/c");
    expect(state.equation.body).toHaveLength(1);
    expect(text(state)).toBe("(a+b)/c");
    const fraction = state.equation.body[0]!;
    expect(fraction.kind === "fraction" && fraction.num.length).toBe(3);
  });

  test("space leaves a slot and commands convert", () => {
    expect(text(typed("1/2 +\\alpha "))).toBe("1/2+α");
    expect(text(typed("\\sqrt x"))).toBe("√x");
    expect(text(typed("x_1^2"))).toBe("x_1^2");
    expect(text(typed("a<=b"))).toBe("a≤b");
  });

  test("function names become functions with the caret in the argument", () => {
    const state = typed("sin x");
    expect(state.equation.body[0]?.kind).toBe("function");
    expect(state.selection.focus.path).toEqual([{ index: 0, slot: "body" }]);
  });
});

describe("structure commands", () => {
  test("a template wraps the selection and lands in the first empty slot", () => {
    const state = typed("a+b");
    const selected = setMathSelection(state, { path: [], offset: 0 }, { path: [], offset: 3 });
    const next = insertMathTemplate(selected, "fraction");
    expect(text(next)).toBe("(a+b)/");
    expect(next.selection.focus).toEqual({ path: [{ index: 0, slot: "den" }], offset: 0 });
  });

  test("nested templates place the caret in the innermost empty slot", () => {
    const next = insertMathTemplate(createMathEditor(emptyEquation), "matrix-2x2");
    expect(next.selection.focus.path).toEqual([{ index: 0, slot: "body" }, { index: 0, slot: "r0c0" }]);
  });
});

describe("deletion", () => {
  test("backspace selects a structure before deleting it", () => {
    const state = typed("1/2 ");
    const selected = deleteMathBackward(state);
    expect(text(selected)).toBe("1/2");
    expect(selected.selection.anchor.offset).toBe(0);
    expect(text(deleteMathBackward(selected))).toBe("");
  });

  test("backspace at the start of the only filled slot unwraps it", () => {
    const state = typed("x^");
    const atBase = moveMathHorizontal(moveMathHorizontal(state, -1).state, -1).state;
    expect(atBase.selection.focus).toEqual({ path: [{ index: 0, slot: "base" }], offset: 0 });
    const unwrapped = deleteMathBackward(moveMathHorizontal(atBase, 1).state);
    expect(unwrapped.equation.body).toEqual([{ kind: "script", base: [], sup: [] }]);
  });
});

describe("navigation", () => {
  test("arrows walk through slots and exit at the equation edges", () => {
    let state = createMathEditor(typed("1/2").equation, "start");
    expect(moveMathHorizontal(state, -1).exit).toBe("before");
    state = moveMathHorizontal(state, 1).state;
    expect(state.selection.focus.path).toEqual([{ index: 0, slot: "num" }]);
    state = moveMathHorizontal(moveMathHorizontal(state, 1).state, 1).state;
    expect(state.selection.focus).toEqual({ path: [{ index: 0, slot: "den" }], offset: 0 });
    state = moveMathHorizontal(moveMathHorizontal(state, 1).state, 1).state;
    expect(state.selection.focus).toEqual({ path: [], offset: 1 });
    expect(moveMathHorizontal(state, 1).exit).toBe("after");
  });

  test("up and down move between numerator and denominator", () => {
    const state = typed("1/2");
    const up = moveMathVertical(state, -1);
    expect(up.state.selection.focus.path).toEqual([{ index: 0, slot: "num" }]);
    expect(moveMathVertical(up.state, -1).exit).toBe("up");
  });

  test("tab visits each slot of a template", () => {
    let state = insertMathTemplate(createMathEditor(emptyEquation), "integral-limits");
    expect(state.selection.focus.path.at(-1)?.slot).toBe("sub");
    state = moveMathSlot(state, 1).state;
    expect(state.selection.focus.path.at(-1)?.slot).toBe("sup");
    state = moveMathSlot(state, 1).state;
    expect(state.selection.focus.path.at(-1)?.slot).toBe("body");
  });
});

describe("layout", () => {
  test("fractions stand taller than text and clicks find the denominator", () => {
    const plain = layoutMath(typed("x").equation, { size: 12, measure });
    const fraction = layoutMath(typed("1/2").equation, { size: 12, measure });
    expect(fraction.ascent).toBeGreaterThan(plain.ascent);
    expect(fraction.descent).toBeGreaterThan(plain.descent);
    const den = fraction.rows.find((row) => row.path.at(-1)?.slot === "den")!;
    expect(mathPositionAt(fraction, den.carets[1]!, den.bottom - 1)).toEqual({ path: den.path, offset: 1 });
    const caret = mathCaretRect(fraction, { path: den.path, offset: 0 })!;
    expect(caret.top).toBeGreaterThan(-fraction.ascent);
  });

  test("an empty equation shows its prompt", () => {
    const layout = layoutMath(emptyEquation, { size: 11, measure, prompt: "Type equation here." });
    expect(layout.items).toEqual([expect.objectContaining({ kind: "prompt" })]);
  });
});

describe("serialization", () => {
  test("Office Math markup and LaTeX follow the structure", () => {
    const equation = typed("x^2+1/n").equation;
    expect(mathToOmml(equation)).toBe(
      '<m:oMath><m:sSup><m:e><m:r><m:t xml:space="preserve">x</m:t></m:r></m:e><m:sup><m:r><m:t xml:space="preserve">2</m:t></m:r></m:sup></m:sSup><m:r><m:t xml:space="preserve">+</m:t></m:r><m:f><m:num><m:r><m:t xml:space="preserve">1</m:t></m:r></m:num><m:den><m:r><m:t xml:space="preserve">n</m:t></m:r></m:den></m:f></m:oMath>',
    );
    expect(mathToLatex(equation)).toBe("x^{2}+\\frac{1}{n}");
  });

  test("persisted equations are validated", () => {
    expect(isMathEquation(typed("\\sum ").equation)).toBe(true);
    expect(isMathEquation({ body: [{ kind: "fraction", num: [] }] })).toBe(false);
  });
});
