import type { ChartShapeStyle } from './model.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';
import { chartMarksBounds, chartShapeMarks } from './shape-scene.ts';
import { rotateChartText } from './text-rotation.ts';

/** Rotate the native text-box paint in its own brush coordinates alongside the rich text. */
export function chartTextBoxMarks(context: SceneContext, content: ChartMark[], style: ChartShapeStyle | undefined, angle: number | undefined, padding = { x: 3, y: 2 }): ChartMark[] {
  const bounds = chartMarksBounds(context, content);
  if (!bounds) return content;
  const shape = chartShapeMarks(context, { x: bounds.x - padding.x, y: bounds.y - padding.y, width: bounds.width + padding.x * 2, height: bounds.height + padding.y * 2 }, style);
  const paint: ChartMark[] = angle && shape.length ? [{ kind: 'group', rotation: { angle, cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2 }, marks: shape }] : shape;
  return [...paint, ...rotateChartText(context, content, angle)];
}
