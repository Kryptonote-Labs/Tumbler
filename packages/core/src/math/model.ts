/**
 * Format-neutral equation model shared by Word, PowerPoint and spreadsheet annotations.
 *
 * An equation is a tree of rows. Every editable slot (numerator, script, radicand…) is a row,
 * so one caret model serves the whole tree: a caret is a row path plus an offset in that row.
 * Values are plain JSON so hosts can persist them in their own document state.
 */

export type MathRow = readonly MathNode[];

/** One character. Letters render italic unless `normal` marks upright text. */
export interface MathChar {
  readonly kind: "char";
  readonly value: string;
  readonly normal?: boolean;
}

export interface MathFraction {
  readonly kind: "fraction";
  readonly style?: "bar" | "skewed" | "linear" | "stacked";
  readonly num: MathRow;
  readonly den: MathRow;
}

export interface MathScript {
  readonly kind: "script";
  readonly base: MathRow;
  readonly sub?: MathRow;
  readonly sup?: MathRow;
  /** Scripts written before the base, as in ₙCᵣ. */
  readonly pre?: boolean;
}

export interface MathRadical {
  readonly kind: "radical";
  readonly degree?: MathRow;
  readonly body: MathRow;
}

export interface MathDelimiter {
  readonly kind: "delimiter";
  readonly open: string;
  readonly close: string;
  readonly body: MathRow;
}

export interface MathNary {
  readonly kind: "nary";
  readonly operator: string;
  readonly sub?: MathRow;
  readonly sup?: MathRow;
  readonly body: MathRow;
  /** Limits beside the operator instead of above and below it. */
  readonly side?: boolean;
}

export interface MathFunction {
  readonly kind: "function";
  readonly name: MathRow;
  readonly body: MathRow;
}

export interface MathAccent {
  readonly kind: "accent";
  readonly accent: string;
  readonly body: MathRow;
}

export interface MathLimit {
  readonly kind: "limit";
  readonly position: "lower" | "upper";
  readonly base: MathRow;
  readonly limit: MathRow;
}

export interface MathMatrix {
  readonly kind: "matrix";
  readonly rows: readonly (readonly MathRow[])[];
}

export type MathStructure =
  | MathFraction
  | MathScript
  | MathRadical
  | MathDelimiter
  | MathNary
  | MathFunction
  | MathAccent
  | MathLimit
  | MathMatrix;

export type MathNode = MathChar | MathStructure;

export interface MathEquation {
  readonly body: MathRow;
  /** The source has formatting or structures that this preview cannot represent for editing. */
  readonly readOnly?: true;
}

/** A row inside the tree: each step names a structure in the current row and one of its slots. */
export type MathPath = readonly MathPathStep[];
export interface MathPathStep {
  readonly index: number;
  readonly slot: string;
}

export interface MathPosition {
  readonly path: MathPath;
  readonly offset: number;
}

export const emptyEquation: MathEquation = Object.freeze({ body: Object.freeze([]) });

export function mathChars(text: string, normal = false): MathChar[] {
  return [...text].map((value) => (normal ? { kind: "char", value, normal } : { kind: "char", value }));
}

/** Editable slots in caret order. Optional slots are listed only when present. */
export function mathSlots(node: MathNode): readonly string[] {
  switch (node.kind) {
    case "char":
      return [];
    case "fraction":
      return ["num", "den"];
    case "script":
      return [
        ...(node.pre ? [] : ["base"]),
        ...(node.sub ? ["sub"] : []),
        ...(node.sup ? ["sup"] : []),
        ...(node.pre ? ["base"] : []),
      ];
    case "radical":
      return node.degree ? ["degree", "body"] : ["body"];
    case "delimiter":
    case "accent":
      return ["body"];
    case "nary":
      return [...(node.sub ? ["sub"] : []), ...(node.sup ? ["sup"] : []), "body"];
    case "function":
      return ["name", "body"];
    case "limit":
      return ["base", "limit"];
    case "matrix":
      return node.rows.flatMap((row, r) => row.map((_, c) => `r${r}c${c}`));
  }
}

function matrixCell(slot: string) {
  const match = /^r(\d+)c(\d+)$/.exec(slot);
  return match ? { row: Number(match[1]), column: Number(match[2]) } : undefined;
}

export function mathSlot(node: MathNode, slot: string): MathRow {
  if (node.kind === "matrix") {
    const cell = matrixCell(slot);
    const row = cell && node.rows[cell.row]?.[cell.column];
    if (!row) throw new RangeError(`Matrix has no ${slot} cell.`);
    return row;
  }
  const value = (node as unknown as Record<string, unknown>)[slot];
  if (!Array.isArray(value) || !mathSlots(node).includes(slot)) throw new RangeError(`${node.kind} has no ${slot} slot.`);
  return value as MathRow;
}

export function withMathSlot<T extends MathNode>(node: T, slot: string, row: MathRow): T {
  if (node.kind === "matrix") {
    const cell = matrixCell(slot)!;
    return {
      ...node,
      rows: node.rows.map((cells, r) => (r === cell.row ? cells.map((value, c) => (c === cell.column ? row : value)) : cells)),
    };
  }
  mathSlot(node, slot);
  return { ...node, [slot]: row };
}

export function mathRowAt(body: MathRow, path: MathPath): MathRow {
  let row = body;
  for (const step of path) {
    const node = row[step.index];
    if (!node) throw new RangeError("Equation path does not exist.");
    row = mathSlot(node, step.slot);
  }
  return row;
}

export function mathNodeAt(body: MathRow, path: MathPath, index: number): MathNode | undefined {
  return mathRowAt(body, path)[index];
}

/** Replace one row, rebuilding only its ancestors. */
export function updateMathRow(body: MathRow, path: MathPath, update: (row: MathRow) => MathRow): MathRow {
  if (!path.length) return update(body);
  const [step, ...rest] = path;
  const node = body[step!.index];
  if (!node) throw new RangeError("Equation path does not exist.");
  const next = withMathSlot(node, step!.slot, updateMathRow(mathSlot(node, step!.slot), rest, update));
  return body.map((value, index) => (index === step!.index ? next : value));
}

export function samePath(a: MathPath, b: MathPath) {
  return a.length === b.length && a.every((step, index) => step.index === b[index]!.index && step.slot === b[index]!.slot);
}

export function samePosition(a: MathPosition, b: MathPosition) {
  return a.offset === b.offset && samePath(a.path, b.path);
}

export function isMathEmpty(row: MathRow) {
  return row.length === 0;
}

/** Validate untrusted persisted data before a host renders or edits it. */
export function isMathEquation(value: unknown): value is MathEquation {
  return !!value && typeof value === "object" && isRow((value as { body?: unknown }).body, 0);
}

const MAX_DEPTH = 32;
function isRow(value: unknown, depth: number): value is MathRow {
  return Array.isArray(value) && depth <= MAX_DEPTH && value.every((node) => isNode(node, depth));
}
function isText(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 8;
}
function optionalRow(value: unknown, depth: number) {
  return value === undefined || isRow(value, depth + 1);
}
function isNode(value: unknown, depth: number): value is MathNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  switch (node.kind) {
    case "char":
      return isText(node.value) && (node.normal === undefined || typeof node.normal === "boolean");
    case "fraction":
      return isRow(node.num, depth + 1) && isRow(node.den, depth + 1) &&
        (node.style === undefined || ["bar", "skewed", "linear", "stacked"].includes(node.style as string));
    case "script":
      return isRow(node.base, depth + 1) && optionalRow(node.sub, depth) && optionalRow(node.sup, depth) &&
        (node.sub !== undefined || node.sup !== undefined);
    case "radical":
      return isRow(node.body, depth + 1) && optionalRow(node.degree, depth);
    case "delimiter":
      return typeof node.open === "string" && typeof node.close === "string" && node.open.length <= 2 && node.close.length <= 2 && isRow(node.body, depth + 1);
    case "nary":
      return isText(node.operator) && isRow(node.body, depth + 1) && optionalRow(node.sub, depth) && optionalRow(node.sup, depth);
    case "function":
      return isRow(node.name, depth + 1) && isRow(node.body, depth + 1);
    case "accent":
      return isText(node.accent) && isRow(node.body, depth + 1);
    case "limit":
      return (node.position === "lower" || node.position === "upper") && isRow(node.base, depth + 1) && isRow(node.limit, depth + 1);
    case "matrix":
      return Array.isArray(node.rows) && node.rows.length > 0 && node.rows.length <= 64 &&
        node.rows.every((row) => Array.isArray(row) && row.length === (node.rows as unknown[][])[0]!.length && row.length > 0 && row.length <= 64 && row.every((cell) => isRow(cell, depth + 1)));
    default:
      return false;
  }
}
