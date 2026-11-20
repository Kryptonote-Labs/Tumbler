import { mathSelectedRange, type MathSelection } from "./editing.ts";
import { samePath, type MathEquation, type MathNode, type MathPath, type MathPosition, type MathRow } from "./model.ts";
import { MATH_BINARY, MATH_PUNCTUATION, MATH_RELATIONS } from "./templates.ts";

/** Advance width of text in points. Hosts pass their own shaper so equations use document fonts. */
export type MathMeasure = (text: string, style: MathTextStyle) => number;
export interface MathTextStyle {
  readonly size: number;
  readonly italic: boolean;
  readonly bold: boolean;
}

export interface MathLayoutOptions {
  /** Font size in points of the surrounding text. */
  readonly size: number;
  readonly measure: MathMeasure;
  readonly bold?: boolean;
  /** Text shown in an empty equation instead of a slot box. */
  readonly prompt?: string;
}

/** Paint items use a baseline origin: x grows right, y grows down, negative y is above the baseline. */
export type MathPaintItem =
  | { readonly kind: "glyph"; readonly text: string; readonly x: number; readonly y: number; readonly size: number; readonly italic: boolean; readonly bold: boolean; readonly scaleY?: number }
  | { readonly kind: "rule"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly kind: "path"; readonly points: readonly (readonly [number, number])[]; readonly width: number }
  | { readonly kind: "slot"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly kind: "prompt"; readonly text: string; readonly x: number; readonly y: number; readonly size: number };

/** Caret stops for one editable row: `carets[i]` is the x before atom i. */
export interface MathRowGeometry {
  readonly path: MathPath;
  readonly carets: readonly number[];
  readonly top: number;
  readonly bottom: number;
  readonly size: number;
}

export interface MathLayout {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly items: readonly MathPaintItem[];
  readonly rows: readonly MathRowGeometry[];
}

interface Box {
  width: number;
  ascent: number;
  descent: number;
  items: MathPaintItem[];
  rows: MathRowGeometry[];
}

const ASCENT = 0.75;
const DESCENT = 0.25;
const AXIS = 0.25;

function translate(box: Box, dx: number, dy: number, into: Box) {
  for (const item of box.items) {
    if (item.kind === "path") into.items.push({ ...item, points: item.points.map(([x, y]) => [x + dx, y + dy] as const) });
    else into.items.push({ ...item, x: item.x + dx, y: item.y + dy });
  }
  for (const row of box.rows) into.rows.push({ ...row, carets: row.carets.map((x) => x + dx), top: row.top + dy, bottom: row.bottom + dy });
}

const ACCENTS: Readonly<Record<string, string>> = { "̇": "˙", "̈": "¨", "̂": "ˆ", "̃": "˜", "⃗": "→", "̌": "ˇ", "́": "´", "̀": "`" };

function italicFor(node: MathNode & { kind: "char" }) {
  if (node.normal) return false;
  return /^[A-Za-zα-ωϑϕ]$/u.test(node.value);
}

class MathLayouter {
  constructor(private readonly options: MathLayoutOptions) {}

  private width(text: string, size: number, italic = false) {
    const value = this.options.measure(text, { size, italic, bold: !!this.options.bold });
    return Number.isFinite(value) && value >= 0 ? value : size * 0.5 * [...text].length;
  }

  private glyph(box: Box, text: string, x: number, y: number, size: number, italic = false, scaleY?: number) {
    box.items.push({ kind: "glyph", text, x, y, size, italic, bold: !!this.options.bold, ...(scaleY && scaleY !== 1 ? { scaleY } : {}) });
  }

  row(row: MathRow, path: MathPath, size: number, prompt?: string): Box {
    const box: Box = { width: 0, ascent: size * ASCENT, descent: size * DESCENT, items: [], rows: [] };
    if (!row.length) {
      if (prompt) {
        const width = this.width(prompt, size);
        box.items.push({ kind: "prompt", text: prompt, x: 0, y: 0, size });
        box.width = width;
        box.rows.push({ path, carets: [0], top: -box.ascent, bottom: box.descent, size });
        return box;
      }
      const width = size * 0.6;
      box.items.push({ kind: "slot", x: size * 0.08, y: -size * 0.68, width: width - size * 0.16, height: size * 0.8 });
      box.width = width;
      box.rows.push({ path, carets: [size * 0.08], top: -box.ascent, bottom: box.descent, size });
      return box;
    }
    const carets: number[] = [];
    let x = 0;
    for (const [index, node] of row.entries()) {
      carets.push(x);
      const spacing = this.spacing(row, index, size);
      x += spacing.before;
      const child = this.node(node, [...path], index, size);
      translate(child, x, 0, box);
      box.ascent = Math.max(box.ascent, child.ascent);
      box.descent = Math.max(box.descent, child.descent);
      x += child.width + spacing.after;
    }
    carets.push(x);
    box.width = x;
    box.rows.push({ path, carets, top: -box.ascent, bottom: box.descent, size });
    return box;
  }

  private spacing(row: MathRow, index: number, size: number) {
    const node = row[index]!;
    if (node.kind !== "char" || node.normal) return { before: 0, after: 0 };
    const previous = row[index - 1];
    const unary = !previous || (previous.kind === "char" && (MATH_BINARY.has(previous.value) || MATH_RELATIONS.has(previous.value) || "([{,".includes(previous.value)));
    if (MATH_RELATIONS.has(node.value)) return { before: size * 0.28, after: size * 0.28 };
    if (MATH_BINARY.has(node.value)) return unary ? { before: 0, after: 0 } : { before: size * 0.22, after: size * 0.22 };
    if (MATH_PUNCTUATION.has(node.value)) return { before: 0, after: size * 0.17 };
    return { before: 0, after: 0 };
  }

  private node(node: MathNode, path: MathPath, index: number, size: number): Box {
    const slot = (name: string) => [...path, { index, slot: name }];
    const box: Box = { width: 0, ascent: 0, descent: 0, items: [], rows: [] };
    const small = (factor: number) => Math.max(size * factor, this.options.size * 0.5);
    switch (node.kind) {
      case "char": {
        if (node.value === " ") return { ...box, width: size * 0.25, ascent: size * ASCENT, descent: size * DESCENT };
        const italic = italicFor(node);
        const width = this.width(node.value, size, italic) + (italic ? size * 0.03 : 0);
        this.glyph(box, node.value, 0, 0, size, italic);
        return { ...box, width, ascent: size * ASCENT, descent: size * DESCENT };
      }
      case "fraction": {
        const childSize = small(0.8);
        const num = this.row(node.num, slot("num"), childSize);
        const den = this.row(node.den, slot("den"), childSize);
        if (node.style === "linear" || node.style === "skewed") {
          const slash = this.width("/", size);
          const raise = node.style === "skewed" ? size * 0.25 : 0;
          translate(num, 0, -raise, box);
          this.glyph(box, "/", num.width, 0, size);
          translate(den, num.width + slash, raise, box);
          return { ...box, width: num.width + slash + den.width, ascent: Math.max(size * ASCENT, num.ascent + raise), descent: Math.max(size * DESCENT, den.descent + raise) };
        }
        const gap = size * 0.1;
        const thickness = Math.max(0.5, size * 0.05);
        const axis = -size * AXIS;
        const width = Math.max(num.width, den.width) + size * 0.24;
        const numBaseline = axis - thickness / 2 - gap - num.descent;
        const denBaseline = axis + thickness / 2 + gap + den.ascent;
        translate(num, (width - num.width) / 2, numBaseline, box);
        translate(den, (width - den.width) / 2, denBaseline, box);
        if (node.style !== "stacked") box.items.push({ kind: "rule", x: size * 0.06, y: axis - thickness / 2, width: width - size * 0.12, height: thickness });
        return { ...box, width, ascent: num.ascent - numBaseline, descent: denBaseline + den.descent };
      }
      case "script": {
        const base = this.row(node.base, slot("base"), size);
        const scriptSize = small(0.7);
        const sup = node.sup && this.row(node.sup, slot("sup"), scriptSize);
        const sub = node.sub && this.row(node.sub, slot("sub"), scriptSize);
        let supY = -Math.max(size * 0.4, base.ascent - size * 0.35);
        let subY = Math.max(size * 0.2, base.descent - size * 0.05);
        if (sup && sub) {
          const clearance = subY - sub.ascent - (supY + sup.descent);
          if (clearance < size * 0.12) subY += size * 0.12 - clearance;
        }
        const scriptsWidth = Math.max(sup?.width ?? 0, sub?.width ?? 0);
        const gap = size * 0.04;
        const baseX = node.pre ? scriptsWidth + gap : 0;
        const scriptX = node.pre ? 0 : base.width + gap;
        translate(base, baseX, 0, box);
        if (sup) translate(sup, node.pre ? scriptsWidth - sup.width : scriptX, supY, box);
        if (sub) translate(sub, node.pre ? scriptsWidth - sub.width : scriptX, subY, box);
        return {
          ...box,
          width: base.width + gap + scriptsWidth,
          ascent: Math.max(base.ascent, sup ? sup.ascent - supY : 0),
          descent: Math.max(base.descent, sub ? sub.descent + subY : 0),
        };
      }
      case "radical": {
        const body = this.row(node.body, slot("body"), size);
        const degree = node.degree && this.row(node.degree, slot("degree"), small(0.6));
        const stroke = Math.max(0.6, size * 0.055);
        const top = -body.ascent - size * 0.1;
        const bottom = body.descent + size * 0.04;
        const signWidth = size * 0.55;
        const offset = degree ? Math.max(0, degree.width - signWidth * 0.45) : 0;
        const left = offset;
        const height = bottom - top;
        box.items.push({
          kind: "path",
          width: stroke,
          points: [
            [left, bottom - height * 0.42],
            [left + signWidth * 0.22, bottom - height * 0.5],
            [left + signWidth * 0.55, bottom],
            [left + signWidth, top],
            [left + signWidth + body.width + size * 0.12, top],
          ],
        });
        translate(body, left + signWidth + size * 0.06, 0, box);
        let ascent = -top + stroke;
        if (degree) {
          const degreeBaseline = bottom - height * 0.5 - size * 0.08 - degree.descent;
          translate(degree, left + signWidth * 0.45 - degree.width, degreeBaseline, box);
          ascent = Math.max(ascent, degree.ascent - degreeBaseline);
        }
        return { ...box, width: left + signWidth + body.width + size * 0.18, ascent, descent: Math.max(size * DESCENT, bottom) };
      }
      case "delimiter": {
        const body = this.row(node.body, slot("body"), size);
        const axis = size * AXIS;
        const half = Math.max(size * 0.5, Math.max(body.ascent - axis, body.descent + axis) + size * 0.06);
        const scale = half / (size * 0.5);
        const y = size * AXIS * scale - size * AXIS;
        const openWidth = node.open ? this.width(node.open, size) : 0;
        const closeWidth = node.close ? this.width(node.close, size) : 0;
        const pad = size * 0.04;
        if (node.open) this.glyph(box, node.open, 0, y, size, false, scale);
        translate(body, openWidth + pad, 0, box);
        if (node.close) this.glyph(box, node.close, openWidth + pad * 2 + body.width, y, size, false, scale);
        return { ...box, width: openWidth + closeWidth + body.width + pad * 2, ascent: Math.max(body.ascent, axis + half), descent: Math.max(body.descent, half - axis) };
      }
      case "nary": {
        const side = node.side ?? false;
        const operatorSize = size * (side ? 1.3 : 1.4);
        const operatorWidth = this.width(node.operator, operatorSize, false);
        const y = operatorSize * AXIS - size * AXIS;
        const operatorTop = y - operatorSize * ASCENT;
        const operatorBottom = y + operatorSize * DESCENT;
        const limitSize = small(0.7);
        const sup = node.sup && this.row(node.sup, slot("sup"), limitSize);
        const sub = node.sub && this.row(node.sub, slot("sub"), limitSize);
        let ascent = -operatorTop;
        let descent = operatorBottom;
        let width: number;
        if (side) {
          const x = operatorWidth + size * 0.02;
          this.glyph(box, node.operator, 0, y, operatorSize);
          if (sup) {
            const baseline = operatorTop + sup.ascent;
            translate(sup, x + size * 0.12, baseline, box);
            ascent = Math.max(ascent, sup.ascent - baseline);
          }
          if (sub) {
            const baseline = operatorBottom - sub.descent;
            translate(sub, x - size * 0.08, baseline, box);
            descent = Math.max(descent, baseline + sub.descent);
          }
          width = x + Math.max(sup ? sup.width + size * 0.12 : 0, sub ? sub.width - size * 0.08 : 0);
        } else {
          width = Math.max(operatorWidth, sup?.width ?? 0, sub?.width ?? 0);
          this.glyph(box, node.operator, (width - operatorWidth) / 2, y, operatorSize);
          if (sup) {
            const baseline = operatorTop - size * 0.05 - sup.descent;
            translate(sup, (width - sup.width) / 2, baseline, box);
            ascent = sup.ascent - baseline;
          }
          if (sub) {
            const baseline = operatorBottom + size * 0.05 + sub.ascent;
            translate(sub, (width - sub.width) / 2, baseline, box);
            descent = baseline + sub.descent;
          }
        }
        const body = this.row(node.body, slot("body"), size);
        translate(body, width + size * 0.12, 0, box);
        return { ...box, width: width + size * 0.12 + body.width, ascent: Math.max(ascent, body.ascent), descent: Math.max(descent, body.descent) };
      }
      case "function": {
        const name = this.row(node.name, slot("name"), size);
        const body = this.row(node.body, slot("body"), size);
        const gap = size * 0.17;
        translate(name, 0, 0, box);
        translate(body, name.width + gap, 0, box);
        return { ...box, width: name.width + gap + body.width, ascent: Math.max(name.ascent, body.ascent), descent: Math.max(name.descent, body.descent) };
      }
      case "accent": {
        const body = this.row(node.body, slot("body"), size);
        translate(body, 0, 0, box);
        const top = -body.ascent;
        if (node.accent === "̅" || node.accent === "¯") {
          const thickness = Math.max(0.5, size * 0.05);
          box.items.push({ kind: "rule", x: size * 0.04, y: top - size * 0.06, width: Math.max(body.width - size * 0.04, size * 0.3), height: thickness });
          return { ...box, width: body.width, ascent: body.ascent + size * 0.12, descent: body.descent };
        }
        const mark = ACCENTS[node.accent] ?? node.accent;
        const markSize = node.accent === "⃗" ? size * 0.6 : size;
        const markWidth = this.width(mark, markSize);
        const baseline = node.accent === "⃗" ? top + markSize * 0.05 : top + size * 0.55;
        this.glyph(box, mark, Math.max(0, (body.width - markWidth) / 2 + (italicSlant(node.body) ? size * 0.05 : 0)), baseline, markSize);
        return { ...box, width: Math.max(body.width, markWidth), ascent: body.ascent + size * 0.25, descent: body.descent };
      }
      case "limit": {
        const base = this.row(node.base, slot("base"), size);
        const limit = this.row(node.limit, slot("limit"), small(0.7));
        const width = Math.max(base.width, limit.width);
        translate(base, (width - base.width) / 2, 0, box);
        if (node.position === "lower") {
          const baseline = base.descent + size * 0.02 + limit.ascent;
          translate(limit, (width - limit.width) / 2, baseline, box);
          return { ...box, width, ascent: base.ascent, descent: baseline + limit.descent };
        }
        const baseline = -base.ascent - size * 0.02 - limit.descent;
        translate(limit, (width - limit.width) / 2, baseline, box);
        return { ...box, width, ascent: limit.ascent - baseline, descent: base.descent };
      }
      case "matrix": {
        const cells = node.rows.map((cells, r) => cells.map((cell, c) => this.row(cell, slot(`r${r}c${c}`), size)));
        const columns = cells[0]!.map((_, c) => Math.max(...cells.map((row) => row[c]!.width)));
        const columnGap = size * 0.7;
        const rowGap = size * 0.25;
        const heights = cells.map((row) => ({ ascent: Math.max(...row.map((cell) => cell.ascent)), descent: Math.max(...row.map((cell) => cell.descent)) }));
        const total = heights.reduce((sum, row) => sum + row.ascent + row.descent, 0) + rowGap * (heights.length - 1);
        let y = -size * AXIS - total / 2;
        for (const [r, row] of cells.entries()) {
          const baseline = y + heights[r]!.ascent;
          let x = 0;
          for (const [c, cell] of row.entries()) {
            translate(cell, x + (columns[c]! - cell.width) / 2, baseline, box);
            x += columns[c]! + columnGap;
          }
          y = baseline + heights[r]!.descent + rowGap;
        }
        const width = columns.reduce((sum, value) => sum + value, 0) + columnGap * (columns.length - 1);
        return { ...box, width, ascent: size * AXIS + total / 2, descent: total / 2 - size * AXIS };
      }
    }
  }
}

function italicSlant(row: MathRow) {
  const only = row.length === 1 ? row[0] : undefined;
  return only?.kind === "char" && italicFor(only);
}

/** Lay out an equation at the surrounding text's size, with caret geometry for every slot. */
export function layoutMath(equation: MathEquation, options: MathLayoutOptions): MathLayout {
  const box = new MathLayouter(options).row(equation.body, [], options.size, options.prompt);
  return { width: box.width, ascent: box.ascent, descent: box.descent, items: box.items, rows: box.rows };
}

export interface MathCaretRect {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

export function mathCaretRect(layout: MathLayout, position: MathPosition): MathCaretRect | undefined {
  const row = layout.rows.find((candidate) => samePath(candidate.path, position.path));
  const x = row?.carets[Math.min(position.offset, row.carets.length - 1)];
  if (!row || x === undefined) return undefined;
  // Carets span the text height of the row's own size, not the full height of tall neighbours.
  const midline = (row.top + row.bottom) / 2;
  const half = Math.min((row.bottom - row.top) / 2, Math.max(row.size * 0.6, (row.bottom - row.top) / 2));
  return { x, top: midline - half, bottom: midline + half };
}

export interface MathRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function mathSelectionRects(layout: MathLayout, selection: MathSelection): MathRect[] {
  const range = mathSelectedRange(selection);
  if (range.start === range.end) return [];
  const row = layout.rows.find((candidate) => samePath(candidate.path, range.path));
  if (!row) return [];
  const left = row.carets[range.start]!;
  const right = row.carets[range.end]!;
  return [{ x: left, y: row.top, width: right - left, height: row.bottom - row.top }];
}

/** The caret position nearest a point, preferring the innermost slot under it. */
export function mathPositionAt(layout: MathLayout, x: number, y: number): MathPosition {
  let best: { row: MathRowGeometry; score: number } | undefined;
  for (const row of layout.rows) {
    const left = row.carets[0]!;
    const right = row.carets.at(-1)!;
    const dx = x < left ? left - x : x > right ? x - right : 0;
    const dy = y < row.top ? row.top - y : y > row.bottom ? y - row.bottom : 0;
    // Inside rows win by depth; outside rows compete by distance.
    const score = dx === 0 && dy === 0 ? -row.path.length - 1 / (1 + (right - left) * (row.bottom - row.top)) : dx + dy;
    if (!best || score < best.score) best = { row, score };
  }
  if (!best) return { path: [], offset: 0 };
  let offset = 0;
  for (const [index, caret] of best.row.carets.entries()) if (Math.abs(caret - x) < Math.abs(best.row.carets[offset]! - x)) offset = index;
  return { path: best.row.path, offset };
}

