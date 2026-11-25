import type { LatexTitleField } from './latex-metadata';
import { texPoint } from './latex-typography';

export type LatexTitleStyle = Readonly<{
  /** Font size in CSS pixels. */
  size: number;
  family: 'roman' | 'sans' | 'mono';
  bold: boolean;
  italic: boolean;
  smallCaps: boolean;
}>;

/**
 * Printed text. Text from a title field names it; `source` is the range of the field's source
 * that prints exactly this text, so an edit replaces that range. With no field, it is a body range.
 */
export type LatexTitleRun = {
  text: string;
  style: LatexTitleStyle;
  field?: LatexTitleField;
  source?: { from: number; to: number };
};

export type LatexTitleAlign = 'justify' | 'center' | 'left' | 'right';

/**
 * TeX's vertical list, positioned the way TeX positions it. `before` is the distance from the
 * previous item's reference point to this one's: a line's reference is its baseline, a fill's is
 * its end and a box's is its top. A box's first item is measured from the box's top.
 */
export type LatexTitleItem =
  | {
      kind: 'line';
      before: number;
      align: LatexTitleAlign;
      /** Baselineskip for text that wraps onto further lines while it is edited. */
      leading: number;
      runs: LatexTitleRun[];
    }
  /** Infinite glue of `order` 1 (fil) to 3 (filll). Only the highest order in a box stretches. */
  | { kind: 'fill'; before: number; order: 1 | 2 | 3; weight: number }
  | { kind: 'box'; before: number; height?: number; items: LatexTitleItem[]; after: number };

/** Material as TeX appends it, before interline glue is computed. */
export type LatexTitleMaterial =
  | { kind: 'line'; align: LatexTitleAlign; leading: number; runs: LatexTitleRun[] }
  | { kind: 'glue'; size: number; order: 0 | 1 | 2 | 3; shrink?: number; vss?: true; weight?: number }
  | { kind: 'box'; leading: number; height?: number; material: LatexTitleMaterial[] };

// Computer Modern heights and depths as fractions of the design size.
const xHeight = /[acemnorsuvwxz\-+=<>]/;
const descenders = /[gpqy]/;
function glyph(character: string): readonly [number, number] {
  if (/\s/.test(character)) return [0, 0];
  if (descenders.test(character)) return [0.431, 0.194];
  if (xHeight.test(character)) return [0.431, 0];
  if (character === 't') return [0.615, 0];
  if (character === 'i') return [0.669, 0];
  if (character === 'j') return [0.669, 0.194];
  if (character === 'Q') return [0.683, 0.194];
  if (/[A-Z0-9]/.test(character)) return [0.683, 0];
  if (character === ',' || character === ';') return [0.106, 0.194];
  if (character === '.' || character === ':') return [0.106, 0];
  if (/[()[\]{}|/]/.test(character)) return [0.75, 0.25];
  return [0.694, 0];
}

function extent(runs: readonly LatexTitleRun[]) {
  let height = 0;
  let depth = 0;
  for (const run of runs)
    for (const character of run.text) {
      const [above, below] = glyph(character);
      height = Math.max(height, above * run.style.size);
      depth = Math.max(depth, below * run.style.size);
    }
  return { height, depth };
}

const lineskip = 1 * texPoint;

/**
 * Lay out a vertical list with TeX's interline glue: consecutive boxes sit `\baselineskip`
 * apart, or `\lineskip` apart where that would make them overlap. A box set to a height its
 * contents overfill shrinks its finite glue, unless infinite shrink such as `\vss` absorbs it.
 */
export function latexTitleBox(material: readonly LatexTitleMaterial[], height?: number, topSkip = 0, page = false): TitleBox {
  const natural = setList(material, 0, topSkip, page);
  const excess = height === undefined ? 0 : natural.size - height;
  const ratio =
    excess > 0 && natural.shrink > 0 && !material.some((entry) => entry.kind === 'glue' && entry.vss)
      ? Math.min(1, excess / natural.shrink)
      : 0;
  const { items, after } = ratio ? setList(material, ratio, topSkip, page) : natural;
  return { kind: 'box', before: 0, ...(height !== undefined && { height }), items, after };
}

type TitleBox = Extract<LatexTitleItem, { kind: 'box' }>;

function setList(material: readonly LatexTitleMaterial[], ratio: number, topSkip: number, page: boolean) {
  const items: LatexTitleItem[] = [];
  let pending = 0;
  let size = 0;
  let shrink = 0;
  let previousDepth: number | undefined;
  const interline = (leading: number, top: number) => {
    if (previousDepth === undefined) return Math.max(0, topSkip - top);
    const glue = leading - previousDepth - top;
    return glue < 0 ? lineskip : glue;
  };
  const place = (item: LatexTitleItem, extent = 0) => {
    items.push(item);
    size += item.before + extent;
    pending = 0;
  };
  for (const entry of material) {
    if (entry.kind === 'glue') {
      pending += entry.size - (entry.shrink ?? 0) * ratio;
      shrink += entry.shrink ?? 0;
      if (entry.order) place({ kind: 'fill', before: pending, order: entry.order, weight: entry.weight ?? 1 });
    } else if (entry.kind === 'box') {
      const box = latexTitleBox(entry.material, entry.height);
      // A vbox's height is its whole contents; it has no depth after trailing glue.
      const total = box.height ?? box.items.reduce((sum, item) => sum + item.before, 0) + box.after;
      place({ ...box, before: pending + interline(entry.leading, total) }, total);
      previousDepth = 0;
    } else {
      const { height: top, depth } = extent(entry.runs);
      const { align, leading, runs } = entry;
      place({ kind: 'line', before: pending + interline(leading, top) + top, align, leading, runs });
      pending = depth;
      previousDepth = depth;
    }
  }
  // LaTeX's forced page break cancels the last line's depth before its final fill.
  const after = pending - (page ? previousDepth ?? 0 : 0);
  return { items, after, size: size + after, shrink };
}
