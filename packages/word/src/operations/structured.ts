import * as Y from "yjs";
import { prepareWordOperation } from "./execute.ts";
import { wordOperation, type WordOperation } from "./definitions.ts";
import {
  applyStructuredChange,
  selectionText,
  editDerivedText,
  stageWordUpdate,
  type WordScopedSelection,
  type WordStructuredChange,
} from "../collaboration/structured/transactions.ts";
import {
  activeAxes,
  cellName,
  migrateTable,
  tableAddresses,
  WordTableConflict,
} from "../collaboration/structured/state.ts";
import { checkRange } from "../collaboration/structured/selection.ts";
import { structuredColumnWidths } from "../collaboration/structured/widths.ts";
import { resolveCell } from "../collaboration/structured/grid.ts";
import { tableParagraphs } from "../collaboration/tables.ts";

function defined<T extends object>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, part]) => part !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}
/** The supported operation adapter commits complete shared-document updates after migration. */
export function prepareWordScopedOperation(
  doc: Y.Doc,
  selection: WordScopedSelection,
  input: WordOperation,
  context: { availableWidthPoints?: number } = {},
) {
  const operation = wordOperation.parse(input);
  return stageWordUpdate(doc, (staged) => {
    if ("cell" in selection) {
      const cell = selection.cell;
      if (operation.name === "replace") {
        const result = applyStructuredChange(staged, {
          kind: "replace",
          selection,
          value: operation.input.value,
        })!;
        if (operation.input.format)
          applyStructuredChange(staged, {
            kind: "format",
            selection: {
              cell,
              range: { start: selection.range.start, end: result.range.end },
            },
            patch: defined(operation.input.format),
          });
        return result;
      }
      if (operation.name === "format")
        return applyStructuredChange(staged, {
          kind: "format",
          selection,
          patch: defined(operation.input),
        });
      if (operation.name === "format-table") {
        applyStructuredChange(staged, {
          kind: "table-format",
          cell,
          patch: defined(operation.input.patch),
        });
        return selection;
      }
      if (operation.name === "fit-table") {
        const width = context.availableWidthPoints;
        if (!width || !Number.isFinite(width))
          throw new Error("The host must resolve containing width.");
        const count = activeAxes(staged, cell, "column").length,
          weights =
            operation.input.columnWeights ??
            structuredColumnWidths(staged, cell) ??
            Array.from({ length: count }, () => 1);
        if (weights.length !== count || weights.some((w) => w <= 0))
          throw new Error("Supply positive column weights.");
        const total = weights.reduce((a, b) => a + b, 0);
        applyStructuredChange(staged, {
          kind: "table-format",
          cell,
          patch: {
            scope: "table",
            columnWidths: weights.map(
              (w) => (width * operation.input.fraction * w) / total,
            ),
          },
        });
        return selection;
      }
      if (operation.name === "edit-table") {
        const { action } = operation.input;
        const resolved = resolveCell(staged, cell);
        const rows = activeAxes(staged, cell, "row"),
          columns = activeAxes(staged, cell, "column");
        let change: WordStructuredChange;
        switch (action) {
          case "row-before":
          case "row-after":
            change = {
              kind: "insert-axis",
              table: cell,
              dimension: "row",
              at: rows.indexOf(cell.row) + (action === "row-after" ? 1 : 0),
            };
            break;
          case "column-before":
          case "column-after":
            change = {
              kind: "insert-axis",
              table: cell,
              dimension: "column",
              at:
                columns.indexOf(resolved.address.column) +
                (action === "column-after" ? resolved.columns.length : 0),
            };
            break;
          case "delete-row":
            change = {
              kind: "delete-axis",
              table: cell,
              dimension: "row",
              id: cell.row,
            };
            break;
          case "delete-column":
            change = {
              kind: "delete-axis",
              table: cell,
              dimension: "column",
              id: cell.column,
            };
            break;
          case "clear-cell": {
            for (const target of resolved.payloads) {
              const value = selectionText(staged, {
                cell: target,
                range: { start: 0, end: 0 },
              });
              applyStructuredChange(staged, {
                kind: "replace",
                selection: {
                  cell: target,
                  range: { start: 0, end: value ? value.end - value.start : 0 },
                },
                value: "",
              });
            }
            return { cell, range: { start: 0, end: 0 } };
          }
          case "merge-right":
          case "split-cell":
            change = { kind: action, cell };
            break;
          case "delete-table":
            change = { kind: "delete-table", table: cell };
            break;
        }
        applyStructuredChange(staged, change);
        return selection;
      }
    }
    const value = selectionText(staged, selection, true)!;
    checkRange(selection.range, value.end - value.start);
    if (operation.name === "move-object" && "story" in selection)
      selectionText(staged, {
        ...selection,
        range: {
          start: operation.input.destination,
          end: operation.input.destination,
        },
      });
    if (operation.name === "move-object")
      checkRange(
        {
          start: operation.input.destination,
          end: operation.input.destination,
        },
        value.end - value.start,
      );
    if ("cell" in selection && !("source" in value)) {
      const edit = editDerivedText(staged, selection.cell, value.text, (text) =>
        prepareWordOperation(text, selection.range, operation, context),
      );
      if (operation.name === "insert-table")
        for (const p of tableParagraphs(value.text))
          if (p.table && p.table.schema !== 2)
            migrateTable(staged, {
              story: cellName(selection.cell),
              table: p.table.id,
            });
      return { ...selection, range: edit.selection };
    }
    const range = {
      start: value.start + selection.range.start,
      end: value.start + selection.range.end,
    };
    const scopedOperation =
      operation.name === "move-object"
        ? {
            ...operation,
            input: {
              ...operation.input,
              destination: value.start + operation.input.destination,
            },
          }
        : operation;
    const edit = prepareWordOperation(
      value.text,
      range,
      scopedOperation,
      context,
    );
    value.text.applyDelta(edit.delta);
    if (operation.name === "insert-table" && "story" in selection) {
      const migrated = new Set(
        tableAddresses(staged)
          .filter((a) => a.story === selection.story)
          .map((a) => a.table),
      );
      for (const p of tableParagraphs(value.text))
        if (p.table && !migrated.has(p.table.id)) {
          migrateTable(staged, { story: selection.story, table: p.table.id });
          migrated.add(p.table.id);
        }
    }
    return {
      ...selection,
      range: {
        start: edit.selection.start - value.start,
        end: edit.selection.end - value.start,
      },
    };
  });
}
