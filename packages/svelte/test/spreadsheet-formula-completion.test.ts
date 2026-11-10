import { expect, test } from "bun:test";
import { spreadsheetFormulaCompletion as completion, acceptSpreadsheetFormulaCompletion as accept } from "../src/spreadsheet-formula-completion.ts";

test("suggests local functions at the caret, including nested calls and dotted names", () => {
  expect(completion("=su", 3)?.names).toContain("SUM");
  expect(completion("=ROUND(su,0)", 9)?.names).toContain("SUM");
  expect(completion("=STDEV.", 7)?.names).toContain("STDEV.S");
  expect(completion("=py", 3)).toBeUndefined();
});
test("leaves strings, quoted sheets, structured references and ordinary text alone", () => {
  for (const text of ['hello SU', '=IF(A1,"SU', "='SUM", '=Table[SU', '=Sheet!SU', '=1E', '=SU!A1', '=SUM(']) expect(completion(text, text.length)).toBeUndefined();
  expect(completion('=SU', 1, 3)).toBeUndefined();
  expect(completion('="escaped ""SU', 14)).toBeUndefined();
});
test("replaces the complete token at a mid-token caret without changing surrounding expressions", () => {
  const draft = "=ROUND(summ,0)";
  const match = completion(draft, 9)!;
  expect(accept(draft, match, "SUM")).toEqual({ draft: "=ROUND(SUM(),0)", caret: 11 });
});
test("keeps existing arguments and opening parentheses when completing an existing call", () => {
  const draft = "=su (A1:A3)+2";
  expect(accept(draft, completion(draft, 3)!, "SUM")).toEqual({ draft: "=SUM (A1:A3)+2", caret: 6 });
});


test("does not replace an existing cell reference when the caret moves into it", () => {
  expect(completion("=A1", 2)).toBeUndefined();
  expect(completion("=SUM(A10)", 6)).toBeUndefined();
  expect(completion("=LOG10(A1)", 3)?.names).toContain("LOG10");
  expect(completion("=LOG10", 6)?.names).toContain("LOG10");
});
