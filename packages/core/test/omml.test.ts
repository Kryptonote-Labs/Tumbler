import { expect, test } from "bun:test";
import { parseLosslessXml } from "@tumblerjs/ooxml";
import { createMathEditor, emptyEquation, mathFromOmml, mathToOmml, mathToText, OMML_NAMESPACE, typeMathText } from "../src/math/index.ts";

const read = (xml: string) => mathFromOmml(parseLosslessXml(new TextEncoder().encode(xml)).root);
const typed = (input: string) => typeMathText(createMathEditor(emptyEquation), input).equation;

test("reads back every structure Tumbler writes", () => {
  for (const input of ["x=(-b\\pm \\sqrt (b^2 -4ac))/(2a)", "\\sum _(k=0)^n x^k ", "lim n->\\infty  (1+1/n )^n ", "\\int _0^1 f(x)dx", "\\sqrt (3&x)"]) {
    const equation = typed(input);
    const xml = mathToOmml(equation).replace("<m:oMath>", `<m:oMath xmlns:m="${OMML_NAMESPACE}">`);
    expect(read(xml)).toEqual(equation);
  }
});

test("applies OMML defaults and keeps the contents of unsupported wrappers", () => {
  const xml = `<m:oMathPara xmlns:m="${OMML_NAMESPACE}" xmlns:w="w"><m:oMath>
    <m:nary><m:naryPr><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/><m:e><m:r><w:rPr/><m:t>f</m:t></m:r></m:e></m:nary>
    <m:d><m:e><m:r><m:t>a</m:t></m:r></m:e><m:e><m:r><m:t>b</m:t></m:r></m:e></m:d>
    <m:box><m:e><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>if</m:t></m:r></m:e></m:box>
  </m:oMath></m:oMathPara>`;
  const equation = read(xml);
  expect(equation.body[0]).toEqual({ kind: "nary", operator: "∫", body: [{ kind: "char", value: "f" }] });
  expect(mathToText(equation)).toBe("∫ f(a|b)if");
  expect(equation.body.at(-1)).toEqual({ kind: "char", value: "f", normal: true });
});
