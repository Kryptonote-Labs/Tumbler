import { lengthInPoints } from './brush.ts';
import type { InkDiagnostic, OfficeInkDocument, OfficeInkTrace } from './document.ts';
import type { InkChannel } from './trace.ts';

export interface InkBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface InkSvgOptions {
  /** Work budget for a synchronous preview, not a limit on stored/decoded ink. Infinity disables it. */
  readonly maxPoints?: number;
}
export type InkSvgResult =
  | { readonly supported: true; readonly svg: string; readonly bounds: InkBounds; readonly traceBounds: InkBounds }
  | { readonly supported: false; readonly diagnostics: readonly InkDiagnostic[] };

function channelScale(channel: InkChannel | undefined): number | undefined {
  if (!channel || !channel.resolution || channel.resolution <= 0) return;
  // A resolution is counts per unit, not a multiplier of the channel's declared units.
  const unit = channel.resolutionUnits?.match(/^1\/(cm|in)$/)?.[1];
  return unit ? lengthInPoints(1, unit)! / channel.resolution : undefined;
}

/** Deterministic polyline rendering in points. Office does not prescribe a pressure transfer curve. */
export function renderOfficeInkSvg(document: OfficeInkDocument, options: InkSvgOptions = {}): InkSvgResult {
  const diagnostics = [...document.diagnostics];
  if (diagnostics.length) return { supported: false, diagnostics };
  const maxPoints = options.maxPoints ?? 100_000;
  if (!(maxPoints >= 0) || (maxPoints !== Infinity && !Number.isSafeInteger(maxPoints))) throw new RangeError('Invalid ink preview point budget.');
  const pointCount = document.traces.reduce((count, trace) => count + trace.points.length, 0);
  if (pointCount > maxPoints) return { supported: false, diagnostics: [{ elementId: document.source.root.id, code: 'resource', message: `Ink preview needs ${pointCount} points, exceeding the configured synchronous budget of ${maxPoints}. Source and decoded samples are retained.` }] };
  const paths: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let penMinX = Infinity, penMinY = Infinity, penMaxX = -Infinity, penMaxY = -Infinity;
  const problem = (trace: OfficeInkTrace, message: string) => diagnostics.push({ elementId: trace.elementId, code: 'rendering', message });
  for (const trace of document.traces) {
    if (!trace.points.length) continue;
    const { brush, channels } = trace;
    const xi = channels.findIndex(c => c.name === 'X'), yi = channels.findIndex(c => c.name === 'Y');
    const sx = channelScale(channels[xi]), sy = channelScale(channels[yi]);
    if (sx === undefined || sy === undefined) { problem(trace, 'Explicit positive X/Y resolutions in 1/cm or 1/in are required for physical rendering.'); continue; }
    if (brush.rasterOp !== 'copyPen' && brush.rasterOp !== 'noOperation') { problem(trace, `SVG cannot reproduce destination-dependent ${brush.rasterOp}.`); continue; }
    if (brush.fitToCurve) { problem(trace, 'Office curve fitting is not implemented.'); continue; }
    const rotation = channels.findIndex(c => c.name === 'OR');
    if (rotation >= 0 && trace.points.some(p => p[rotation] !== 0)) { problem(trace, 'Rotating pen tips are not implemented.'); continue; }
    const fi = channels.findIndex(c => c.name === 'F');
    const pressure = channels[fi];
    if (!brush.ignorePressure && pressure && (pressure.max === undefined || pressure.max <= (pressure.min ?? 0))) { problem(trace, 'Pressure rendering requires a declared nonempty pressure range.'); continue; }
    const si = channels.findIndex(c => c.name === 'S');
    if (si >= 0 && channels[si]?.type !== 'boolean') { problem(trace, 'The pen switch channel must be boolean.'); continue; }
    const shapes: string[] = [];
    let previous: { x: number; y: number; r: number } | undefined;
    for (const point of trace.points) {
      const rawX = point[xi], rawY = point[yi];
      if (typeof rawX !== 'number' || typeof rawY !== 'number') { problem(trace, 'Missing numeric X/Y sample.'); break; }
      const x = rawX * sx, y = rawY * sy;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (point[si] === false || brush.rasterOp === 'noOperation') { previous = undefined; continue; }
      const force = point[fi];
      const r = brush.ignorePressure || !pressure ? 1 : typeof force === 'number' ? Math.max(0, Math.min(1, (force - (pressure.min ?? 0)) / (pressure.max! - (pressure.min ?? 0)))) : 0;
      const rx = brush.widthPoints * r / 2, ry = brush.heightPoints * r / 2;
      penMinX = Math.min(penMinX, x - rx); penMaxX = Math.max(penMaxX, x + rx);
      penMinY = Math.min(penMinY, y - ry); penMaxY = Math.max(penMaxY, y + ry);
      if (brush.tip === 'ellipse') shapes.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`);
      else shapes.push(`<rect x="${x - rx}" y="${y - ry}" width="${2 * rx}" height="${2 * ry}"/>`);
      if (previous) {
        if (brush.tip === 'rectangle') {
          // Convex hull of the two axis-aligned nib stamps fills the swept segment.
          const vertices = [previous, { x, y, r }].flatMap(p => [-1, 1].flatMap(a => [-1, 1].map(b => ({ x: p.x + a * brush.widthPoints * p.r / 2, y: p.y + b * brush.heightPoints * p.r / 2 }))));
          shapes.push(`<polygon points="${convexHull(vertices).map(p => `${p.x},${p.y}`).join(' ')}"/>`);
        } else {
          // Work in normalized nib space so elliptical tips retain their aspect ratio.
          const dx = (x - previous.x) / brush.widthPoints, dy = (y - previous.y) / brush.heightPoints;
          const length = Math.hypot(dx, dy);
          const slope = (previous.r - r) / (2 * length);
          if (length > 0 && Math.abs(slope) < 1) {
            const perpendicular = Math.sqrt(1 - slope * slope);
            const edge = (sign: number) => ({ x: (dx * slope - sign * dy * perpendicular) / length * brush.widthPoints / 2, y: (dy * slope + sign * dx * perpendicular) / length * brush.heightPoints / 2 });
            const a = edge(1), b = edge(-1);
            shapes.push(`<polygon points="${previous.x + a.x * previous.r},${previous.y + a.y * previous.r} ${x + a.x * r},${y + a.y * r} ${x + b.x * r},${y + b.y * r} ${previous.x + b.x * previous.r},${previous.y + b.y * previous.r}"/>`);
          }
        }
      }
      previous = { x, y, r };
    }
    paths.push(`<g fill="${brush.color}" opacity="${1 - brush.transparency / 255}"${brush.antiAliased ? '' : ' shape-rendering="crispEdges"'}>${shapes.join('')}</g>`);
  }
  if (diagnostics.length) return { supported: false, diagnostics };
  if (![minX, minY, maxX, maxY, penMinX, penMinY, penMaxX, penMaxY].every(Number.isFinite) || penMaxX <= penMinX || penMaxY <= penMinY) {
    return { supported: false, diagnostics: [{ elementId: document.source.root.id, code: 'rendering', message: 'Ink has no nonempty drawable bounds.' }] };
  }
  const bounds = { x: penMinX, y: penMinY, width: penMaxX - penMinX, height: penMaxY - penMinY };
  const traceBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  if (![...Object.values(bounds), ...Object.values(traceBounds)].every(Number.isFinite)) return { supported: false, diagnostics: [{ elementId: document.source.root.id, code: 'rendering', message: 'Physical ink bounds exceed numeric range.' }] };
  return { supported: true, bounds, traceBounds, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}pt" height="${bounds.height}pt" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">${paths.join('')}</svg>` };
}

function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: typeof points[number], b: typeof points[number], c: typeof points[number]) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: typeof points) => {
    const result: typeof points = [];
    for (const point of items) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
