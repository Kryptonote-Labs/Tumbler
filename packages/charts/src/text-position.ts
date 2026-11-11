import type { ChartManualLayout } from './manual-layout.ts';
import { chartManualRect } from './manual-layout.ts';
import { chartMarksBounds } from './shape-scene.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

/** Office fits chart text to its content; manual x/y move the fitted box without scaling its glyphs. */
export function positionChartText(context: SceneContext, marks: ChartMark[], layout: ChartManualLayout | undefined): ChartMark[] {
  if (!layout) return marks;
  const bounds = chartMarksBounds(context, marks);
  if (!bounds) return marks;
  const frame = context.textFrame ?? { x: 0, y: 0, width: context.width, height: context.height };
  const automatic = { ...bounds, x: bounds.x + frame.x, y: bounds.y + frame.y };
  const { width: _width, height: _height, ...position } = layout;
  const target = chartManualRect(position, automatic, frame.width, frame.height);
  const x = target.x - automatic.x, y = target.y - automatic.y;
  return marks.map(original => {
    let mark = original;
    if (mark.fillGradient) mark = { ...mark, fillGradient: { ...mark.fillGradient, bounds: { ...mark.fillGradient.bounds, x: mark.fillGradient.bounds.x + x, y: mark.fillGradient.bounds.y + y } } };
    if (mark.fillPicture) mark = { ...mark, fillPicture: { ...mark.fillPicture, bounds: { ...mark.fillPicture.bounds, x: mark.fillPicture.bounds.x + x, y: mark.fillPicture.bounds.y + y } } };
    if (mark.fillPattern) mark = { ...mark, fillPattern: { ...mark.fillPattern, bounds: { ...mark.fillPattern.bounds, x: mark.fillPattern.bounds.x + x, y: mark.fillPattern.bounds.y + y } } };
    return mark.kind === 'text' || mark.kind === 'rect' ? { ...mark, x: mark.x + x, y: mark.y + y }
      : mark.kind === 'line' ? { ...mark, x1: mark.x1 + x, x2: mark.x2 + x, y1: mark.y1 + y, y2: mark.y2 + y } : mark;
  });
}
