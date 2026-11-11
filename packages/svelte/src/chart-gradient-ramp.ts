import { drawingColorRgba, drawingGradientStops, type DrawingGradient } from '@tumblerjs/ooxml';
import { resolveChartColor, type ChartColor, type readChartGradientFill } from '@tumblerjs/charts';
export type ChartGradientStop = NonNullable<ReturnType<typeof readChartGradientFill>>['stops'][number];

export function chartGradientRamp(stops: readonly ChartGradientStop[], themeColors: Readonly<Record<string, string>>): DrawingGradient {
  const resolved = stops.flatMap(stop => stop.color ? [{ offset: stop.position, color: resolveChartColor(stop.color, { themeColors }) ?? 'transparent' }] : []).toSorted((a, b) => a.offset - b.offset);
  return { kind: 'linear', angle: 0, scaled: false, center: [.5, .5], stops: stops.length ? resolved : [{ offset: 0, color: '#000000' }, { offset: 1, color: '#FFFFFF' }] };
}

/** A new stop starts with the colour visible at its position, retaining exact source-stop theme references. */
export function chartGradientStopAt(stops: readonly ChartGradientStop[], themeColors: Readonly<Record<string, string>>, position: number): { color: ChartColor; opacity: number } {
  const exact = stops.find(stop => stop.position === position && stop.color);
  if (exact?.color) return { color: exact.color, opacity: exact.opacity };
  const ramp = drawingGradientStops(chartGradientRamp(stops, themeColors));
  const end = ramp.findIndex(stop => stop.offset > position), first = ramp[end < 0 ? ramp.length - 1 : Math.max(0, end - 1)], last = ramp[end < 0 ? ramp.length - 1 : end];
  if (!first || !last) return { color: { kind: 'scheme', value: 'accent1' }, opacity: 1 };
  const low = drawingColorRgba(first.color) ?? [0, 0, 0, 0], high = drawingColorRgba(last.color) ?? [0, 0, 0, 0];
  const amount = first === last ? 0 : Math.max(0, Math.min(1, (position - first.offset) / (last.offset - first.offset)));
  return { color: { kind: 'rgb', value: '#' + [0, 1, 2].map(channel => Math.round(low[channel]! * (1 - amount) + high[channel]! * amount).toString(16).padStart(2, '0')).join('').toUpperCase() }, opacity: low[3] * (1 - amount) + high[3] * amount };
}

/** Keep native percentage precision without displaying binary floating-point noise. */
export function chartPercent(value: number) { return Number((value * 100).toPrecision(12)); }
