import { describe, expect, test } from "bun:test";
import { MATH_TEMPLATES, createMathEditor, emptyEquation, latexToMath, mathToLatex, mathToText, typeMathText } from "../src/math/index.ts";

const text = (source: string) => {
  const equation = latexToMath(source);
  return equation && mathToText(equation);
};

describe("reading LaTeX", () => {
  test("common formulas become structures", () => {
    expect(text("x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}")).toBe("x=(−b±√(b^2−4ac))/(2a)");
    expect(text("e^{i\\pi}+1=0")).toBe("e^(iπ)+1=0");
    expect(text("\\int_0^1 f(x)\\,dx = \\frac12")).toBe("∫_0^1 f(x) dx=1/2");
    expect(text("\\lim_{n\\to\\infty} \\left(1+\\frac{1}{n}\\right)^n")).toBe("lim_(n→∞) (1+1/n)^n");
    expect(latexToMath("\\begin{pmatrix}a & b\\\\ c & d\\end{pmatrix}")?.body[0]).toMatchObject({ kind: "delimiter", open: "(", body: [{ kind: "matrix" }] });
  });

  test("operator and function arguments end at the next operator", () => {
    const equation = latexToMath("\\sum_{i=1}^n a_i + \\sin x = 1")!;
    expect(equation.body.map((node) => node.kind)).toEqual(["nary", "char", "function", "char", "char"]);
  });

  test("macros, styling and alignment stay as source", () => {
    for (const source of ["\\mathbf{x}", "\\newcommand\\x{1}", "a &= b", "a \\\\ b", "\\dfrac12", "x % note", "\\href{u}{x}", "\\frac{1}{2", "\\sum\\limits_i"])
      expect(latexToMath(source)).toBeUndefined();
  });

  test("written LaTeX reads back as the same equation", () => {
    const typed = ["x=(-b\\pm \\sqrt (b^2 -4ac))/(2a)", "sin \\alpha \\pm sin \\beta ", "\\sum _(k=0)^n x+1", "lim n->\\infty  1/n", "a\\cdot \\{b\\}"];
    const equations = [
      ...typed.map((input) => typeMathText(createMathEditor(emptyEquation), input).equation),
      // Pre-scripts and fraction styles have no standard LaTeX of their own.
      ...MATH_TEMPLATES.filter(({ node }) => !(node.kind === "script" && node.pre) && !(node.kind === "fraction" && node.style)).map((template) => ({ body: [template.node] })),
      { body: [{ kind: "char" as const, value: "x" }, ...[..."if x > 0"].map((value) => ({ kind: "char" as const, value, normal: true }))] },
    ];
    for (const equation of equations) expect(latexToMath(mathToLatex(equation))).toEqual(equation);
  });
});
