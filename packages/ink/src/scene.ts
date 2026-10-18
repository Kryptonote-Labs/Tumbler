import { fitWindowsInkCurve } from './windows-curve-samples.ts';
import { fitInkCurve } from './curve.ts';
import { lengthInPoints } from './brush.ts';
import type { InkDiagnostic, OfficeInkDocument, OfficeInkTrace } from './document.ts';
import type { InkChannel } from './trace.ts';

export interface InkBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface InkSvgOptions {
  /** Word uses a circular round pen and its desktop pressure transfer function. */
  readonly renderingProfile?: 'inkml' | 'word';
  /** Transform stroke centres after fitting, without scaling physical pen dimensions. */
  readonly sampleTransform?: readonly [number, number, number, number, number, number];
  /** Clockwise pen rotation in radians, independent of sample scaling. */
  readonly brushRotation?: number;
  readonly brushReflection?: boolean;
  /** Maximum deviation in physical points when flattening fitted curves. */
  readonly curveTolerance?: number;
  /** Physical size in points of InkML's application-relative em/ex units. */
  readonly relativeUnits?: Readonly<Partial<Record<'em' | 'ex', number>>>;
  /** Explicit host device defaults for calibration omitted from the file. Stored channel properties win. */
  readonly channelDefaults?: Readonly<Record<string, Pick<InkChannel, 'resolution' | 'resolutionUnits' | 'min' | 'max'>>>;
  /** Work budget for a synchronous preview, not a limit on stored/decoded ink. Infinity disables it. */
  readonly maxPoints?: number;
}
export type InkShape =
  | { readonly kind: 'ellipse'; readonly x: number; readonly y: number; readonly rx: number; readonly ry: number; readonly angle: number }
  | { readonly kind: 'polygon'; readonly points: readonly { x: number; y: number }[] };
export interface InkPaint { readonly shapes: readonly InkShape[]; readonly brush: OfficeInkTrace['brush']; readonly elementId: number }
export type InkSceneResult =
  | { readonly supported: true; readonly strokes: readonly InkPaint[]; readonly bounds: InkBounds; readonly traceBounds: InkBounds }
  | { readonly supported: false; readonly diagnostics: readonly InkDiagnostic[] };

export function inkChannelScale(channel: InkChannel | undefined): number | undefined {
  if (!channel || !channel.resolution || channel.resolution <= 0) return;
  // A resolution is counts per unit, not a multiplier of the channel's declared units.
  const unit = channel.resolutionUnits?.match(/^1\/(cm|in)$/)?.[1];
  return unit ? lengthInPoints(1, unit)! / channel.resolution : undefined;
}

/** Native nib geometry in physical points. Office does not prescribe a pressure transfer curve. */
export function createOfficeInkScene(document: OfficeInkDocument, options: InkSvgOptions = {}): InkSceneResult {
  const matrix = options.sampleTransform ?? [1, 0, 0, 1, 0, 0];
  if (!matrix.every(Number.isFinite) || !Number.isFinite(options.brushRotation ?? 0)) throw new RangeError('Invalid ink scene transform.');
  const diagnostics = [...document.diagnostics];
  if (diagnostics.length) return { supported: false, diagnostics };
  const maxPoints = options.maxPoints ?? 100_000;
  if (!(maxPoints >= 0) || (maxPoints !== Infinity && !Number.isSafeInteger(maxPoints))) throw new RangeError('Invalid ink preview point budget.');
  const pointCount = document.traces.reduce((count, trace) => count + trace.points.length, 0);
  if (pointCount > maxPoints) return { supported: false, diagnostics: [{ elementId: document.source.root.id, code: 'resource', message: `Ink preview needs ${pointCount} points, exceeding the configured synchronous budget of ${maxPoints}. Source and decoded samples are retained.` }] };
  const strokes: InkPaint[] = [];
  let generatedPoints = 0;
  const tolerance = options.curveTolerance ?? 0.05;
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) throw new RangeError('Invalid ink curve tolerance.');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let penMinX = Infinity, penMinY = Infinity, penMaxX = -Infinity, penMaxY = -Infinity;
  const problem = (trace: OfficeInkTrace, message: string) => diagnostics.push({ elementId: trace.elementId, code: 'rendering', message });
  for (const trace of document.traces) {
    if (!trace.points.length) continue;
    const widthUnit = trace.brush.relativeWidth, heightUnit = trace.brush.relativeHeight;
    const widthPoints = widthUnit ? widthUnit.value * (options.relativeUnits?.[widthUnit.unit] ?? NaN) : trace.brush.widthPoints;
    const heightPoints = heightUnit ? heightUnit.value * (options.relativeUnits?.[heightUnit.unit] ?? NaN) : trace.brush.heightPoints;
    if (![widthPoints, heightPoints].every(value => Number.isFinite(value) && value > 0)) { problem(trace, 'Relative brush units require positive physical em/ex sizes from the host.'); continue; }
    const brush = { ...trace.brush, widthPoints, heightPoints };
    const channels = trace.channels.map(channel => ({ ...options.channelDefaults?.[channel.name], ...channel }));
    const xi = channels.findIndex(c => !c.intermittent && c.name === 'X'), yi = channels.findIndex(c => !c.intermittent && c.name === 'Y');
    const sx = inkChannelScale(channels[xi]), sy = inkChannelScale(channels[yi]);
    if (sx === undefined || sy === undefined) { problem(trace, 'Explicit positive X/Y resolutions in 1/cm or 1/in are required for physical rendering.'); continue; }
    const rotation = channels.findIndex(c => !c.intermittent && c.name === 'OR');
    const fi = channels.findIndex(c => !c.intermittent && c.name === 'F');
    const pressure = channels[fi];
    if (!brush.ignorePressure && pressure && (pressure.max === undefined || pressure.max <= (pressure.min ?? 0))) { problem(trace, 'Pressure rendering requires a declared nonempty pressure range.'); continue; }
    const si = channels.findIndex(c => !c.intermittent && c.name === 'S');
    if (si >= 0 && channels[si]?.type !== 'boolean') { problem(trace, 'The pen switch channel must be boolean.'); continue; }
    const shapes: InkShape[] = [];
    const segments: { x: number; y: number; r: number; angle: number }[][] = [[]];
    for (const point of trace.points) {
      const rawX = point[xi], rawY = point[yi];
      if (typeof rawX !== 'number' || typeof rawY !== 'number') { problem(trace, 'Missing numeric X/Y sample.'); break; }
      const x = rawX * sx, y = rawY * sy;
      if (options.renderingProfile !== 'word' || !brush.fitToCurve || brush.rasterOp === 'noOperation') { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      if (point[si] === false || brush.rasterOp === 'noOperation') { segments.push([]); continue; }
      const force = point[fi];
      const normalized = typeof force === 'number' ? Math.max(0, Math.min(1, (force - (pressure?.min ?? 0)) / ((pressure?.max ?? 1) - (pressure?.min ?? 0)))) : 0;
      const r = brush.ignorePressure || !pressure ? 1 : options.renderingProfile === 'word' ? .25 + 1.5 * normalized : normalized;
      const orientation = point[rotation];
      const rotationChannel = channels[rotation];
      const angleUnit = rotationChannel?.resolutionUnits?.replace(/^1\//, '') ?? rotationChannel?.units;
      const angleResolution = rotationChannel?.resolution && rotationChannel.resolution > 0 ? rotationChannel.resolution : 1;
      const angle = typeof orientation === 'number' ? -orientation / angleResolution * (angleUnit === 'rad' ? 1 : Math.PI / 180) : 0;
      segments.at(-1)!.push({ x, y, r, angle });
    }
    for (const segment of segments) {
      let samples: typeof segment;
      const wordCurve = options.renderingProfile === 'word' && brush.fitToCurve;
      try {
        if (wordCurve) {
          for (const point of fitWindowsInkCurve(segment, tolerance, maxPoints - generatedPoints)) {
            minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
          }
          const [a, b, c, d, e, f] = matrix;
          // Word fits after local resizing, before rotating the drawing. The
          // fitter's cusp thresholds use an axis-aligned source bounding box.
          const size = Math.hypot(a, b), cosine = size ? a / size : 1, sine = size ? b / size : 0;
          samples = fitWindowsInkCurve(segment.map(p => ({ ...p, x: (cosine * a + sine * b) * p.x + (cosine * c + sine * d) * p.y, y: (-sine * a + cosine * b) * p.x + (-sine * c + cosine * d) * p.y })), tolerance, maxPoints - generatedPoints)
            .map(p => ({ ...p, x: cosine * p.x - sine * p.y + e, y: sine * p.x + cosine * p.y + f }));
        } else samples = brush.fitToCurve ? fitInkCurve(segment, tolerance, maxPoints - generatedPoints) : segment;
      }
      catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return { supported: false, diagnostics: [{ elementId: trace.elementId, code: 'resource', message: error.message }] };
      }
      generatedPoints += samples.length;
      if (generatedPoints > maxPoints) return { supported: false, diagnostics: [{ elementId: trace.elementId, code: 'resource', message: 'Ink geometry exceeds the configured point budget.' }] };
      let previous: readonly { x: number; y: number }[] | undefined;
      for (const sample of samples) {
        const [a, b, c, d, e, f] = matrix;
        const x = wordCurve ? sample.x : a * sample.x + c * sample.y + e, y = wordCurve ? sample.y : b * sample.x + d * sample.y + f;
        const angle = (options.brushReflection ? -sample.angle : sample.angle) + (options.brushRotation ?? 0);
        const circular = options.renderingProfile === 'word' && brush.tip === 'ellipse';
        const rx = (circular ? Math.max(brush.widthPoints, brush.heightPoints) : brush.widthPoints) * sample.r / 2;
        const ry = (circular ? Math.max(brush.widthPoints, brush.heightPoints) : brush.heightPoints) * sample.r / 2;
        const cosine = Math.cos(angle), sine = Math.sin(angle);
        const vertices = brush.tip === 'rectangle' ? [-1, 1].flatMap(a => [-1, 1].map(b => ({ x: a * rx, y: b * ry })))
          : Array.from({ length: Math.max(16, Math.min(256, Math.ceil(Math.PI * Math.sqrt(Math.max(rx, ry) / tolerance)))) }, (_, i) => i).map((i, _, all) => ({ x: rx * Math.cos(i * 2 * Math.PI / all.length), y: ry * Math.sin(i * 2 * Math.PI / all.length) }));
        const transformed = vertices.map(p => ({ x: x + cosine * p.x - sine * p.y, y: y + sine * p.x + cosine * p.y }));
        const dx = brush.tip === 'ellipse' ? Math.hypot(rx * cosine, ry * sine) : Math.abs(rx * cosine) + Math.abs(ry * sine);
        const dy = brush.tip === 'ellipse' ? Math.hypot(rx * sine, ry * cosine) : Math.abs(rx * sine) + Math.abs(ry * cosine);
        penMinX = Math.min(penMinX, x - dx); penMaxX = Math.max(penMaxX, x + dx);
        penMinY = Math.min(penMinY, y - dy); penMaxY = Math.max(penMaxY, y + dy);
        if (brush.tip === 'ellipse') shapes.push({ kind: 'ellipse', x, y, rx, ry, angle });
        else shapes.push({ kind: 'polygon', points: convexHull(transformed) });
        if (previous) shapes.push({ kind: 'polygon', points: convexHull([...previous, ...transformed]) });
        previous = transformed;
      }
    }
    strokes.push({ shapes, brush, elementId: trace.elementId });
  }
  if (diagnostics.length) return { supported: false, diagnostics };
  const bounds = penMinX === Infinity ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: penMinX, y: penMinY, width: penMaxX - penMinX, height: penMaxY - penMinY };
  const traceBounds = minX === Infinity ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  if (![...Object.values(bounds), ...Object.values(traceBounds)].every(Number.isFinite)) return { supported: false, diagnostics: [{ elementId: document.source.root.id, code: 'rendering', message: 'Physical ink bounds exceed numeric range.' }] };
  return { supported: true, bounds, traceBounds, strokes };
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
