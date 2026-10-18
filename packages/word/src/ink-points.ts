import { inkChannelScale, type InkPoint } from '@tumblerjs/ink';
import type { WordDrawing } from './drawings.ts';
import type { WordInkTraceChange } from './ink-edit.ts';

export interface WordInkPoint { readonly traceElementId: number; readonly index: number; readonly x: number; readonly y: number }

function calibration(drawing: WordDrawing, traceElementId: number) {
  if (drawing.kind !== 'image' || !drawing.inkProjection || !drawing.ink) throw new Error('Native ink is not editable.');
  const trace = drawing.ink.traces.find(trace => trace.elementId === traceElementId);
  if (!trace) throw new Error('Ink trace is missing.');
  const options = drawing.inkProjection.options;
  const channels = trace.channels.map(channel => ({ ...options?.channelDefaults?.[channel.name], ...channel }));
  const xi = channels.findIndex(channel => channel.name === 'X' && !channel.intermittent);
  const yi = channels.findIndex(channel => channel.name === 'Y' && !channel.intermittent);
  const sx = inkChannelScale(channels[xi]), sy = inkChannelScale(channels[yi]);
  if (!sx || !sy) throw new Error('Ink coordinate calibration is missing.');
  return { trace, channels, xi, yi, sx, sy, matrix: drawing.inkProjection.matrix };
}

/** Raw sample handles in drawing-local points, retaining trace and sample identity. */
export function wordInkPoints(drawing: WordDrawing): readonly WordInkPoint[] {
  if (drawing.kind !== 'image' || !drawing.inkProjection || !drawing.ink) return [];
  return drawing.ink.traces.flatMap(trace => {
    const { xi, yi, sx, sy, matrix: [a, b, c, d, e, f] } = calibration(drawing, trace.elementId);
    return trace.points.map((point, index) => {
      const x = point[xi], y = point[yi];
      if (typeof x !== 'number' || typeof y !== 'number') throw new Error('Ink sample coordinates are missing.');
      return { traceElementId: trace.elementId, index, x: a * x * sx + c * y * sy + e, y: b * x * sx + d * y * sy + f };
    });
  });
}

/** Move one sample in drawing coordinates without changing pressure, time, switches or other samples. */
export function moveWordInkPoint(drawing: WordDrawing, point: WordInkPoint, x: number, y: number): WordInkTraceChange {
  if (![x, y].every(Number.isFinite)) throw new RangeError('Invalid ink point position.');
  const { trace, channels, xi, yi, sx, sy, matrix: [a, b, c, d, e, f] } = calibration(drawing, point.traceElementId);
  const determinant = a * d - b * c;
  if (!determinant || !Number.isFinite(determinant)) throw new RangeError('Ink transform is not invertible.');
  const original = trace.points[point.index];
  if (!original) throw new RangeError('Ink sample is missing.');
  const moved = [...original];
  const coordinate = (value: number, index: number) => channels[index]!.type === 'integer' ? Math.round(value) : value;
  moved[xi] = coordinate((d * (x - e) - c * (y - f)) / determinant / sx, xi);
  moved[yi] = coordinate((-b * (x - e) + a * (y - f)) / determinant / sy, yi);
  const points: InkPoint[] = [...trace.points];
  points[point.index] = moved;
  return { elementId: drawing.elementId, traceElementId: trace.elementId, points, preserveSampleTransform: true };
}
