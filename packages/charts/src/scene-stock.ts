import { cartesianScene } from './scene-cartesian.ts';
import { indexChartSequence } from './indexed-data.ts';
import { chartValueCoordinate, layoutCartesianChart } from './layout.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

/** Stock series are high/low/close, or open/high/low/close in source order. */
export function stockScene(context: SceneContext): ChartMark[] {
  const { model, width, height } = context;
  if (model.series.length !== 3 && model.series.length !== 4) throw new TypeError('Stock charts require three or four price series.');
  const layout = layoutCartesianChart(model, width, height, context.measure);
  const marks = cartesianScene(context, false);
  const values = model.series.map(series => indexChartSequence(series.values));
  const hasOpen = values.length === 4;
  const offset = hasOpen ? 1 : 0;
  const band = layout.plot.width / Math.max(1, layout.categories.length);
  const y = (value: number) => chartValueCoordinate(value, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true);
  for (let index = 0; index < layout.categories.length; index++) {
    const high = values[offset]?.get(index), low = values[offset + 1]?.get(index), close = values[offset + 2]?.get(index), open = hasOpen ? values[0]?.get(index) : undefined;
    if (typeof high !== 'number' || typeof low !== 'number') continue;
    const x = layout.plot.x + (index + 0.5) * band;
    marks.push({ kind: 'line', x1: x, x2: x, y1: y(high), y2: y(low), stroke: '#595959', width: 1 });
    const tick = Math.min(8, band / 3);
    if (typeof open === 'number' && typeof close === 'number') {
      marks.push({ kind: 'rect', x: x - tick, y: Math.min(y(open), y(close)), width: tick * 2, height: Math.max(1, Math.abs(y(open) - y(close))), fill: close >= open ? '#ffffff' : '#595959', stroke: '#595959' });
    } else if (typeof close === 'number') {
      marks.push({ kind: 'line', x1: x, x2: x + tick, y1: y(close), y2: y(close), stroke: context.color(model.series[offset + 2]!, offset + 2, true), width: 1 });
    }
  }
  return marks;
}
