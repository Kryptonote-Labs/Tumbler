import { WordError } from './document.ts';

/** Internal text margins in points. Omitted sides use the DrawingML defaults. */
export interface WordShapeTextInsets {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

// ECMA-376 Part 1 §21.1.2.1.1: 0.05in vertically, 0.1in horizontally.
const defaults = Object.freeze({ top: 3.6, right: 7.2, bottom: 3.6, left: 7.2 });
const attributes = [['top', 'tIns'], ['right', 'rIns'], ['bottom', 'bIns'], ['left', 'lIns']] as const;
const emusPerPoint = 12_700;

/** Resolves each side independently, preserving explicit zero and signed insets. */
export function resolveWordShapeTextInsets(shape: { readonly textInsets?: WordShapeTextInsets }): Required<WordShapeTextInsets> {
  return {
    top: shape.textInsets?.top ?? defaults.top,
    right: shape.textInsets?.right ?? defaults.right,
    bottom: shape.textInsets?.bottom ?? defaults.bottom,
    left: shape.textInsets?.left ?? defaults.left,
  };
}

function isCoordinate(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const emus = Math.round(value * emusPerPoint);
  // ST_Coordinate32, ECMA-376 Part 1 §20.1.10.17–18.
  return emus >= -2_147_483_648 && emus <= 2_147_483_647;
}

export function isWordShapeTextInsets(value: unknown): value is WordShapeTextInsets {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([side, inset]) => attributes.some(([key]) => key === side) && isCoordinate(inset));
}

export function wordShapeTextInsetsXml(insets: WordShapeTextInsets | undefined): string {
  return attributes.map(([side, name]) => insets?.[side] === undefined ? '' : ` ${name}="${Math.round(insets[side] * emusPerPoint)}"`).join('');
}

/** Reads both EMUs and the universal measurements permitted by ST_Coordinate32. */
export function readWordShapeTextInsets(attribute: (name: string) => string | undefined): WordShapeTextInsets | undefined {
  const insets: { -readonly [K in keyof WordShapeTextInsets]: WordShapeTextInsets[K] } = {};
  for (const [side, name] of attributes) {
    const value = attribute(name);
    if (value === undefined) continue;
    // XML Schema numeric types collapse XML whitespace before lexical validation.
    const raw = value.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, '');
    const units = /^([+-]?[0-9]+(?:\.[0-9]+)?)(mm|cm|in|pt|pc|pi)$/.exec(raw);
    const pointsPerUnit = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pt: 1, pc: 12, pi: 12 };
    const unit = units?.[2] as keyof typeof pointsPerUnit | undefined;
    const points = units && unit ? Number(units[1]) * pointsPerUnit[unit] : /^[+-]?[0-9]+$/.test(raw) ? Number(raw) / emusPerPoint : NaN;
    if (!isCoordinate(points)) throw new WordError('invalid_document', `Shape ${name} must be an ST_Coordinate32 measurement.`);
    insets[side] = points;
  }
  return Object.keys(insets).length === 0 ? undefined : insets;
}
