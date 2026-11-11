import { drawingColorRgba } from './css-color.ts';
import type { DrawingGradient } from './gradient.ts';

const cache = new WeakMap<DrawingGradient, DrawingGradient['stops']>();
function normalCdf(value: number): number {
  const x = Math.abs(value) / Math.SQRT2, t = 1 / (1 + .3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
  return (1 + (value < 0 ? -erf : erf)) / 2;
}
const low = normalCdf(-2), range = normalCdf(2) - low;

/** Native opaque two-stop shading uses a gamma-corrected sigma blend; alpha shading interpolates straight channels. */
export function drawingGradientStops(gradient: DrawingGradient): DrawingGradient['stops'] {
  const previous = cache.get(gradient);
  if (previous) return previous;
  const colors = gradient.stops.map(stop => drawingColorRgba(stop.color));
  const opaque = colors.every(color => color?.[3] === 1), sigma = gradient.stops.length === 2 && gradient.stops[0]?.offset === 0 && gradient.stops[1]?.offset === 1 && opaque;
  if (gradient.stops.length < 2 || colors.some(color => !color) || opaque && !sigma || gradient.stops.every(stop => stop.color === gradient.stops[0]!.color)) return gradient.stops;
  const result: { offset: number; color: string }[] = [];
  for (let segment = 0; segment < gradient.stops.length - 1; segment++) {
    const first = gradient.stops[segment]!, last = gradient.stops[segment + 1]!, a = colors[segment]!, b = colors[segment + 1]!;
    for (let i = 0; i < 256; i++) {
      const amount = i / 255, weight = sigma ? i === 0 ? 0 : i === 255 ? 1 : (normalCdf((amount - .5) * 4) - low) / range : amount;
      const channels = [0, 1, 2].map(channel => sigma ? Math.round(255 * ((a[channel]! / 255) ** 2.2 * (1 - weight) + (b[channel]! / 255) ** 2.2 * weight) ** (1 / 2.2)) : a[channel]! * (1 - weight) + b[channel]! * weight);
      const alpha = a[3] * (1 - amount) + b[3] * amount;
      result.push({ offset: first.offset + (last.offset - first.offset) * amount, color: `rgba(${channels.join(',')},${alpha})` });
    }
  }
  cache.set(gradient, result); return result;
}
