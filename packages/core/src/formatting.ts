export type FormattingChange<T> =
  | { readonly set: T }
  | { readonly inherit: true };

export type TextUnderline = "none" | "single" | "double";
export type HorizontalAlignment = "start" | "center" | "end" | "justify";
export type VerticalAlignment = "top" | "center" | "bottom";

export type OfficeColor =
  | { readonly type: "automatic" }
  | { readonly type: "rgb"; readonly value: string };

export interface TextFormattingPatch {
  readonly fontSize?: FormattingChange<number>;
  readonly fontFamily?: FormattingChange<string>;
  readonly bold?: FormattingChange<boolean>;
  readonly italic?: FormattingChange<boolean>;
  readonly underline?: FormattingChange<TextUnderline>;
  readonly color?: FormattingChange<OfficeColor>;
}

export interface BlockFormattingPatch {
  readonly horizontalAlignment?: FormattingChange<HorizontalAlignment>;
  readonly verticalAlignment?: FormattingChange<VerticalAlignment>;
}

/** Semantic formatting shared by cells, paragraphs, and presentation text frames. */
export interface FormattingPatch {
  readonly text?: TextFormattingPatch;
  readonly block?: BlockFormattingPatch;
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
  readonly color: FormattingValue<OfficeColor>;
}

export interface BlockFormattingState {
  readonly horizontalAlignment: FormattingValue<HorizontalAlignment>;
  readonly verticalAlignment: FormattingValue<VerticalAlignment>;
}

export interface FormattingState {
  readonly text: TextFormattingState;
  readonly block: BlockFormattingState;
}

export interface FormattingCapabilities {
  readonly text: {
    readonly fontSize: false | { readonly minimum: number; readonly maximum: number };
    readonly fontFamily: boolean;
    readonly bold: boolean;
    readonly italic: boolean;
    readonly underline: false | readonly TextUnderline[];
    readonly color: boolean;
  };
  readonly block: {
    readonly horizontalAlignment: false | readonly HorizontalAlignment[];
    readonly verticalAlignment: false | readonly VerticalAlignment[];
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
    ...(patch.text.color === undefined ? {} : { color: change(patch.text.color, color) }),
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
  return Object.freeze({ ...(text === undefined ? {} : { text }), ...(block === undefined ? {} : { block }) });
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
  if (!Number.isFinite(value) || value < 1 || value > 409) {
    throw new RangeError("Font size must be between 1 and 409 points.");
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

function color(value: OfficeColor): OfficeColor {
  if (value.type === "automatic") return Object.freeze({ type: "automatic" });
  if (value.type !== "rgb" || !/^#[0-9A-Fa-f]{6}$/.test(value.value)) {
    throw new TypeError("RGB formatting colors use #RRGGBB notation.");
  }
  return Object.freeze({ type: "rgb", value: value.value.toUpperCase() });
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
