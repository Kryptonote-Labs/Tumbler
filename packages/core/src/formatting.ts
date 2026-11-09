import { THEME_COLOR_SLOTS, type ThemeColorSlot } from "@tumblerjs/ooxml";

export type FormattingChange<T> =
  | { readonly set: T }
  | { readonly inherit: true };

export type TextUnderline = "none" | "single" | "double";
export type HorizontalAlignment = "start" | "center" | "end" | "justify";
export type VerticalAlignment = "top" | "center" | "bottom";

/** DrawingML theme colour scheme slot, in SpreadsheetML theme-index order. */
export type OfficeThemeColorSlot = ThemeColorSlot;
export const OFFICE_THEME_COLOR_SLOTS: readonly OfficeThemeColorSlot[] = THEME_COLOR_SLOTS;

/**
 * Office colour identity. A theme colour keeps its slot and tint so it follows
 * theme changes. `tint` uses SpreadsheetML semantics: -1 darkens to black,
 * 1 lightens to white, and omission means 0. `value` is the resolved
 * `#RRGGBB` display/fallback colour when the adapter knows it.
 */
export type OfficeColor =
  | { readonly type: "automatic" }
  | { readonly type: "rgb"; readonly value: string }
  | { readonly type: "theme"; readonly slot: OfficeThemeColorSlot; readonly tint?: number; readonly value?: string };

/** Spreadsheet-style cell fill. Pattern and gradient fills are reported as unavailable. */
export type CellFill =
  | { readonly type: "none" }
  | { readonly type: "solid"; readonly color: OfficeColor };

/**
 * Text rotation in degrees from -90 (clockwise) to 90 (counterclockwise), or
 * vertically stacked characters.
 */
export type CellTextRotation = number | "vertical";

export interface TextFormattingPatch {
  readonly fontSize?: FormattingChange<number>;
  readonly fontFamily?: FormattingChange<string>;
  readonly bold?: FormattingChange<boolean>;
  readonly italic?: FormattingChange<boolean>;
  readonly underline?: FormattingChange<TextUnderline>;
  readonly strike?: FormattingChange<boolean>;
  readonly color?: FormattingChange<OfficeColor>;
}

export interface BlockFormattingPatch {
  readonly horizontalAlignment?: FormattingChange<HorizontalAlignment>;
  readonly verticalAlignment?: FormattingChange<VerticalAlignment>;
}

/** Properties that exist only on spreadsheet-style cells. */
export interface CellFormattingPatch {
  readonly fill?: FormattingChange<CellFill>;
  readonly wrapText?: FormattingChange<boolean>;
  readonly textRotation?: FormattingChange<CellTextRotation>;
  /** Indent level; Excel accepts whole levels from 0 to 250. */
  readonly indent?: FormattingChange<number>;
}

/** Semantic formatting shared by cells, paragraphs, and presentation text frames. */
export interface FormattingPatch {
  readonly text?: TextFormattingPatch;
  readonly block?: BlockFormattingPatch;
  /** Only adapters advertising `FormattingCapabilities.cell` accept this group. */
  readonly cell?: CellFormattingPatch;
}

export type FormattingValue<T> =
  | { readonly state: "value"; readonly value: T }
  | { readonly state: "inherited"; readonly value: T }
  | { readonly state: "mixed" }
  | { readonly state: "unavailable" };

export interface TextFormattingState {
  readonly fontSize: FormattingValue<number>;
  readonly fontFamily: FormattingValue<string>;
  readonly bold: FormattingValue<boolean>;
  readonly italic: FormattingValue<boolean>;
  readonly underline: FormattingValue<TextUnderline>;
  /** Present when the adapter can report strikethrough. */
  readonly strike?: FormattingValue<boolean>;
  readonly color: FormattingValue<OfficeColor>;
}

export interface BlockFormattingState {
  readonly horizontalAlignment: FormattingValue<HorizontalAlignment>;
  readonly verticalAlignment: FormattingValue<VerticalAlignment>;
}

export interface CellFormattingState {
  readonly fill: FormattingValue<CellFill>;
  readonly wrapText: FormattingValue<boolean>;
  readonly textRotation: FormattingValue<CellTextRotation>;
  readonly indent: FormattingValue<number>;
}

export interface FormattingState {
  readonly text: TextFormattingState;
  readonly block: BlockFormattingState;
  readonly cell?: CellFormattingState;
}

export interface FormattingCapabilities {
  readonly text: {
    readonly fontSize: false | { readonly minimum: number; readonly maximum: number };
    readonly fontFamily: boolean;
    readonly bold: boolean;
    readonly italic: boolean;
    readonly underline: false | readonly TextUnderline[];
    readonly strike?: boolean;
    readonly color: boolean;
    /** Whether colours may name theme slots rather than only RGB values. */
    readonly themeColor?: boolean;
  };
  readonly block: {
    readonly horizontalAlignment: false | readonly HorizontalAlignment[];
    readonly verticalAlignment: false | readonly VerticalAlignment[];
  };
  readonly cell?: {
    readonly fill: boolean;
    readonly wrapText: boolean;
    readonly textRotation: false | { readonly minimum: number; readonly maximum: number; readonly vertical: boolean };
    readonly indent: false | { readonly minimum: number; readonly maximum: number };
  };
}

/** A format adapter supplies a target while heads consume one stable contract. */
export interface FormattingAdapter<TTarget, TResult> {
  formattingCapabilities(target: TTarget): FormattingCapabilities;
  formattingState(target: TTarget): FormattingState;
  applyFormatting(target: TTarget, patch: FormattingPatch): TResult;
}

/** Validates and freezes caller-owned formatting input at a public boundary. */
export function normalizeFormattingPatch(patch: FormattingPatch): FormattingPatch {
  const text = patch.text === undefined ? undefined : Object.freeze({
    ...patch.text,
    ...(patch.text.fontSize === undefined ? {} : { fontSize: change(patch.text.fontSize, fontSize) }),
    ...(patch.text.fontFamily === undefined ? {} : { fontFamily: change(patch.text.fontFamily, fontFamily) }),
    ...(patch.text.bold === undefined ? {} : { bold: change(patch.text.bold, booleanValue) }),
    ...(patch.text.italic === undefined ? {} : { italic: change(patch.text.italic, booleanValue) }),
    ...(patch.text.underline === undefined ? {} : { underline: change(patch.text.underline, underline) }),
    ...(patch.text.strike === undefined ? {} : { strike: change(patch.text.strike, booleanValue) }),
    ...(patch.text.color === undefined ? {} : { color: change(patch.text.color, normalizeOfficeColor) }),
  });
  const block = patch.block === undefined ? undefined : Object.freeze({
    ...patch.block,
    ...(patch.block.horizontalAlignment === undefined ? {} : {
      horizontalAlignment: change(patch.block.horizontalAlignment, horizontalAlignment),
    }),
    ...(patch.block.verticalAlignment === undefined ? {} : {
      verticalAlignment: change(patch.block.verticalAlignment, verticalAlignment),
    }),
  });
  const cell = patch.cell === undefined ? undefined : Object.freeze({
    ...patch.cell,
    ...(patch.cell.fill === undefined ? {} : { fill: change(patch.cell.fill, cellFill) }),
    ...(patch.cell.wrapText === undefined ? {} : { wrapText: change(patch.cell.wrapText, booleanValue) }),
    ...(patch.cell.textRotation === undefined ? {} : { textRotation: change(patch.cell.textRotation, textRotation) }),
    ...(patch.cell.indent === undefined ? {} : { indent: change(patch.cell.indent, indent) }),
  });
  return Object.freeze({
    ...(text === undefined ? {} : { text }),
    ...(block === undefined ? {} : { block }),
    ...(cell === undefined ? {} : { cell }),
  });
}

function change<T>(input: FormattingChange<T>, validate: (value: T) => T): FormattingChange<T> {
  if ("inherit" in input) {
    if (input.inherit !== true || "set" in input) throw new TypeError("An inherited formatting change cannot also set a value.");
    return Object.freeze({ inherit: true });
  }
  if (!("set" in input)) throw new TypeError("A formatting change must set a value or inherit it.");
  return Object.freeze({ set: validate(input.set) });
}

function fontSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Font size must be a finite positive number.");
  }
  return value;
}

function fontFamily(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 255) {
    throw new RangeError("Font family must contain between 1 and 255 characters.");
  }
  return normalized;
}

function booleanValue(value: boolean): boolean {
  if (typeof value !== "boolean") throw new TypeError("Boolean formatting properties require a boolean value.");
  return value;
}

function underline(value: TextUnderline): TextUnderline {
  if (value !== "none" && value !== "single" && value !== "double") throw new TypeError("Unsupported underline style.");
  return value;
}

/** Validates an Office colour and returns its canonical frozen form. */
export function normalizeOfficeColor(value: OfficeColor): OfficeColor {
  if (value.type === "automatic") return Object.freeze({ type: "automatic" });
  if (value.type === "rgb") return Object.freeze({ type: "rgb", value: rgbValue(value.value) });
  if (value.type !== "theme" || !OFFICE_THEME_COLOR_SLOTS.includes(value.slot)) {
    throw new TypeError("Theme colors require a theme slot such as accent1.");
  }
  const tint = value.tint ?? 0;
  if (!Number.isFinite(tint) || tint < -1 || tint > 1) throw new RangeError("Theme color tint must be between -1 and 1.");
  return Object.freeze({
    type: "theme",
    slot: value.slot,
    ...(tint === 0 ? {} : { tint }),
    ...(value.value === undefined ? {} : { value: rgbValue(value.value) }),
  });
}

/** Compares colour identity, ignoring a theme colour's resolved display value. */
export function officeColorsEqual(left: OfficeColor, right: OfficeColor): boolean {
  switch (left.type) {
    case "automatic": return right.type === "automatic";
    case "rgb": return right.type === "rgb" && left.value.toUpperCase() === right.value.toUpperCase();
    case "theme": return right.type === "theme" && left.slot === right.slot && (left.tint ?? 0) === (right.tint ?? 0);
  }
}

function rgbValue(value: string): string {
  if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) throw new TypeError("RGB formatting colors use #RRGGBB notation.");
  return value.toUpperCase();
}

function cellFill(value: CellFill): CellFill {
  if (value.type === "none") return Object.freeze({ type: "none" });
  if (value.type !== "solid") throw new TypeError("Cell fills are none or solid.");
  return Object.freeze({ type: "solid", color: normalizeOfficeColor(value.color) });
}

function textRotation(value: CellTextRotation): CellTextRotation {
  if (value === "vertical") return value;
  if (typeof value !== "number" || !Number.isInteger(value) || value < -90 || value > 90) {
    throw new RangeError("Text rotation must be a whole number of degrees from -90 to 90, or vertical.");
  }
  return value;
}

function indent(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 250) throw new RangeError("Indent must be a whole level from 0 to 250.");
  return value;
}

function horizontalAlignment(value: HorizontalAlignment): HorizontalAlignment {
  if (value !== "start" && value !== "center" && value !== "end" && value !== "justify") {
    throw new TypeError("Unsupported horizontal alignment.");
  }
  return value;
}

function verticalAlignment(value: VerticalAlignment): VerticalAlignment {
  if (value !== "top" && value !== "center" && value !== "bottom") throw new TypeError("Unsupported vertical alignment.");
  return value;
}
