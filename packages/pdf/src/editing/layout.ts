import type * as Y from 'yjs';
import { alignPdfLines } from './paragraph-layout.ts';
import type { PdfTextModel } from './model.ts';
import { pdfSourceSpacing, pdfSourceAttribute, pdfStyleAttributes } from './source-spacing.ts';
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
const regionLayouts = new WeakMap<Y.Map<unknown>, {
  version: number;
  fonts: PdfEditingFonts;
  fontRevision: number;
  layout: PdfTextLayout;
}>();
/** Reuse unchanged region metrics across keystrokes, formatting and page projections. */
export function layoutPdfText(model: PdfTextModel, id: string, fonts: PdfEditingFonts): PdfTextLayout {
  const region = model.regions.get(id)!, version = model.regionVersion(id);
  const previous = regionLayouts.get(region);
  if (!model.inTransaction && previous?.version === version && previous.fonts === fonts && previous.fontRevision === fonts.revision)
    return previous.layout;
  const layout = computePdfTextLayout(model, id, fonts);
  if (!model.inTransaction) regionLayouts.set(region, { version, fonts, fontRevision: fonts.revision, layout });
  return layout;
}
/** Layout uses full font metrics in page viewport points and UTF-16 offsets shared with Y.Text. */
function computePdfTextLayout(
  model: PdfTextModel,
  id: string,
  fonts: PdfEditingFonts,
): PdfTextLayout {
  const paragraph = model.paragraph(id);
  const seed = model.geometry(id),
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
    widths: number[] = [],
    originals: (number | undefined)[] = [];
  for (const entry of entries) {
    while (runIndex < runs.length - 1 && entry.index >= runStart + runs[runIndex]!.insert.length) {
      runStart += runs[runIndex]!.insert.length;
      runIndex++;
    }
    const attributes = runs[runIndex]?.attributes;
    const source = attributes?.[pdfSourceAttribute];
    originals.push(typeof source === 'number' ? source : undefined);
    const style = { ...seed.style, ...pdfStyleAttributes(attributes) };
    styles.push(style);
    widths.push(entry.segment === '\n' ? 0 : fonts.measure(entry.segment, style));
  }
  const kern = pdfSourceSpacing(
    seed,
    entries.map((entry) => entry.segment),
    originals,
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
      baseline += paragraph.lineSpacing === undefined
        ? Math.max(seed.lineHeight, previousSize * 1.25, size * 1.25)
        : Math.max(previousSize, size) * paragraph.lineSpacing;
    baselines.set(original, baseline);
    previousSize = size;
    lastSize = size;
  }
  for (const glyph of glyphs) glyph.y = baselines.get(glyph.y)!;
  for (const caret of carets) caret.y = baselines.get(caret.y)!;
  alignPdfLines(glyphs, carets, seed.x, seed.width, paragraph.alignment ?? 'left');
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
export type PdfFlowPage = {
  id: string;
  index: number;
  source: PdfPage;
  continuation: number;
  rotation: 0 | 90 | 180 | 270;
};
export type PdfFlowRegion = PdfTextLayout & {
  page: number;
  render: boolean;
  /** Original operators can be retained only when the whole region fits its original page. */
  preserveSource: boolean;
  top: number;
  bottom: number;
  /** Logical page-space anchor after flow displacement, before continuation projection. */
  origin: { x: number; y: number; continuation: number };
};
export const pdfContinuationHeight = (page: PdfPage) =>
  Math.max(page.height * 0.5, page.height - 96);
type PdfTextFlow = { pages: PdfFlowPage[]; regions: PdfFlowRegion[] };
const flows = new WeakMap<PdfTextModel, {
  revision: number; fonts: PdfEditingFonts; fontRevision: number;
  pages: readonly PdfPage[]; flow: PdfTextFlow;
}>();
export function layoutPdfTextFlow(model: PdfTextModel, fonts: PdfEditingFonts, pages: readonly PdfPage[]): PdfTextFlow {
  const previous = flows.get(model);
  if (!model.inTransaction && previous?.revision === model.revision && previous.fonts === fonts && previous.fontRevision === fonts.revision && previous.pages === pages)
    return previous.flow;
  const flow = computePdfTextFlow(model, fonts, pages);
  if (!model.inTransaction) flows.set(model, { revision: model.revision, fonts, fontRevision: fonts.revision, pages, flow });
  return flow;
}
const pageFlows = new WeakMap<PdfTextModel, WeakMap<PdfPage, ReturnType<typeof computePdfPageFlow>>>();
function layoutPdfPageFlow(model: PdfTextModel, fonts: PdfEditingFonts, page: PdfPage) {
  const layouts = model.ids(page.index).map((id) => layoutPdfText(model, id, fonts));
  let cache = pageFlows.get(model);
  if (!cache) pageFlows.set(model, cache = new WeakMap());
  const previous = cache.get(page);
  if (!model.inTransaction && previous && previous.layouts.length === layouts.length && previous.layouts.every((layout, index) => layout === layouts[index]))
    return previous;
  const result = computePdfPageFlow(model, page, layouts);
  if (!model.inTransaction) cache.set(page, result);
  return result;
}
function computePdfPageFlow(model: PdfTextModel, page: PdfPage, layouts: PdfTextLayout[]) {
    const earlier: { x: number; size: number; growth: number }[] = [];
    const fragments: {
      layout: PdfTextLayout;
      continuation: number;
      render: boolean;
      preserveSource: boolean;
      origin: { x: number; y: number; continuation: number };
    }[] = [];
    let count = 0;
    for (const layout of layouts) {
      const seed = model.geometry(layout.id),
        imported = seed.sources.length > 0,
        dirty = model.dirty(layout.id);
      const shift =
        imported && !model.placement(layout.id)
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
      if (imported && !model.placement(layout.id))
        earlier.push({
          x: seed.x,
          size: seed.style.size,
          growth: dirty ? Math.max(0, layout.height - originalHeight) : 0,
        });
      const height = pdfContinuationHeight(page),
        bottom = page.height - Math.min(48, page.height * 0.1);
      const firstContinuation =
        model.placement(layout.id)?.continuation ?? (imported ? 0 : (seed.continuation ?? 0));
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
      for (const glyph of model.placement(layout.id)?.hidden ? [] : layout.glyphs) {
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
          origin: { x: seed.x, y: seed.y + shift, continuation: project(seed.y).continuation },
          render: dirty || shift !== 0 || continuation !== 0,
          preserveSource:
            model.sourcePreserved(layout.id) &&
            groups.size === 1 &&
            continuation === 0 &&
            shift === 0,
        });
      }
    }

  return { layouts, count, fragments };
}
/** Imported paragraphs in the same column continue in reading order. Added regions keep their explicit placement.
 * Overflow creates continuation pages after the source page, preserving other source pages and their graphics. */
function computePdfTextFlow(
  model: PdfTextModel,
  fonts: PdfEditingFonts,
  pages: readonly PdfPage[],
) {
  const outputPages: PdfFlowPage[] = [],
    regions: PdfFlowRegion[] = [];
  for (const page of model.pages.sourcePages(pages)) {
    const { count, fragments } = layoutPdfPageFlow(model, fonts, page);
    const imageCount = [...model.images.records.values()].reduce(
      (max, image) => image.page === page.index && !image.hidden ? Math.max(max, image.continuation) : max,
      count,
    );
    const annotationCount = [...model.annotations.records.values()].reduce((max, annotation) => {
      const continuation = annotation.get('continuation');
      return annotation.get('page') === page.index && !annotation.get('hidden') && typeof continuation === 'number' ? Math.max(max, continuation) : max;
    }, imageCount);
    const first = outputPages.length;
    for (let i = 0; i <= annotationCount; i++)
      outputPages.push({
        id: i ? `${page.id}:continuation:${i}` : page.id,
        index: outputPages.length,
        source: page,
        continuation: i,
        rotation: 0,
      });
    for (const fragment of fragments) {
      const carets = fragment.layout.carets;
      regions.push({
        ...fragment.layout,
        page: first + fragment.continuation,
        render: fragment.render,
        preserveSource: fragment.preserveSource,
        origin: fragment.origin,
        top: Math.min(...carets.map((c) => c.y - c.height)),
        bottom: Math.max(...carets.map((c) => c.y + c.height * 0.3)),
      });
    }
  }
  const projected = model.pages.project(outputPages, pages);
  const indices = new Map(projected.map((page, index) => [page.index, index]));
  return {
    pages: projected.map((page, index) => ({ ...page, index })),
    regions: regions
      .filter((region) => indices.has(region.page))
      .map((region) => ({ ...region, page: indices.get(region.page)! })),
  };
}
