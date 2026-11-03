import { comparePrimitives } from "./primitive-geometry.ts";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { transform } from "../../packages/pdf/src/matrix.ts";
import type { PdfGlyphElement, PdfPageScene } from "../../packages/pdf/src/index.ts";

export interface OracleCharacter {
  code: number;
  generated: boolean;
  origin: readonly [number, number];
  fontSize: number;
  matrix: readonly [number, number, number, number, number, number];
}
export interface OraclePage {
  objects: readonly { kind: "path" | "image"; bounds: readonly [number, number, number, number] }[];
  width: number;
  height: number;
  text: string;
  boxes: readonly (readonly [number, number, number, number])[];
  characters: readonly OracleCharacter[];
  image: string;
}
export const NON_FONT_ERROR_LIMIT = 0.01;
export const TEXT_GEOMETRY_RELATIVE_LIMIT = 0.01;

/** Compare glyph origin and effective em size independently of how the host rasterizes outlines. */
export function compareTextGeometry(scene: PdfPageScene, oracle: OraclePage) {
  const actual = scene.elements
    .filter(
      (element): element is PdfGlyphElement =>
        element.kind === "glyph" && !element.source.instance.startsWith("annotation:"),
    )
    .flatMap((element) =>
      element.glyph.unicode
        .split("")
        .map((character) => ({ element, code: character.charCodeAt(0) })),
    );
  const expected = oracle.characters.filter(
    (character) => !character.generated && character.code >= 32,
  );
  const filtered = actual.filter((character) => character.code >= 32);
  const errors: string[] = [];
  if (filtered.length !== expected.length)
    errors.push(`Character count ${filtered.length}, expected ${expected.length}.`);
  let maxOriginError = 0,
    maxSizeError = 0,
    maxRelativeOriginError = 0,
    maxRelativeSizeError = 0;
  const remaining = new Map<number, typeof filtered>();
  for (const character of filtered) {
    const group = remaining.get(character.code) ?? [];
    group.push(character);
    remaining.set(character.code, group);
  }
  for (const reference of expected) {
    const group = remaining.get(reference.code);
    if (!group?.length) {
      errors.push(`Missing character U+${reference.code.toString(16)}.`);
      continue;
    }
    let index = 0,
      distance = Infinity;
    for (let i = 0; i < group.length; i++) {
      const matrix = group[i]!.element.state.transform,
        error = Math.hypot(matrix[4] - reference.origin[0], matrix[5] - reference.origin[1]);
      if (error < distance) {
        distance = error;
        index = i;
      }
    }
    const native = group.splice(index, 1)[0]!,
      matrix = native.element.state.transform;
    const nativeSize = Math.hypot(matrix[2], matrix[3]) * native.element.font.unitsPerEm;
    const referenceSize = Math.hypot(reference.matrix[2], reference.matrix[3]) * reference.fontSize;
    maxOriginError = Math.max(maxOriginError, distance);
    maxSizeError = Math.max(maxSizeError, Math.abs(nativeSize - referenceSize));
    maxRelativeOriginError = Math.max(
      maxRelativeOriginError,
      distance / Math.max(referenceSize, 0.000001),
    );
    maxRelativeSizeError = Math.max(
      maxRelativeSizeError,
      Math.abs(nativeSize - referenceSize) / Math.max(referenceSize, 0.000001),
    );
  }
  if (maxRelativeOriginError > TEXT_GEOMETRY_RELATIVE_LIMIT)
    errors.push(
      `Text origin error ${(maxRelativeOriginError * 100).toFixed(5)}% of em exceeds 1%.`,
    );
  if (maxRelativeSizeError > TEXT_GEOMETRY_RELATIVE_LIMIT)
    errors.push(`Text size error ${(maxRelativeSizeError * 100).toFixed(5)}% exceeds 1%.`);
  return {
    errors,
    maxOriginError,
    maxSizeError,
    maxRelativeOriginError,
    maxRelativeSizeError,
    characters: expected.length,
  };
}

/** Exclude font interiors from pixel scoring only after the independent geometry check. */
export async function comparePrecision(
  native: Buffer,
  reference: Buffer,
  scene: PdfPageScene,
  oracle: OraclePage,
) {
  const decode = (bytes: Buffer) =>
    sharp(bytes)
      .flatten({ background: "white" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  const [a, b] = await Promise.all([decode(native), decode(reference)]),
    width = b.info.width,
    height = b.info.height;
  const geometry = compareTextGeometry(scene, oracle);
  geometry.errors.push(...comparePrimitives(scene, oracle));
  if (a.info.width !== width || a.info.height !== height)
    return {
      passed: false,
      dimensionsMatch: false,
      changedPixels: width * height,
      nonFontInkPixels: width * height,
      errorRatio: 1,
      pageErrorRatio: 1,
      geometry,
      diff: reference,
    };
  const ignored = new Uint8Array(width * height);
  const exclude = (left: number, bottom: number, right: number, top: number) => {
    const corners = [
      [left, bottom],
      [left, top],
      [right, bottom],
      [right, top],
    ].map(([x, y]) => transform(scene.viewport, x!, y!));
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((point) => point[0])) - 2)),
      x1 = Math.min(width, Math.ceil(Math.max(...corners.map((point) => point[0])) + 2));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((point) => point[1])) - 2)),
      y1 = Math.min(height, Math.ceil(Math.max(...corners.map((point) => point[1])) + 2));
    for (let y = y0; y < y1; y++) ignored.fill(1, y * width + x0, y * width + x1);
  };
  for (const box of oracle.boxes) if (box[2] > box[0] && box[3] > box[1]) exclude(...box);
  // PDFium's ordinary text page excludes annotation appearances. Their glyphs still need a raster mask.
  for (const element of scene.elements)
    if (element.kind === "glyph" && element.source.instance.startsWith("annotation:")) {
      const units = element.font.unitsPerEm,
        matrix = element.state.transform;
      const points = [
        [0, -0.3 * units],
        [(element.glyph.width / 1000) * units, -0.3 * units],
        [0, units],
        [(element.glyph.width / 1000) * units, units],
      ].map(([x, y]) => transform(matrix, x!, y!));
      exclude(
        Math.min(...points.map((point) => point[0])),
        Math.min(...points.map((point) => point[1])),
        Math.max(...points.map((point) => point[0])),
        Math.max(...points.map((point) => point[1])),
      );
    }
  const left = Buffer.from(a.data),
    right = Buffer.from(b.data);
  let ink = 0,
    nonFontPixels = 0;
  for (let i = 0; i < ignored.length; i++) {
    const at = i * 4;
    if (ignored[i]) {
      left.fill(255, at, at + 4);
      right.fill(255, at, at + 4);
      continue;
    }
    nonFontPixels++;
    if ([0, 1, 2].some((channel) => left[at + channel]! < 245 || right[at + channel]! < 245)) ink++;
  }
  const diff = Buffer.alloc(width * height * 4);
  const changedPixels = pixelmatch(left, right, diff, width, height, {
    threshold: 0.1,
    includeAA: false,
  });
  const errorRatio = nonFontPixels ? changedPixels / nonFontPixels : changedPixels ? 1 : 0;
  const inkErrorRatio = ink ? changedPixels / ink : changedPixels ? 1 : 0;
  return {
    passed: !geometry.errors.length && errorRatio <= NON_FONT_ERROR_LIMIT,
    dimensionsMatch: true,
    changedPixels,
    nonFontPixels,
    nonFontInkPixels: ink,
    inkErrorRatio,
    errorRatio,
    pageErrorRatio: changedPixels / (width * height),
    geometry,
    diff: await sharp(diff, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
  };
}
