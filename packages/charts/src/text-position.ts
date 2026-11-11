import type { ChartManualLayout } from './manual-layout.ts';
import { chartManualRect } from './manual-layout.ts';
import { chartMarksBounds } from './shape-scene.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';
import { translateChartMark } from './mark-translation.ts';

/** Office fits chart text to its content; manual x/y move the fitted box without scaling its glyphs. */
export function positionChartText(context: SceneContext, marks: ChartMark[], layout: ChartManualLayout | undefined, fitAutomatic = false): ChartMark[] {
  const manual = layout && (layout.x !== undefined || layout.y !== undefined);
  if (!manual && !fitAutomatic) return marks;
  const bounds = chartMarksBounds(context, marks);
  if (!bounds) return marks;
  if (!layout || !manual) {
    const x = Math.max(4, Math.min(context.width - bounds.width - 4, bounds.x)) - bounds.x;
    const y = Math.max(4, Math.min(context.height - bounds.height - 4, bounds.y)) - bounds.y;
    return marks.map(mark => translateChartMark(mark, x, y));
  }
  const frame = context.textFrame ?? { x: 0, y: 0, width: context.width, height: context.height };
  const automatic = { ...bounds, x: bounds.x + frame.x, y: bounds.y + frame.y };
  const { width: _width, height: _height, ...position } = layout;
  const target = chartManualRect(position, automatic, frame.width, frame.height);
  const x = target.x - automatic.x, y = target.y - automatic.y;
  return marks.map(mark => translateChartMark(mark, x, y));
}
