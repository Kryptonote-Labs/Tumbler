import type * as Y from "yjs";
import { prepareWordOperation } from "../../operations/execute.ts";
import type { WordOperation } from "../../operations/definitions.ts";
import type { WordScopedOperationContext } from "../../operations/structured.ts";
import type { WordDelta, WordRange } from "../commands.ts";
import { isTableCell } from "../tables.ts";
import { cellName } from "./state.ts";
import type { WordScopedSelection } from "./types.ts";
import type { WordViewCell } from "./view-projection.ts";
import { withWordOperationText } from "./operation-text.ts";

/** Execute against visible paragraphs; raw retained baselines are not operation targets. */
export function prepareWordViewOperation(
  text: Y.Text,
  cells: readonly WordViewCell[],
  selection: WordScopedSelection,
  range: WordRange,
  operation: WordOperation,
  context: WordScopedOperationContext,
) {
  const execute = context.prepareOperation ?? prepareWordOperation;
  if ("story" in selection) return { ...execute(text, range, operation, context), scope: undefined };
  const scope = cells.find(scope => cellName(scope.cell) === cellName(selection.cell));
  if (!scope) throw new Error("The selected cell is no longer visible.");
  const delta: WordDelta = [];
  let offset = 0;
  const parts: { insert: string; attributes?: Record<string, unknown> }[] = text.toDelta();
  for (const part of parts) {
    const end = offset + part.insert.length;
    const from = Math.max(offset, scope.start), to = Math.min(end, scope.end);
    if (to > from) {
      const attributes = { ...part.attributes };
      const table: unknown = attributes.table;
      if (isTableCell(table)) {
        delete attributes.table;
        if (table.id !== scope.cell.table) {
          const parents = table.parents ?? [];
          const owner = parents.findIndex(parent => parent.id === scope.cell.table);
          const { parents: _parents, ...own } = table;
          attributes.table = { ...own, ...(owner + 1 < parents.length ? { parents: parents.slice(owner + 1) } : {}) };
        }
      }
      delta.push({ insert: part.insert.slice(from - offset, to - offset), attributes });
    }
    offset = end;
  }
  return withWordOperationText(text, delta, local => {
    const at = (position: number) => Math.min(local.length - 1, Math.max(0, position - scope.start));
    const scopedOperation = operation.name === "move-object"
      ? { ...operation, input: { ...operation.input, destination: operation.input.destination - scope.start } }
      : operation;
    const edit = execute(local, { start: at(range.start), end: at(range.end) }, scopedOperation, context);
    // The existing final cell terminator supplies the empty paragraph after a new nested table.
    const last = edit.delta.at(-1);
    const content = operation.name === "insert-table" && last?.insert === "\n" && !last.attributes?.table
      ? edit.delta.slice(0, -1) : edit.delta;
    return {
      ...edit,
      delta: [...(scope.start ? [{ retain: scope.start }] : []), ...content],
      selection: { start: scope.start + edit.selection.start, end: scope.start + edit.selection.end },
      scope,
    };
  });
}
