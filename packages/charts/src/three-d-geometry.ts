import { chartAxisCoordinate } from './axis-scale.ts';
import { cartesianGeometry } from './cartesian-geometry.ts';
import { layoutBarBand } from './bar-layout.ts';
import type { CartesianChartLayout } from './layout.ts';
import type { SupportedChartModel } from './model.ts';
import type { ChartPoint3D } from './projection.ts';

/** The categorical engine supplies date/reverse spacing; only the final coordinates become 3D. */
export function threeDGeometry(model: SupportedChartModel, layout: CartesianChartLayout) {
  const flat = cartesianGeometry(model, layout), { plot } = layout;
  const horizontal = model.kind === 'bar', count = Math.max(1, layout.categories.length), seriesCount = Math.max(1, model.series.length);
  const depthAxis = model.axes.find(axis => axis.kind === 'series');
  const axisStart = horizontal ? plot.y : plot.x, axisLength = horizontal ? plot.height : plot.width;
  const normalizedCategory = (pixel: number) => horizontal ? 1 - (pixel - axisStart) / axisLength : (pixel - axisStart) / axisLength;
  const category = (index: number, centered = true) => normalizedCategory(flat.category(index, centered));
  const categoryBoundary = (index: number) => normalizedCategory(flat.categoryBand(index));
  const dateCategory = (serial: number) => normalizedCategory(flat.dateCategory(serial));
  const value = (raw: number) => chartAxisCoordinate(flat.valueAxis?.logBase && raw <= 0 ? layout.minimum : raw, layout.minimum, layout.maximum, 0, 1, flat.valueAxis);
  const point = (category: number, raw: number, depth: number): ChartPoint3D => horizontal ? { x: value(raw), y: category, z: depth } : { x: category, y: value(raw), z: depth };
  const depth = (number: number) => depthAxis?.reversed ? 1 - number : number;
  const separated = model.grouping === 'standard';
  const depthSlots = separated ? seriesCount : 1;
  const gap = (model.gapDepth ?? 150) / 100;
  if (!Number.isFinite(gap) || gap < 0 || gap > 5) throw new RangeError('Invalid chart gap depth.');
  const thickness = 1 / (depthSlots * (1 + gap)), inset = (1 / depthSlots - thickness) / 2;
  const depthBand = (index: number) => {
    const start = (separated ? index / depthSlots : 0) + inset;
    return { start: depth(start), end: depth(start + thickness) };
  };
  const band = layoutBarBand(separated ? { ...model, series: model.series.slice(0, 1) } : model, flat.band / axisLength);
  const categoryBand = (index: number, series: number) => {
    const start = (flat.categoryBand(index) - axisStart) / axisLength + band.inset + (separated ? 0 : series * band.stride);
    return horizontal ? { start: 1 - start, end: 1 - start - band.thickness } : { start, end: start + band.thickness };
  };
  return { ...flat, count, seriesCount, categoryReversed: horizontal ? !flat.categoryReversed : flat.categoryReversed, category, categoryBoundary, dateCategory, value, point, depth, depthBand, categoryBand };
}

/** Clip data faces to the plot volume before applying the perspective projection. */
export function clipChartFace(vertices: readonly ChartPoint3D[]): readonly ChartPoint3D[] {
  let result = [...vertices];
  for (const axis of ['x', 'y', 'z'] as const) for (const bound of [0, 1]) {
    const output: ChartPoint3D[] = [];
    for (const [index, a] of result.entries()) {
      const b = result[(index + 1) % result.length]!;
      const insideA = bound ? a[axis] <= 1 : a[axis] >= 0, insideB = bound ? b[axis] <= 1 : b[axis] >= 0;
      if (insideA) output.push(a);
      if (insideA !== insideB) {
        const fraction = (bound - a[axis]) / (b[axis] - a[axis]);
        output.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, z: a.z + (b.z - a.z) * fraction });
      }
    }
    result = output;
  }
  return result;
}
