import { beginLosslessXmlEdit, type LosslessXmlElement } from "@tumblerjs/ooxml";
import type { PresentationArtifact } from "./artifact.ts";
import { objectTarget } from "./authoring-objects.ts";
import { children, editable, raw } from "./authoring-slides.ts";
import { commitXml, xml } from "./authoring-xml.ts";
type TableEdit = Extract<import("./commands.ts").PresentationCommand, { name: "edit-table" }>;
type Cell = {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  element: LosslessXmlElement;
  empty?: boolean;
  paragraphs?: string;
};
/** Structural edits operate on anchor rectangles and retain content when a spanning anchor moves. */
export function editPresentationTable(artifact: PresentationArtifact, input: TableEdit) {
  editable(artifact);
  const { object, source, element, slide } = objectTarget(artifact, input.slideId, input.objectKey);
  if (!object.table) throw new Error("Select a table.");
  const find = (node: LosslessXmlElement, name: string): LosslessXmlElement | undefined =>
    node.localName === name
      ? node
      : children(node)
          .map((child) => find(child, name))
          .find(Boolean);
  const table = find(element, "tbl")!,
    grid = children(table).find((e) => e.localName === "tblGrid")!,
    rows = children(table).filter((e) => e.localName === "tr");
  const physical = rows.map((row) => children(row).filter((e) => e.localName === "tc"));
  const attr = (node: LosslessXmlElement, name: string) =>
    node.attributes.find((a) => !a.namespaceUri && a.localName === name)?.value;
  const widths = children(grid).map((e) => Number(attr(e, "w"))),
    heights = rows.map((e) => Number(attr(e, "h")));
  const oldWidths = [...widths],
    oldHeights = [...heights];
  const bindingMap = new Map<number, Map<string, string>>();
  const bindings = (node: LosslessXmlElement, parent: Map<string, string>) => {
    const current = new Map(parent);
    for (const a of node.attributes)
      if (a.prefix === "xmlns" || a.qualified === "xmlns") current.set(a.qualified, a.value);
    bindingMap.set(node.id, current);
    for (const child of children(node)) bindings(child, current);
  };
  bindings(source.root, new Map());
  const opening = (node: LosslessXmlElement, changes: Record<string, string | undefined> = {}) => {
    let open = source.source
      .slice(node.startTagSpan.start, node.startTagSpan.end)
      .replace(/\/\s*>$/, ">");
    for (const [name, value] of Object.entries(changes)) {
      const attribute = node.attributes.find((a) => a.qualified === name);
      if (attribute)
        open = open.replace(
          source.source.slice(attribute.span.start, attribute.span.end),
          value === undefined ? "" : `${name}="${xml(value)}"`,
        );
      else if (value !== undefined) open = open.slice(0, -1) + ` ${name}="${xml(value)}">`;
    }
    for (const [name, value] of bindingMap.get(node.id) ?? [])
      if (!node.attributes.some((a) => a.qualified === name))
        open = open.slice(0, -1) + ` ${name}="${xml(value)}">`;
    return open;
  };
  const portable = (node: LosslessXmlElement) =>
    opening(node) +
    (node.endTagSpan ? source.source.slice(node.startTagSpan.end, node.endTagSpan.start) : "") +
    `</${node.qualified}>`;
  let cells: Cell[] = object.table.cells.map((cell) => ({
    ...cell,
    element: source.element(cell.elementId)!,
  }));
  const inserting = input.action.startsWith("insert-"),
    isRow = input.action.endsWith("row"),
    isColumn = input.action.endsWith("column");
  const rowLimit = heights.length + (input.action === "insert-row" ? 1 : 0),
    columnLimit = widths.length + (input.action === "insert-column" ? 1 : 0);
  if (
    !Number.isInteger(input.row) ||
    !Number.isInteger(input.column) ||
    input.row < 0 ||
    input.column < 0 ||
    input.row >= rowLimit ||
    input.column >= columnLimit
  )
    throw new RangeError("Table cell is outside the grid.");
  if (isRow || isColumn) {
    const sizes = isRow ? heights : widths,
      index = isRow ? input.row : input.column;
    if (!inserting && sizes.length === 1)
      throw new Error("Keep at least one table row and column.");
    if (inserting) sizes.splice(index, 0, sizes[Math.min(index, sizes.length - 1)]!);
    else sizes.splice(index, 1);
    cells = cells.flatMap((cell) => {
      const start = isRow ? cell.row : cell.column,
        span = isRow ? cell.rowSpan : cell.columnSpan;
      let nextStart = start,
        nextSpan = span;
      if (inserting) {
        if (index <= start) nextStart++;
        else if (index < start + span) nextSpan++;
      } else {
        if (index < start) nextStart--;
        else if (index < start + span) nextSpan--;
      }
      if (!nextSpan) return [];
      return [
        {
          ...cell,
          ...(isRow
            ? { row: nextStart, rowSpan: nextSpan }
            : { column: nextStart, columnSpan: nextSpan }),
        },
      ];
    });
  } else if (input.action === "merge") {
    const bottom = input.endRow ?? input.row,
      right = input.endColumn ?? input.column;
    if (
      !Number.isInteger(bottom) ||
      !Number.isInteger(right) ||
      bottom < input.row ||
      right < input.column ||
      bottom >= heights.length ||
      right >= widths.length
    )
      throw new RangeError("Invalid table merge range.");
    const selected = cells.filter(
      (cell) =>
        cell.row <= bottom &&
        cell.column <= right &&
        cell.row + cell.rowSpan > input.row &&
        cell.column + cell.columnSpan > input.column,
    );
    if (
      selected.some(
        (cell) =>
          cell.row < input.row ||
          cell.column < input.column ||
          cell.row + cell.rowSpan - 1 > bottom ||
          cell.column + cell.columnSpan - 1 > right,
      )
    )
      throw new Error("Select complete merged cells.");
    const anchor = selected.find((cell) => cell.row === input.row && cell.column === input.column)!;
    const paragraphs = selected
      .flatMap((cell) =>
        children(children(cell.element).find((e) => e.localName === "txBody")!)
          .filter((e) => e.localName === "p")
          .map(portable),
      )
      .join("");
    cells = cells.filter((cell) => !selected.includes(cell));
    cells.push({
      ...anchor,
      rowSpan: bottom - input.row + 1,
      columnSpan: right - input.column + 1,
      paragraphs,
    });
  } else {
    const anchor = cells.find(
      (cell) =>
        input.row >= cell.row &&
        input.column >= cell.column &&
        input.row < cell.row + cell.rowSpan &&
        input.column < cell.column + cell.columnSpan,
    )!;
    cells = cells.map((cell) => (cell === anchor ? { ...cell, rowSpan: 1, columnSpan: 1 } : cell));
  }
  const coverage = new Map<string, Cell>();
  for (const cell of cells)
    for (let r = cell.row; r < cell.row + cell.rowSpan; r++)
      for (let c = cell.column; c < cell.column + cell.columnSpan; c++)
        coverage.set(`${r}:${c}`, cell);
  const oldRow = (r: number) =>
    isRow
      ? inserting
        ? r === input.row
          ? undefined
          : r > input.row
            ? r - 1
            : r
        : r >= input.row
          ? r + 1
          : r
      : r;
  const oldColumn = (c: number) =>
    isColumn
      ? inserting
        ? c === input.column
          ? undefined
          : c > input.column
            ? c - 1
            : c
        : c >= input.column
          ? c + 1
          : c
      : c;
  const template = (r: number, c: number) =>
    physical[Math.min(r, physical.length - 1)]![Math.min(c, oldWidths.length - 1)]!;
  const serializeCell = (r: number, c: number) => {
    const owner = coverage.get(`${r}:${c}`),
      anchor = owner?.row === r && owner.column === c,
      previousRow = oldRow(r),
      previousColumn = oldColumn(c);
    const sourceCell = anchor
      ? owner!.element
      : previousRow === undefined || previousColumn === undefined
        ? template(r, c)
        : physical[previousRow]![previousColumn]!;
    const isNew =
      !owner &&
      (previousRow === undefined || previousColumn === undefined || input.action === "split");
    const covered = !!owner && !anchor,
      empty = isNew || (covered && input.action === "merge");
    const attributes = {
      rowSpan: owner && r === owner.row && owner.rowSpan > 1 ? String(owner!.rowSpan) : undefined,
      gridSpan:
        owner && c === owner.column && owner.columnSpan > 1 ? String(owner!.columnSpan) : undefined,
      hMerge: covered && c > owner!.column ? "1" : undefined,
      vMerge: covered && r > owner!.row ? "1" : undefined,
    };
    const body = children(sourceCell).find((e) => e.localName === "txBody")!;
    const paragraphs =
      anchor && owner!.paragraphs !== undefined
        ? owner!.paragraphs
        : empty
          ? `<a:p xmlns:a="${body.namespaceUri}"/>`
          : undefined;
    const inner = children(sourceCell)
      .map((child) =>
        child !== body || paragraphs === undefined
          ? raw(source, child)
          : opening(body) +
            children(body)
              .filter((e) => e.localName !== "p")
              .map((e) => raw(source, e))
              .join("") +
            paragraphs +
            `</${body.qualified}>`,
      )
      .join("");
    return opening(sourceCell, attributes) + inner + `</${sourceCell.qualified}>`;
  };
  const namespace = table.namespaceUri;
  const rowMarkup = heights
    .map((height, r) => {
      const previous = oldRow(r),
        original = previous === undefined ? undefined : rows[previous];
      const content = widths.map((_, c) => serializeCell(r, c)).join("");
      return original
        ? opening(original, { h: String(height) }) +
            content +
            children(original)
              .filter((e) => e.localName !== "tc")
              .map((e) => raw(source, e))
              .join("") +
            `</${original.qualified}>`
        : `<a:tr xmlns:a="${namespace}" h="${height}">${content}</a:tr>`;
    })
    .join("");
  const gridMarkup = `<a:tblGrid xmlns:a="${namespace}">${widths.map((w) => `<a:gridCol w="${w}"/>`).join("")}</a:tblGrid>`;
  const content =
    children(table)
      .filter((e) => e.localName !== "tr" && e.localName !== "tblGrid")
      .map((e) => raw(source, e))
      .join("") +
    gridMarkup +
    rowMarkup;
  const edit = beginLosslessXmlEdit(source);
  edit.replaceElementMarkup(table, opening(table) + content + `</${table.qualified}>`);
  const extent = children(children(element).find((e) => e.localName === "xfrm")!).find(
    (e) => e.localName === "ext",
  )!;
  for (const [name, previous, next] of [
    ["cx", oldWidths, widths],
    ["cy", oldHeights, heights],
  ] as const) {
    const attribute = extent.attributes.find((a) => a.localName === name)!;
    const value = Math.round(
      (Number(attribute.value) * next.reduce((a, b) => a + b, 0)) /
        previous.reduce((a, b) => a + b, 0),
    );
    if (value > 2147483647) throw new RangeError("Table size exceeds DrawingML coordinates.");
    edit.setAttribute(attribute, String(value));
  }
  return commitXml(artifact, slide.part, edit.commit().bytes);
}
