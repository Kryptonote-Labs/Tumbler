import { describe, expect, test } from "bun:test";
import fc, { type Arbitrary } from "fast-check";
import { openOpcPackage } from "@tumblerjs/opc";
import {
  beginSpreadsheetEdit,
  formatCellReference,
  openSpreadsheet,
  openWorksheet,
  type EditableCellValue,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const textValue = fc.array(
  fc.constantFrom("a", "Z", "0", " ", "&", "<", ">", "\"", "'", "é", "東", "🙂", "\n", "\t"),
  { maxLength: 24 },
).map((characters) => characters.join(""));
const editableValue: Arbitrary<EditableCellValue> = fc.oneof(
  textValue,
  fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
);

describe("generated SpreadsheetML edit histories", () => {
  test("round-trips randomized sparse literal edits", () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        row: fc.integer({ min: 1, max: 40 }),
        column: fc.integer({ min: 1, max: 24 }),
        value: editableValue,
      }), { minLength: 1, maxLength: 30 }),
      (commands) => {
        const source = buildWorkbookFixture({
          sheets: [{ name: "Generated", sheetId: 1, relationshipId: "generated", xml: `<worksheet xmlns="${namespace}"><sheetData/></worksheet>` }],
        });
        const workbook = openSpreadsheet(openOpcPackage(source));
        const sheet = workbook.sheets[0]!;
        const editor = beginSpreadsheetEdit(workbook);
        const expected = new Map<string, EditableCellValue>();
        for (const command of commands) {
          const reference = formatCellReference(command);
          editor.setCellValue(sheet, reference, command.value);
          expected.set(reference, command.value);
        }
        const reopened = openSpreadsheet(openOpcPackage(editor.commit()));
        const worksheet = openWorksheet(reopened, reopened.sheets[0]!);
        for (const [reference, value] of expected) {
          const cell = worksheet.cell(reference);
          if (value === null) {
            expect(cell).toBeUndefined();
          } else if (typeof value === "string") {
            expect(cell?.value).toEqual({ type: "string", value, storage: "inline" });
          } else if (typeof value === "boolean") {
            expect(cell?.value).toEqual({ type: "boolean", value });
          } else {
            expect(cell?.value.type).toBe("number");
            expect(cell?.value.type === "number" ? cell.value.value : undefined).toBe(value === 0 ? 0 : value);
          }
        }
      },
    ), { numRuns: 200 });
  }, 30_000);

  test("opens a large sparse worksheet without materializing empty cells", () => {
    const rows = Array.from({ length: 5_000 }, (_, index) => {
      const row = index * 200 + 1;
      return `<row r="${row}"><c r="A${row}"><v>${index}</v></c><c r="XFD${row}"><v>${index + 1}</v></c></row>`;
    }).join("");
    const source = buildWorkbookFixture({
      sheets: [{ name: "Sparse", sheetId: 1, relationshipId: "sparse", xml: `<worksheet xmlns="${namespace}"><dimension ref="A1:XFD999801"/><sheetData>${rows}</sheetData></worksheet>` }],
    });
    const workbook = openSpreadsheet(openOpcPackage(source));
    const worksheet = openWorksheet(workbook, workbook.sheets[0]!);
    expect(worksheet.rows).toHaveLength(5_000);
    expect(worksheet.rows.reduce((count, row) => count + row.cells.length, 0)).toBe(10_000);
    expect(worksheet.cell("XFD999801")?.value).toMatchObject({ value: 5_000 });
    expect(worksheet.cell("B500000")).toBeUndefined();
  }, 30_000);
});
