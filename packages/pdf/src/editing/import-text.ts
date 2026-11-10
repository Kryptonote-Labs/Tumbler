import { PdfInterpreter } from '../interpreter.ts';
import { pdfTextContent, type PdfTextItem } from '../text-content.ts';
import type { PdfDocument } from '../document.ts';
import type { PdfSceneSource } from '../scene.ts';
import { defaultPdfTextStyle, type PdfTextStyle } from './fonts.ts';

export type PdfTextSeed = {
  id: string;
  page: number;
  /** Explicit continuation anchor for newly placed text; y includes its logical page offset. */
  continuation?: number;
  x: number;
  y: number;
  width: number;
  lineHeight: number;
  /** Tight viewport bounds, independent of the paragraph's reflow width. */
  bounds?: { x: number; y: number; width: number; height: number };
  style: PdfTextStyle;
  sources: {
    instance: string;
    object: string;
    start: number;
    end: number;
    mode: number;
    displacement: number;
  }[];
  /** Original neighbouring delta entries and their occurrence-specific spacing. */
  spacing?: {
    left: number;
    right: number;
    gap: number;
    advance?: number;
  }[];
  delta: { insert: string; attributes: PdfTextStyle }[];
};
export const pdfSourceKey = (s: Pick<PdfSceneSource, 'instance' | 'object' | 'start'>) =>
  `${s.instance}/${s.object.key}/${s.start}`;
function styleOf(item: PdfTextItem, color: string): PdfTextStyle {
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
  if (rgb)
    color =
      '#' +
      rgb
        .slice(1)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('');
  return {
    ...defaultPdfTextStyle,
    ...(item.font.source ? { font: item.font.source } : {}),
    size: Math.hypot(item.transform[0], item.transform[1]),
    bold: item.font.weight === 'bold',
    italic: item.font.style === 'italic',
    family:
      /serif/i.test(item.font.family) && !/sans/i.test(item.font.family)
        ? 'Serif'
        : /mono/i.test(item.font.family)
          ? 'Mono'
          : 'Sans',
    color,
  };
}
/** Geometric paragraph recovery preserves source ownership. Shared showing operators never split between regions. */
export function importPdfText(document: PdfDocument): PdfTextSeed[] {
  return [...iteratePdfText(document)];
}

/** Yield completed pages in source order so callers can build editing state without retaining every page scene. */
export function* iteratePdfText(document: PdfDocument): Generator<PdfTextSeed> {
  const interpreter = new PdfInterpreter(document, undefined, { deferImages: true });
  let count = 0;
  for (const page of document.pages) {
    const blocks: PdfTextSeed[] = [];
    const scene = interpreter.page(page.index),
      glyphs = new Map(scene.elements.filter((e) => e.kind === 'glyph').map((e) => [e.id, e]));
    const lines: PdfTextItem[][] = [];
    let line: PdfTextItem[] = [];
    for (const item of pdfTextContent(scene).items) {
      if (item.text === '\n') {
        if (line.length) lines.push(line);
        line = [];
        continue;
      }
      if (item.source.instance.startsWith('annotation:')) continue;
      if (item.kind === 'glyph' && glyphs.get(item.id)?.mode === 3) continue;
      const last = line.findLast((item) => item.kind === 'glyph');
      if (last && item.kind === 'glyph') {
        const em = Math.hypot(last.transform[0], last.transform[1]);
        const dx = item.transform[4] - last.transform[4],
          dy = item.transform[5] - last.transform[5];
        const gap = (dx * last.transform[0] + dy * last.transform[1]) / em - last.width * em;
        const same = pdfSourceKey(last.source) === pdfSourceKey(item.source);
        // Large gutters separate columns and table cells. A single showing operator stays atomic.
        if (!same && gap > Math.max(12, em * 2)) {
          while (line.at(-1)?.kind === 'separator') line.pop();
          if (line.length) lines.push(line);
          line = [];
        }
      }
      line.push(item);
    }
    if (line.length) lines.push(line);
    let previous: PdfTextSeed | undefined;
    for (const line of lines
      .filter((l) => l.some((item) => item.kind === 'glyph'))
      .sort(
        (a, b) =>
          a[0]!.transform[5] - b[0]!.transform[5] || a[0]!.transform[4] - b[0]!.transform[4],
      )) {
      const first = line[0]!,
        last = line.at(-1)!,
        glyph = glyphs.get(first.id);
      const style = styleOf(
        first,
        typeof glyph?.state.fill === 'string' ? glyph.state.fill : '#000000',
      );
      const x = first.transform[4],
        y = first.transform[5],
        right = last.transform[4] + last.width * style.size;
      const sourceMap = new Map<string, PdfTextSeed['sources'][number]>();
      for (const item of line) {
        const g = glyphs.get(item.id);
        if (!g) continue;
        const key = pdfSourceKey(g.source),
          previous = sourceMap.get(key);
        sourceMap.set(key, {
          ...g.source,
          object: g.source.object.key,
          mode: g.mode,
          displacement: (previous?.displacement ?? 0) + g.textDisplacement,
        });
      }
      const sources = [...sourceMap.values()];

      const delta = line.map((item) => {
        const fill = glyphs.get(item.id)?.state.fill;
        return {
          insert: item.text,
          attributes: styleOf(item, typeof fill === 'string' ? fill : style.color),
        };
      });
      const spacing: NonNullable<PdfTextSeed['spacing']> = [];
      for (let i = 1; i < line.length; i++) {
        const left = line[i - 1]!,
          right = line[i]!;
        const [a, b, , , x, y] = left.transform,
          em = Math.hypot(a, b);
        const dx = right.transform[4] - x,
          dy = right.transform[5] - y;
        if (!em || Math.abs(-b * dx + a * dy) / em >= 0.01) continue;
        const gap = (a * dx + b * dy) / em - left.width * em;
        if (left.kind === 'separator')
          spacing.push({ left: i - 1, right: i, gap: 0, advance: (a * dx + b * dy) / em });
        else if (Math.abs(gap) > 1e-6) spacing.push({ left: i - 1, right: i, gap });
      }
      const points = line.flatMap((item) => {
        const [a, b, c, d, e, f] = item.transform;
        return [0, item.width].flatMap((x) =>
          [-item.ascent, item.height - item.ascent].map((y) => ({
            x: a * x + c * y + e,
            y: b * x + d * y + f,
          })),
        );
      });
      const extent = points.reduce(
        (b, p) => ({
          left: Math.min(b.left, p.x),
          top: Math.min(b.top, p.y),
          right: Math.max(b.right, p.x),
          bottom: Math.max(b.bottom, p.y),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
      );
      const bounds = {
        x: extent.left,
        y: extent.top,
        width: Math.max(1, extent.right - extent.left),
        height: Math.max(1, extent.bottom - extent.top),
      };
      // Search all prior blocks, so row-interleaved columns do not depend on stream order.
      previous = blocks
        .filter((block) => block.page === page.index)
        .findLast((block) => {
          if (
            block.sources.some((a) =>
              sources.some(
                (b) => a.instance === b.instance && a.object === b.object && a.start === b.start,
              ),
            )
          )
            return true;
          const count = block.delta
            .map((d) => d.insert)
            .join('')
            .split('\n').length;
          const gap = y - block.y - (count - 1) * block.lineHeight;
          return (
            Math.abs(first.transform[1]) < 0.01 &&
            Math.abs(first.transform[2]) < 0.01 &&
            Math.abs(x - block.x) < style.size * 0.7 &&
            Math.abs(style.size - block.style.size) < 0.2 &&
            style.bold === block.style.bold &&
            style.italic === block.style.italic &&
            gap > style.size * 0.8 &&
            gap < style.size * 1.7
          );
        });
      const gap = previous ? y - previous.y : 0;
      const previousLines =
        previous?.delta
          .map((d) => d.insert)
          .join('')
          .split('\n').length ?? 1;
      const sameOperator = previous?.sources.some((a) =>
        sources.some(
          (b) => a.instance === b.instance && a.object === b.object && a.start === b.start,
        ),
      );
      const follows =
        previous &&
        Math.abs(x - previous.x) < style.size &&
        Math.abs(style.size - previous.style.size) < 0.2 &&
        gap > 0 &&
        gap / previousLines < style.size * 1.7;
      if (previous && (sameOperator || follows)) {
        const first = previous.delta.length + 1;
        (previous.spacing ??= []).push(
          ...spacing.map((gap) => ({ ...gap, left: gap.left + first, right: gap.right + first })),
        );
        previous.delta.push({ insert: '\n', attributes: style }, ...delta);
        for (const source of sources) {
          const existing = previous.sources.find(
            (s) =>
              s.object === source.object &&
              s.instance === source.instance &&
              s.start === source.start,
          );
          if (existing) existing.displacement += source.displacement;
          else previous.sources.push(source);
        }
        previous.lineHeight = gap / previousLines || style.size * 1.2;
        const old = previous.bounds!;
        const bx = Math.min(old.x, bounds.x),
          by = Math.min(old.y, bounds.y);
        previous.bounds = {
          x: bx,
          y: by,
          width: Math.max(old.x + old.width, bounds.x + bounds.width) - bx,
          height: Math.max(old.y + old.height, bounds.y + bounds.height) - by,
        };
        previous.width = Math.max(previous.width, right - previous.x);
      } else {
        previous = {
          id: `source:${page.id}:${count + blocks.length}`,
          page: page.index,
          x,
          y,
          width: Math.max(right - x, page.width - x - Math.min(x, 48)),
          bounds,
          lineHeight: style.size * 1.25,
          style,
          sources,
          delta,
          spacing,
        };
        blocks.push(previous);
      }
    }
    // Keep ordinary paragraph continuation space, but never wrap into a neighbouring column.
    const pageBlocks = blocks.filter((block) => block.page === page.index);
    for (const block of pageBlocks)
      for (const other of pageBlocks) {
        if (other.x <= block.x || !block.bounds || !other.bounds) continue;
        const overlaps =
          other.bounds.y < block.bounds.y + block.bounds.height &&
          other.bounds.y + other.bounds.height > block.bounds.y;
        if (overlaps)
          block.width = Math.min(
            block.width,
            Math.max(block.bounds.width, other.bounds.x - block.x - 12),
          );
      }
    interpreter.releasePage(page.index);
    count += blocks.length;
    yield* blocks;
  }
}
