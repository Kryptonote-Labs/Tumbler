import { writeWordDocumentSettings } from '../collaboration/document-settings.ts';
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
  cellAddressFromName,
  migrateTable,
  tableAddresses,
  WordTableConflict,
} from "../collaboration/structured/state.ts";
import { checkRange } from "../collaboration/structured/selection.ts";
import { structuredColumnWidths } from "../collaboration/structured/widths.ts";
import { resolveCell } from "../collaboration/structured/grid.ts";
import { tableParagraphs } from "../collaboration/tables.ts";
import { clearWordCell } from "../collaboration/structured/clear.ts";
import { withWordOperationText } from "../collaboration/structured/operation-text.ts";
import { getWordSharedText, WordSharedText } from "../collaboration/structured/view.ts";
import { applyWordViewOperation } from "../collaboration/structured/view-operations.ts";

function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, part]) => part !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
export type WordScopedOperationContext = {
  availableWidthPoints?: number;
  prepareOperation?: typeof prepareWordOperation;
};

/** The supported operation adapter commits complete shared-document updates after migration. */
export function prepareWordScopedOperation(
  doc: Y.Doc,
  selection: WordScopedSelection,
  input: WordOperation,
  context: WordScopedOperationContext = {},
) {
  return stageWordUpdate(doc, (staged) =>
    applyWordScopedOperation(staged, selection, input, context),
  );
}

/** Apply inside an existing staged transaction; the caller validates and commits its full update. */
export function applyWordScopedOperation(
  staged: Y.Doc,
  selection: WordScopedSelection,
  input: WordOperation,
  context: WordScopedOperationContext = {},
) {
  const operation = wordOperation.parse(input);
  if (operation.name === 'page-color') {
    writeWordDocumentSettings(staged, { background: operation.input.color });
    return selection;
  }
  if ("cell" in selection) {
    const cell = selection.cell;
    if (operation.name === "insert-table") {
      let story = cell.story;
      while (story.startsWith("word-cell-v2:")) story = cellAddressFromName(story).story;
      const previous = getWordSharedText(staged.getText(story));
      const view = previous ?? new WordSharedText(staged, story);
      try {
        view.sync();
        const result = applyWordViewOperation(
          staged, story, view.text, selection, view.range(selection), operation, context,
        );
        view.sync();
        return view.selection(result);
      } finally {
        if (!previous) view.destroy();
      }
    }
    if (operation.name === "replace" && !context.prepareOperation) {
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
    if (operation.name === "format" && !context.prepareOperation)
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
          columnWidths: weights.map((w) => (width * operation.input.fraction * w) / total),
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
          const offsets = resolved.payloads.map(target => clearWordCell(staged, target));
          const at = offsets[0] ?? 0;
          return { cell: resolved.payloads[0] ?? cell, range: { start: at, end: at } };
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
      // Deletion has no surviving cell target. Linear hosts choose a new visible caret.
      if (action === "delete-row" || action === "delete-column" || action === "delete-table")
        return undefined;
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
      withWordOperationText(value.text, text.toDelta(), local =>
        (context.prepareOperation ?? prepareWordOperation)(local, selection.range, operation, context),
      ),
    );
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
  const edit = (context.prepareOperation ?? prepareWordOperation)(value.text, range, scopedOperation, context);
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
}
