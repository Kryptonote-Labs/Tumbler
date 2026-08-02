export interface GridPoint {
  readonly row: number;
  readonly column: number;
}

export interface GridRange {
  readonly start: GridPoint;
  readonly end: GridPoint;
}

export interface GridSelection {
  readonly anchor: GridPoint;
  readonly focus: GridPoint;
  readonly range: GridRange;
}

export interface GridBounds {
  readonly rows: number;
  readonly columns: number;
}

export type GridDirection = "down" | "left" | "right" | "up";

export function createGridSelection(anchor: GridPoint, focus: GridPoint = anchor): GridSelection {
  const validatedAnchor = point(anchor);
  const validatedFocus = point(focus);
  return Object.freeze({
    anchor: validatedAnchor,
    focus: validatedFocus,
    range: normalizeGridRange(validatedAnchor, validatedFocus),
  });
}

export function normalizeGridRange(left: GridPoint, right: GridPoint): GridRange {
  const first = point(left);
  const second = point(right);
  return Object.freeze({
    start: Object.freeze({
      row: Math.min(first.row, second.row),
      column: Math.min(first.column, second.column),
    }),
    end: Object.freeze({
      row: Math.max(first.row, second.row),
      column: Math.max(first.column, second.column),
    }),
  });
}

export function moveGridSelection(
  selection: GridSelection,
  direction: GridDirection,
  bounds: GridBounds,
  options: { readonly extend?: boolean } = {},
): GridSelection {
  validateBounds(bounds);
  const delta = direction === "up"
    ? { row: -1, column: 0 }
    : direction === "down"
      ? { row: 1, column: 0 }
      : direction === "left"
        ? { row: 0, column: -1 }
        : { row: 0, column: 1 };
  const focus = Object.freeze({
    row: clamp(selection.focus.row + delta.row, 1, bounds.rows),
    column: clamp(selection.focus.column + delta.column, 1, bounds.columns),
  });
  return options.extend === true
    ? createGridSelection(selection.anchor, focus)
    : createGridSelection(focus);
}

function point(value: GridPoint): GridPoint {
  if (!Number.isSafeInteger(value.row) || value.row < 1 || !Number.isSafeInteger(value.column) || value.column < 1) {
    throw new RangeError("Grid points use positive one-based integer coordinates.");
  }
  return Object.freeze({ row: value.row, column: value.column });
}

function validateBounds(bounds: GridBounds): void {
  if (!Number.isSafeInteger(bounds.rows) || bounds.rows < 1 || !Number.isSafeInteger(bounds.columns) || bounds.columns < 1) {
    throw new RangeError("Grid bounds must contain positive integer row and column counts.");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
