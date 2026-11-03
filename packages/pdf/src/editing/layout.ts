import type { PdfTextModel } from './model.ts';
import { pdfSourceSpacing } from './source-spacing.ts';
import type { PdfPage } from '../document.ts';
import { type PdfTextStyle, type PdfEditingFonts } from './fonts.ts';
export type PdfLayoutGlyph = {
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  style: PdfTextStyle;
};
export type PdfLayoutCaret = { offset: number; x: number; y: number; height: number };
export type PdfTextLayout = {
  id: string;
  glyphs: PdfLayoutGlyph[];
  carets: PdfLayoutCaret[];
  height: number;
};
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Layout uses full font metrics in page viewport points and UTF-16 offsets shared with Y.Text. */
export function layoutPdfText(
  model: PdfTextModel,
  id: string,
  fonts: PdfEditingFonts,
): PdfTextLayout {
  const seed = model.seed(id),
    glyphs: PdfLayoutGlyph[] = [],
    carets: PdfLayoutCaret[] = [];
  let x = seed.x,
    y = seed.y,
    offset = 0;
  const text = model.text(id).toString();
  const delta: { insert?: unknown; attributes?: Record<string, unknown> }[] = model
    .text(id)
    .toDelta();
  const runs = delta.filter(
    (run): run is { insert: string; attributes?: Record<string, unknown> } =>
      typeof run.insert === 'string',
  );
  let runIndex = 0,
    runStart = 0;
  const entries = [...segmenter.segment(text)];
  const styles: PdfTextStyle[] = [],
    widths: number[] = [];
  for (const entry of entries) {
    while (runIndex < runs.length - 1 && entry.index >= runStart + runs[runIndex]!.insert.length) {
      runStart += runs[runIndex]!.insert.length;
      runIndex++;
    }
    const style = { ...seed.style, ...runs[runIndex]?.attributes };
    styles.push(style);
    widths.push(entry.segment === '\n' ? 0 : fonts.measure(entry.segment, style));
  }
  const kern = pdfSourceSpacing(
    model,
    id,
    entries.map((entry) => entry.index),
    styles,
    widths,
  );
  const line = () => {
    x = seed.x;
    y += Math.max(seed.lineHeight, seed.style.size * 1.25);
  };
  for (let i = 0; i < entries.length; i++) {
    const { segment, index } = entries[i]!,
      style = styles[i]!,
      width = widths[i]!;
    // Prefer word boundaries, falling back to grapheme boundaries for long unbroken words.
    if (x > seed.x && !/\s/u.test(segment) && (i === 0 || /\s/u.test(entries[i - 1]!.segment))) {
      let wordWidth = 0;
      for (let j = i; j < entries.length && !/\s/u.test(entries[j]!.segment); j++)
        wordWidth += widths[j]! + (j > i ? kern[j]! : 0);
      if (wordWidth <= seed.width && x + kern[i]! + wordWidth > seed.x + seed.width) line();
    }
    if (x > seed.x && x + kern[i]! + width > seed.x + seed.width) line();
    if (x > seed.x) x += kern[i]!;
    carets.push({ offset: index, x, y, height: style.size });
    glyphs.push({ text: segment, start: index, end: index + segment.length, x, y, width, style });
    if (segment === '\n') line();
    else x += width;
    offset = index + segment.length;
  }
  carets.push({ offset, x, y, height: model.styleAt(id, offset).size });
  // Resolve each line from both adjacent run heights, including an empty final line.
  const sizes = new Map<number, number>();
  for (const caret of carets) sizes.set(caret.y, Math.max(sizes.get(caret.y) ?? 0, caret.height));
  const baselines = new Map<number, number>();
  let baseline = seed.y,
    previousSize: number | undefined,
    lastSize = seed.style.size;
  for (const [original, size] of sizes) {
    if (previousSize !== undefined)
      baseline += Math.max(seed.lineHeight, previousSize * 1.25, size * 1.25);
    baselines.set(original, baseline);
    previousSize = size;
    lastSize = size;
  }
  for (const glyph of glyphs) glyph.y = baselines.get(glyph.y)!;
  for (const caret of carets) caret.y = baselines.get(caret.y)!;
  return { id, glyphs, carets, height: baseline - seed.y + lastSize * 1.25 };
}
export function hitPdfText(layout: PdfTextLayout, x: number, y: number) {
  return layout.carets.reduce((best, caret) => {
    const distance = (c: PdfLayoutCaret) => Math.abs(c.y - y) * 1000 + Math.abs(c.x - x);
    return distance(caret) < distance(best) ? caret : best;
  });
}
/** Move to the adjacent logical line before pagination, preserving the visual column. */
export function movePdfTextCaret(layout: PdfTextLayout, offset: number, direction: -1 | 1) {
  const caret = layout.carets.find((c) => c.offset === offset);
  if (!caret) return;
  let next: PdfLayoutCaret | undefined;
  for (const candidate of layout.carets) {
    const distance = (candidate.y - caret.y) * direction;
    if (distance > 0.1 && (!next || distance < (next.y - caret.y) * direction)) next = candidate;
  }
  return next ? hitPdfText(layout, caret.x, next.y) : caret;
}
export type PdfFlowPage = { index: number; source: PdfPage; continuation: number };
export type PdfFlowRegion = PdfTextLayout & {
  page: number;
  render: boolean;
  top: number;
  bottom: number;
};
export const pdfContinuationHeight = (page: PdfPage) =>
  Math.max(page.height * 0.5, page.height - 96);
/** Imported paragraphs in the same column continue in reading order. Added regions keep their explicit placement.
 * Overflow creates continuation pages after the source page, preserving other source pages and their graphics. */
export function layoutPdfTextFlow(
  model: PdfTextModel,
  fonts: PdfEditingFonts,
  pages: readonly PdfPage[],
) {
  const outputPages: PdfFlowPage[] = [],
    regions: PdfFlowRegion[] = [];
  for (const page of pages) {
    const layouts = model.ids(page.index).map((id) => layoutPdfText(model, id, fonts)),
      earlier: { x: number; size: number; growth: number }[] = [];
    const fragments: { layout: PdfTextLayout; continuation: number; render: boolean }[] = [];
    let count = 0;
    for (const layout of layouts) {
      const seed = model.seed(layout.id),
        imported = seed.sources.length > 0,
        dirty = model.dirty(layout.id);
      const shift = imported
        ? earlier
            .filter((p) => Math.abs(p.x - seed.x) <= Math.max(p.size, seed.style.size) * 2)
            .reduce((sum, p) => sum + p.growth, 0)
        : 0;
      const originalHeight =
        (seed.delta
          .map((d) => d.insert)
          .join('')
          .split('\n').length -
          1) *
          seed.lineHeight +
        seed.style.size * 1.25;
      if (imported)
        earlier.push({
          x: seed.x,
          size: seed.style.size,
          growth: dirty ? Math.max(0, layout.height - originalHeight) : 0,
        });
      const height = pdfContinuationHeight(page),
        bottom = page.height - Math.min(48, page.height * 0.1);
      const firstContinuation = imported ? 0 : (seed.continuation ?? 0);
      const localStart = seed.y - firstContinuation * height;
      const edge = imported || localStart <= page.height ? Math.max(bottom, localStart) : bottom;
      const project = (y: number) => {
        const absolute = y + shift,
          continuation =
            !dirty && shift === 0
              ? 0
              : firstContinuation +
                Math.max(0, Math.ceil((absolute - firstContinuation * height - edge) / height));
        count = Math.max(count, continuation);
        return { y: absolute - continuation * height, continuation };
      };
      const groups = new Map<number, PdfTextLayout>();
      const group = (index: number) => {
        let value = groups.get(index);
        if (!value) {
          value = { id: layout.id, glyphs: [], carets: [], height: layout.height };
          groups.set(index, value);
        }
        return value;
      };
      for (const glyph of layout.glyphs) {
        const p = project(glyph.y);
        group(p.continuation).glyphs.push({ ...glyph, y: p.y });
      }
      for (const caret of layout.carets) {
        const p = project(caret.y);
        group(p.continuation).carets.push({ ...caret, y: p.y });
      }
      for (const [continuation, fragment] of groups) {
        if (!fragment.carets.length && fragment.glyphs.length) {
          const g = fragment.glyphs[0]!;
          fragment.carets.push({ offset: g.start, x: g.x, y: g.y, height: g.style.size });
        }
        fragments.push({
          layout: fragment,
          continuation,
          render: dirty || shift !== 0 || continuation !== 0,
        });
      }
    }
    const first = outputPages.length;
    for (let i = 0; i <= count; i++)
      outputPages.push({ index: outputPages.length, source: page, continuation: i });
    for (const fragment of fragments) {
      const carets = fragment.layout.carets;
      regions.push({
        ...fragment.layout,
        page: first + fragment.continuation,
        render: fragment.render,
        top: Math.min(...carets.map((c) => c.y - c.height)),
        bottom: Math.max(...carets.map((c) => c.y + c.height * 0.3)),
      });
    }
  }
  return { pages: outputPages, regions };
}
