import { createOfficeInkScene, renderInkSceneSvg, replaceOfficeInkTrace, type InkPoint } from '@tumblerjs/ink';
import type { WordDrawing } from './drawings.ts';

/** Absolute device samples keyed by their source trace, suitable for collaborative run attributes. */
export interface WordInkTraceOverride { readonly traceIndex: number; readonly points: readonly InkPoint[] }
export function isWordInkTraceOverrides(value: unknown): value is readonly WordInkTraceOverride[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<number>();
  return value.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    if (Object.keys(record).some(key => key !== 'traceIndex' && key !== 'points') || typeof record.traceIndex !== 'number' || !Number.isSafeInteger(record.traceIndex) || record.traceIndex < 0 || ids.has(record.traceIndex)) return false;
    ids.add(record.traceIndex);
    return Array.isArray(record.points) && record.points.every((point: unknown) => Array.isArray(point) && point.every((sample: unknown) => sample === null || typeof sample === 'boolean' || typeof sample === 'number' && Number.isFinite(sample)));
  });
}

/** Project edited native samples without rewriting the immutable source package during layout. */
export function withWordInkTraces(drawing: WordDrawing, edits?: readonly WordInkTraceOverride[]): WordDrawing {
  if (!edits?.length) return drawing;
  if (!isWordInkTraceOverrides(edits)) throw new TypeError('Invalid ink trace overrides.');
  if (drawing.kind !== 'image' || !drawing.ink || !drawing.inkProjection) throw new Error('The drawing has no editable ink.');
  let ink = drawing.ink;
  for (const edit of edits) ink = replaceOfficeInkTrace(ink, ink.traces[edit.traceIndex]?.elementId ?? -1, edit.points);
  const scene = createOfficeInkScene(ink, drawing.inkProjection.options);
  if (!scene.supported) throw new Error(scene.diagnostics.map(d => d.message).join(' '));
  const rendered = renderInkSceneSvg(scene);
  return { ...drawing, ink, inkProjection: { ...drawing.inkProjection, bounds: scene.bounds },
    inkRendering: rendered.supported ? 'vector' : 'raster',
    inkRenderingDiagnostics: rendered.supported ? [] : rendered.diagnostics,
    ...(rendered.supported ? { contentType: 'image/svg+xml', bytes: new TextEncoder().encode(rendered.svg) } : {}) };
}

/** Match a DrawingML frame resize while keeping physical pen size unchanged. */
export function resizeWordInkProjection(drawing: WordDrawing, width: number, height: number): WordDrawing {
  if (drawing.kind !== 'image' || !drawing.ink || !drawing.inkProjection || width === drawing.widthPoints && height === drawing.heightPoints) return drawing;
  const { sampleTransform: _transform, ...sourceOptions } = drawing.inkProjection.options ?? {};
  const source = createOfficeInkScene(drawing.ink, sourceOptions);
  if (!source.supported) throw new Error('Cannot resize unsupported ink.');
  const bounds = source.traceBounds, bw = bounds.width || 72 / 2540, bh = bounds.height || 72 / 2540;
  const cx = bounds.x + bw / 2, cy = bounds.y + bh / 2;
  const sx = width / drawing.widthPoints, sy = height / drawing.heightPoints;
  const [a, b, c, d, e, f] = drawing.inkProjection.matrix;
  const na = a * sx, nb = b * sx, nc = c * sy, nd = d * sy;
  const matrix = [na, nb, nc, nd, (a * cx + c * cy + e) * sx - na * cx - nc * cy, (b * cx + d * cy + f) * sy - nb * cx - nd * cy] as const;
  const options = { ...drawing.inkProjection.options, sampleTransform: matrix };
  const scene = createOfficeInkScene(drawing.ink, options);
  if (!scene.supported) throw new Error(scene.diagnostics.map(d => d.message).join(' '));
  const rendered = renderInkSceneSvg(scene);
  return { ...drawing, inkProjection: { matrix, bounds: scene.bounds, options },
    inkRendering: rendered.supported ? 'vector' : 'raster',
    ...(rendered.supported ? { contentType: 'image/svg+xml', bytes: new TextEncoder().encode(rendered.svg) } : {}) };
}
