import { renderOfficeInkSvg, type OfficeInkDocument } from '@tumblerjs/ink';
import type { WordDrawing, WordImageDrawing } from './drawings.ts';

const previews = new WeakMap<OfficeInkDocument, WeakMap<NonNullable<WordImageDrawing['inkProjection']>, string>>();

/** Engine-generated markup for synchronous DOM rendering, never an imported SVG payload. */
export function wordInkSvg(drawing: WordDrawing): string | undefined {
  if (drawing.kind !== 'image' || drawing.inkRendering !== 'vector' || !drawing.ink || !drawing.inkProjection) return;
  let projections = previews.get(drawing.ink);
  if (!projections) previews.set(drawing.ink, (projections = new WeakMap()));
  const cached = projections.get(drawing.inkProjection);
  if (cached !== undefined) return cached;
  const rendered = renderOfficeInkSvg(drawing.ink, drawing.inkProjection.options);
  if (!rendered.supported) return;
  const svg = rendered.svg.replace('<svg ', '<svg preserveAspectRatio="none" ');
  projections.set(drawing.inkProjection, svg);
  return svg;
}
